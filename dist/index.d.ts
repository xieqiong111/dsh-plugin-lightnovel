import type { Context } from '@deepseek-ai/cordis';
import type { Config, ResolvedConfig } from './config.js';
/**
 * DeepSeek Harness / Cordis native plugin.
 *
 * The Cordis loader reads the `Config` schema (Standard Schema / Schemastery),
 * validates the patch row's config, then calls `apply(ctx, config)`. Everything
 * the plugin owns is created inside `apply` and released through `ctx.effect`,
 * so unloading / HMR leaves no timers, child processes or tool registrations.
 */
export declare const name = "dsh-plugin-lightnovel";
export declare const inject: string[];
export { Config, resolveConfig } from './config.js';
export type { ResolvedConfig } from './config.js';
/** Derive the fully-resolved config once, shared by tests and apply(). */
export declare function resolve(config: Config): ResolvedConfig;
export declare function apply(ctx: Context, config: Config): void;
