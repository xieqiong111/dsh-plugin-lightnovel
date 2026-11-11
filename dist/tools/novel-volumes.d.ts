import type { Context } from '@deepseek-ai/cordis';
import type { PluginRuntime } from '../runtime.js';
/** Step 3 of the closed loop: list volumes + chapters so the agent can choose. */
export declare function registerNovelVolumes(ctx: Context, runtime: PluginRuntime): void;
