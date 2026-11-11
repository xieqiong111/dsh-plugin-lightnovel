import type { Context } from '@deepseek-ai/cordis';
import type { PluginRuntime } from '../runtime.js';
/**
 * Step 4 of the closed loop: enqueue an EPUB download.
 *
 * The tool returns immediately with a durable task id; the actual scraping and
 * packing happen in the original Dart core through the background task manager.
 * Compliance is enforced here (defence in depth) as well as in the registry and
 * the Dart `--require-public-sources` flag: restricted sources are refused, the
 * detail URL must be a public http(s) URL on the adapter's host allowlist, and
 * no credential, cookie or paywall access is ever supplied.
 */
export declare function registerNovelDownload(ctx: Context, runtime: PluginRuntime): void;
