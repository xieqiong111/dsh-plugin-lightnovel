import type { Context } from '@deepseek-ai/cordis';
import type { PluginRuntime } from '../runtime.js';
/**
 * Requirement #3/#4: multi-source keyword search with alias/author matching and
 * traditional<->simplified Chinese normalisation. Every hit carries a uniform
 * set of fields so the agent never has to parse a source-specific page.
 */
export declare function registerNovelSearch(ctx: Context, runtime: PluginRuntime): void;
