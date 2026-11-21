import type { Context } from '@deepseek-ai/cordis';
import type { PluginRuntime } from '../runtime.js';
import type { MangaKomga } from '../../server/manga-komga.mjs';
/** Register the independent manga tool family against the shared Suwayomi client. */
export declare function registerMangaTools(ctx: Context, runtime: PluginRuntime, komga?: MangaKomga): void;
