import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson, readJson } from '../util/json.js';
import { assertSafeRelative } from '../util/paths.js';
/**
 * One JSON file per task, written atomically. On restart, tasks left in
 * `running`/`queued` are marked `interrupted` so they can be retried rather
 * than silently lost (crash recovery).
 */
export class TaskStore {
    tasksDir;
    logger;
    tasks = new Map();
    chains = new Map();
    loaded = false;
    constructor(tasksDir, logger) {
        this.tasksDir = tasksDir;
        this.logger = logger;
    }
    filePath(id) {
        return path.join(this.tasksDir, `${assertSafeRelative(id)}.json`);
    }
    cancelFilePath(id) {
        return path.join(this.tasksDir, `${assertSafeRelative(id)}.cancel`);
    }
    async load() {
        if (this.loaded)
            return;
        this.loaded = true;
        let files;
        try {
            files = await readdir(this.tasksDir);
        }
        catch {
            return;
        }
        for (const file of files.filter((f) => f.endsWith('.json'))) {
            const record = await readJson(path.join(this.tasksDir, file), null);
            if (!record?.id)
                continue;
            if (record.state === 'running' || record.state === 'queued') {
                record.state = 'interrupted';
                record.error = { code: 'INTERRUPTED', message: 'Process restarted while the task was active' };
                record.updatedAt = new Date().toISOString();
                await atomicWriteJson(this.filePath(record.id), record);
                this.logger.warn('store', 'recovered_interrupted_task', { taskId: record.id });
            }
            this.tasks.set(record.id, record);
        }
    }
    list() {
        return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    get(id) {
        return this.tasks.get(id);
    }
    async create(record) {
        // Validate *before* mutating in-memory state. persist() logs write failures
        // rather than rejecting (so a full disk cannot crash a running task), which
        // would otherwise let an unsafe id be accepted in memory with no file.
        assertSafeRelative(record.id);
        await this.load();
        this.tasks.set(record.id, record);
        await this.persist(record);
        return record;
    }
    async update(id, mutate) {
        assertSafeRelative(id);
        const current = this.tasks.get(id);
        if (!current)
            throw new Error(`TASK_NOT_FOUND: ${id}`);
        const next = mutate(structuredClone(current));
        next.updatedAt = new Date().toISOString();
        this.tasks.set(id, next);
        await this.persist(next);
        return next;
    }
    async remove(id) {
        assertSafeRelative(id);
        this.tasks.delete(id);
        await rm(this.filePath(id), { force: true });
        await rm(this.cancelFilePath(id), { force: true });
    }
    persist(record) {
        const snapshot = structuredClone(record);
        const previous = this.chains.get(record.id) ?? Promise.resolve();
        const next = previous
            .catch(() => undefined)
            .then(() => atomicWriteJson(this.filePath(record.id), snapshot))
            .catch((error) => this.logger.error('store', 'persist_failed', { taskId: record.id, error: String(error) }));
        this.chains.set(record.id, next);
        return next;
    }
}
//# sourceMappingURL=store.js.map