import { defineTool } from '@deepseek-ai/dsh-tools';
import { resolveBook } from '../search.js';
import { assertSafePublicUrl } from '../util/paths.js';
import { jsonOutput, ok, runTool } from './common.js';
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
export function registerNovelDownload(ctx, runtime) {
    ctx.tools.register(defineTool({
        name: 'novel_download',
        description: [
            'Start a background EPUB download for selected volumes of a light novel and return immediately with a taskId.',
            'This is step 4 of the closed loop: novel_search -> novel_details -> novel_volumes -> novel_download.',
            'Pass volumes as "all", 1-based indices like "1,2,5", or comma-separated exact volume names.',
            'Optionally pass volumeNames (the exact names from novel_volumes) for accurate progress reporting.',
            'Use combine=true to merge the selected volumes into one EPUB; addChapterTitle inserts chapter headings.',
            'The task supports progress query, cancellation, retry, integrity verification and records the chapters and volumes actually downloaded; poll novel_tasks with action="get".',
            'Only public sources are accepted; login, paywall and access controls are never bypassed, and per-host rate limits from the config are honoured.',
        ].join(' '),
        parameters: {
            bookId: { type: 'string', description: 'Book id from novel_search, e.g. "fixture:demo" or "bilinovel:1234". Provide this or url.' },
            url: { type: 'string', description: 'Canonical detail page URL on an enabled public source. Provide this or bookId.' },
            source: { type: 'string', description: 'Optional source id hint (bilinovel / wenku8 / fixture).' },
            volumes: {
                type: 'string',
                description: 'Volume selector: "all" (default), 1-based indices like "1,2,5", or comma-separated exact volume names.',
            },
            volumeNames: {
                type: 'array', items: { type: 'string' },
                description: 'Optional exact volume names from novel_volumes, used for accurate progress totals and recording.',
            },
            combine: { type: 'boolean', description: 'Merge all selected volumes into a single EPUB (default false, one EPUB per volume).' },
            addChapterTitle: { type: 'boolean', description: 'Insert a chapter heading into each chapter (default true).' },
        },
        output: jsonOutput(),
        async execute(args) {
            return runTool(runtime, 'novel_download', async () => {
                if (!args.bookId && !args.url) {
                    return { ok: false, error: { code: 'EMPTY_BOOK_REFERENCE', message: 'Provide bookId or url.' } };
                }
                const { book, adapter } = resolveBook(runtime.index, runtime.registry, {
                    bookId: args.bookId,
                    url: args.url,
                    source: args.source,
                });
                // Compliance: never touch a source that may require a login or payment.
                if (adapter.info.access === 'restricted') {
                    return {
                        ok: false,
                        error: {
                            code: 'RESTRICTED_SOURCE',
                            message: `Source "${adapter.info.id}" may require a login. This plugin never supplies credentials or bypasses access controls.`,
                        },
                    };
                }
                if (runtime.config.offlineOnly && book.sourceId !== 'fixture') {
                    return { ok: false, error: { code: 'OFFLINE_ONLY', message: 'offlineOnly=true permits only the fixture source.' } };
                }
                // `fixture://` is an offline, deterministic, network-free reference.
                // Everything else must be a public http(s) URL on the adapter's hosts.
                if (!book.sourceUrl.startsWith('fixture://')) {
                    assertSafePublicUrl(book.sourceUrl, adapter.hosts);
                }
                const selector = (args.volumes ?? 'all').trim() || 'all';
                const explicitNames = Array.isArray(args.volumeNames)
                    ? args.volumeNames.map((name) => String(name).trim()).filter(Boolean)
                    : [];
                const volumeNames = explicitNames.length > 0
                    ? explicitNames
                    : selector === 'all' ? [] : selector.split(',').map((t) => t.trim()).filter(Boolean);
                const declaredCount = volumeNames.length;
                if (declaredCount > runtime.config.maxVolumesPerTask) {
                    return {
                        ok: false,
                        error: {
                            code: 'TOO_MANY_VOLUMES',
                            message: `${declaredCount} volumes requested but maxVolumesPerTask=${runtime.config.maxVolumesPerTask}. Narrow the selection.`,
                        },
                    };
                }
                const request = {
                    bookId: book.id,
                    sourceId: book.sourceId,
                    source: book.source,
                    sourceUrl: book.sourceUrl,
                    title: book.title,
                    author: book.author,
                    volumes: selector,
                    volumeNames,
                    combine: args.combine ?? false,
                    addChapterTitle: args.addChapterTitle ?? true,
                };
                const task = await runtime.tasks.start(request);
                return ok({
                    taskId: task.id,
                    task,
                    queued: true,
                    nextStep: `Poll novel_tasks with action="get" and taskId="${task.id}" until state is completed/failed; then use novel_library to list the verified EPUB.`,
                });
            });
        },
    }));
}
//# sourceMappingURL=novel-download.js.map