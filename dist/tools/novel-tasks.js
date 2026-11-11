import { defineTool } from '@deepseek-ai/dsh-tools';
import { jsonOutput, ok, runTool } from './common.js';
const ACTIONS = ['list', 'get', 'cancel', 'retry', 'logs', 'status'];
const STATES = ['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'];
/**
 * Requirement #8/#9: every download task is queryable, cancellable and
 * retryable, with persisted progress and the chapters/volumes actually written.
 * `logs` exposes the structured JSONL ring buffer for diagnosis.
 */
export function registerNovelTasks(ctx, runtime) {
    ctx.tools.register(defineTool({
        name: 'novel_tasks',
        description: [
            'Manage background EPUB download tasks. Actions: list, get, cancel, retry, logs, status.',
            'Use get/list to read progress: state, percent, phase, volumesDone/Total, chaptersDone/Total, currentVolume, currentChapter,',
            'plus the actual downloadedChapters, downloadedVolumes and EPUB artifacts (path, sha256, bytes, integrity).',
            'cancel aborts a queued or running task cooperatively; retry re-queues a failed/cancelled/interrupted task.',
            'status returns plugin diagnostics (Dart core availability, enabled sources, dirs); logs returns recent structured log entries.',
        ].join(' '),
        parameters: {
            action: {
                type: 'string',
                description: 'One of: list (default), get, cancel, retry, logs, status.',
            },
            taskId: { type: 'string', description: 'Task id returned by novel_download. Required for get/cancel/retry.' },
            state: {
                type: 'string',
                description: 'Optional list filter: queued | running | completed | failed | cancelled | interrupted.',
            },
            limit: { type: 'number', description: 'Max tasks (list) or log entries (logs), default 20.' },
        },
        output: jsonOutput(),
        async execute(args) {
            return runTool(runtime, 'novel_tasks', async () => {
                const action = (args.action ?? 'list').trim().toLowerCase();
                if (!ACTIONS.includes(action)) {
                    return { ok: false, error: { code: 'UNKNOWN_ACTION', message: `action must be one of ${ACTIONS.join(', ')}` } };
                }
                const limit = Math.min(Math.max(Math.trunc(args.limit ?? 20), 1), 200);
                if (action === 'status') {
                    return ok({ status: runtime.status() });
                }
                if (action === 'logs') {
                    return ok({ logs: runtime.logger.recent(limit) });
                }
                if (action === 'list') {
                    const requestedState = args.state?.trim().toLowerCase();
                    if (requestedState && !STATES.includes(requestedState)) {
                        return { ok: false, error: { code: 'UNKNOWN_STATE', message: `state must be one of ${STATES.join(', ')}` } };
                    }
                    const tasks = runtime.tasks.list({ state: requestedState, limit });
                    return ok({
                        tasks,
                        total: tasks.length,
                        counts: Object.fromEntries(STATES.map((s) => [s, runtime.tasks.list({ state: s, limit: 200 }).length])),
                        nextStep: 'Use action="get" with a taskId for full progress and artifacts.',
                    });
                }
                // get / cancel / retry all require a task id.
                const taskId = args.taskId?.trim();
                if (!taskId) {
                    return { ok: false, error: { code: 'TASK_ID_REQUIRED', message: 'Provide taskId for this action.' } };
                }
                if (action === 'get') {
                    const task = runtime.tasks.get(taskId);
                    if (!task)
                        return { ok: false, error: { code: 'TASK_NOT_FOUND', message: `No task with id ${taskId}` } };
                    return ok({ task });
                }
                if (action === 'cancel') {
                    const task = await runtime.tasks.cancel(taskId);
                    return ok({ task, nextStep: 'Use action="retry" to re-queue this task later.' });
                }
                const task = await runtime.tasks.retry(taskId);
                return ok({ task, nextStep: `Poll action="get" with taskId="${task.id}".` });
            });
        },
    }));
}
//# sourceMappingURL=novel-tasks.js.map