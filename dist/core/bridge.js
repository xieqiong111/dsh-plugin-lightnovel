import { spawn } from 'node:child_process';
import { access, constants, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
export class DartError extends Error {
    code;
    retryable;
    constructor(code, message, retryable = false) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.name = 'DartError';
    }
}
/** Spawns the *original* Dart core through its new headless entry point. */
export class DartBridge {
    config;
    logger;
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
    }
    async probe() {
        const runner = await this.resolveRunner();
        if (!runner) {
            return {
                available: false,
                runner: null,
                reason: 'No Dart executable found. Set LN_DART_BINARY (compiled bnp_headless) or install Dart 3.11+ and set LN_DART_PROJECT_DIR.',
            };
        }
        return { available: true, runner: runner.label };
    }
    async resolveRunner() {
        const explicit = this.config.dartBinary || process.env.LN_DART_BINARY;
        if (explicit)
            return { command: explicit, prefix: [], label: explicit };
        const localBuild = path.join(this.config.dartProjectDir, 'build', 'bnp_headless');
        for (const candidate of ['/opt/bnp/bnp_headless', localBuild]) {
            if (await existsExecutable(candidate))
                return { command: candidate, prefix: [], label: candidate };
        }
        const headlessScript = path.join(this.config.dartProjectDir, 'bin', 'headless.dart');
        if (!(await exists(headlessScript)))
            return null;
        const dartSdk = process.env.LN_DART_SDK;
        const dart = dartSdk ? path.join(dartSdk, 'bin', 'dart') : 'dart';
        return {
            command: dart,
            prefix: ['run', headlessScript],
            label: `${dart} run ${headlessScript}`,
        };
    }
    async run(request) {
        const runner = await this.resolveRunner();
        if (!runner) {
            throw new DartError('DART_UNAVAILABLE', (await this.probe()).reason ?? 'Dart core unavailable', true);
        }
        if (request.outputDir)
            await mkdir(request.outputDir, { recursive: true });
        const args = [...runner.prefix, request.command,
            '--source', request.sourceId,
            '--url', request.url,
            '--fixtures', this.config.fixturesDir,
            '--allowed-sources', request.allowedSources.join(','),
        ];
        if (!this.config.allowNonPublicSources)
            args.push('--require-public-sources', 'true');
        if (request.command === 'pack') {
            args.push('--output-dir', request.outputDir ?? path.join(this.config.tasksDir, 'scratch'), '--volumes', request.volumes ?? 'all', '--combine', String(request.combine ?? false), '--add-chapter-title', String(request.addChapterTitle ?? false));
            if (request.cancelFile)
                args.push('--cancel-file', request.cancelFile);
        }
        const timeout = request.timeoutMs ?? this.config.taskTimeoutMs;
        this.logger.info('bridge', 'spawn', { runner: runner.label, command: request.command, sourceId: request.sourceId, args: args.slice(-8) });
        return new Promise((resolve, reject) => {
            const child = spawn(runner.command, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env },
                cwd: this.config.dartProjectDir,
            });
            const events = [];
            let stdoutBuffer = '';
            let stderrBuffer = '';
            let settled = false;
            let killTimer = null;
            const cleanup = () => {
                if (killTimer)
                    clearTimeout(killTimer);
                killTimer = null;
                request.signal?.removeEventListener('abort', onAbort);
                clearTimeout(timeoutTimer);
            };
            const finish = (error, data) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                if (error)
                    reject(error);
                else
                    resolve({ data: data, events });
            };
            const cancelGracefully = async () => {
                if (request.cancelFile) {
                    await writeFile(request.cancelFile, 'cancel\n', 'utf8').catch(() => undefined);
                }
                if (!child.killed)
                    child.kill('SIGTERM');
                if (!killTimer) {
                    killTimer = setTimeout(() => { if (!child.killed)
                        child.kill('SIGKILL'); }, 3000);
                    killTimer.unref?.();
                }
            };
            const onAbort = () => { void cancelGracefully(); };
            request.signal?.addEventListener('abort', onAbort, { once: true });
            const timeoutTimer = setTimeout(() => {
                void cancelGracefully();
                finish(new DartError('TIMEOUT', `Dart ${request.command} exceeded ${timeout}ms`, true));
            }, timeout);
            timeoutTimer.unref?.();
            child.stdout?.setEncoding('utf8');
            child.stdout?.on('data', (chunk) => {
                stdoutBuffer += chunk;
                let newline = stdoutBuffer.indexOf('\n');
                while (newline >= 0) {
                    const line = stdoutBuffer.slice(0, newline).trim();
                    stdoutBuffer = stdoutBuffer.slice(newline + 1);
                    if (line)
                        handleLine(line);
                    newline = stdoutBuffer.indexOf('\n');
                }
            });
            child.stderr?.setEncoding('utf8');
            child.stderr?.on('data', (chunk) => {
                stderrBuffer = (stderrBuffer + chunk).slice(-8000);
            });
            child.on('error', (error) => {
                finish(new DartError('SPAWN_FAILED', `${runner.label}: ${error.message}`, true));
            });
            child.on('close', (code) => {
                if (stdoutBuffer.trim())
                    handleLine(stdoutBuffer.trim());
                if (settled)
                    return;
                if (stderrBuffer.trim())
                    this.logger.debug('bridge', 'stderr', { tail: stderrBuffer.slice(-2000) });
                finish(new DartError('DART_EXIT', `Dart ${request.command} exited with code ${code ?? 'unknown'} without a result line. ${stderrBuffer.slice(-400)}`, true));
            });
            function handleLine(line) {
                let event;
                try {
                    event = JSON.parse(line);
                }
                catch {
                    // Upstream code may occasionally print non-JSON to stdout; log, don't crash.
                    return;
                }
                events.push(event);
                if (event.type === 'progress')
                    request.onProgress?.(event);
                if (event.type === 'result')
                    finish(null, (event.data ?? {}));
                if (event.type === 'error') {
                    const code = event.code ?? 'PACK_FAILED';
                    finish(new DartError(code, event.message ?? code, code === 'PACK_FAILED' || code === 'TIMEOUT'));
                }
            }
        });
    }
}
async function exists(file) {
    try {
        await access(file, constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function existsExecutable(file) {
    try {
        await access(file, constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=bridge.js.map