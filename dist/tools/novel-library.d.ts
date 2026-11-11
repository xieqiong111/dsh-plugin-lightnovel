import type { Context } from '@deepseek-ai/cordis';
import type { PluginRuntime } from '../runtime.js';
/**
 * Requirement #9: on-disk library with integrity verification. Entries expose
 * only plugin-managed relative paths; absolute paths are re-derived through
 * safeResolve so a corrupted index can never point outside the library root.
 */
export declare function registerNovelLibrary(ctx: Context, runtime: PluginRuntime): void;
