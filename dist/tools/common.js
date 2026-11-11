import { DartError } from '../core/bridge.js';
import { TaskManagerError } from '../core/tasks.js';
import { SourceError } from '../sources/registry.js';
import { toJson } from '../util/json.js';
import { PathViolation, UrlViolation } from '../util/paths.js';
import { RobotsDenied } from '../util/http.js';
/**
 * Every tool returns a *canonical lossless JSON value* (requirement #4/#12).
 * We declare the root as the annotation-only `json` schema: the DSL compiles it
 * to `{}`, which accepts any JSON value while still enforcing losslessness and
 * letting PTC mode re-enter the normal tool pipeline with a typed result.
 */
export const CANONICAL_SCHEMA = { type: 'json' };
/** Domain values -> lossless JSON, stripping undefined/class instances. */
export function canonical(value) {
    return toJson(value);
}
/** Fresh output projection for one tool definition (never mutate after register). */
export function jsonOutput() {
    return {
        schema: CANONICAL_SCHEMA,
        render: (_args, value) => [{
                type: 'text',
                text: JSON.stringify(value, null, 2),
            }],
    };
}
/** Map internal errors to stable, agent-readable codes. */
export function classifyError(error) {
    if (error instanceof DartError) {
        return { code: error.code, message: error.message, retryable: error.retryable };
    }
    if (error instanceof TaskManagerError) {
        return { code: error.code, message: error.message, retryable: false };
    }
    if (error instanceof SourceError) {
        return { code: error.code, message: error.message, retryable: false };
    }
    if (error instanceof RobotsDenied) {
        return { code: error.code, message: error.message, retryable: false };
    }
    if (error instanceof PathViolation || error instanceof UrlViolation) {
        return { code: 'UNSAFE_PATH', message: String(error.message), retryable: false };
    }
    const message = error instanceof Error ? error.message : String(error);
    // resolveBook() throws plain `CODE: detail` errors; keep the code machine readable.
    const match = /^([A-Z][A-Z0-9_]{2,}):\s*([\s\S]*)$/.exec(message);
    if (match)
        return { code: match[1], message: match[2].trim() || match[1], retryable: false };
    return { code: 'INTERNAL_ERROR', message, retryable: false };
}
/**
 * Uniform tool envelope: wait for plugin init, then either return the domain
 * result or a structured `{ ok: false, error }` value.
 *
 * Returning a canonical error value (instead of throwing) is deliberate: the
 * agent can read `error.code`, correct its arguments and try again without the
 * runtime marking the whole tool as a broken infrastructure call.
 */
export async function runTool(runtime, scope, fn) {
    try {
        await runtime.ready();
        return canonical(await fn());
    }
    catch (error) {
        const failure = classifyError(error);
        runtime.logger.warn(scope, 'tool_failed', { ...failure });
        return canonical({ ok: false, error: failure });
    }
}
export function ok(value) {
    return { ok: true, ...value };
}
//# sourceMappingURL=common.js.map