import type { Context } from '@deepseek-ai/cordis';
import type { PluginRuntime } from '../runtime.js';
/**
 * Requirement #8/#9: every download task is queryable, cancellable and
 * retryable, with persisted progress and the chapters/volumes actually written.
 * `logs` exposes the structured JSONL ring buffer for diagnosis.
 */
export declare function registerNovelTasks(ctx: Context, runtime: PluginRuntime): void;
