import { defineTool } from '@deepseek-ai/dsh-tools';
import { readStudio } from '../../server/studio-reader.mjs';
import { canonical, jsonOutput, ok } from './common.js';
const MAX_PAGE_SIZE = 100;
function bounded(value, fallback, max = MAX_PAGE_SIZE) {
    return Math.min(Math.max(Math.trunc(value ?? fallback), 1), max);
}
function safeError(error) {
    if (error && typeof error === 'object') {
        const value = error;
        if (typeof value.code === 'string' && typeof value.message === 'string') {
            return {
                code: value.code,
                message: value.message,
                retryable: typeof value.retryable === 'boolean'
                    ? value.retryable
                    : typeof value.status === 'number' && value.status >= 500,
            };
        }
    }
    const message = error instanceof Error ? error.message : String(error);
    return { code: 'INTERNAL_ERROR', message, retryable: false };
}
async function runMangaTool(runtime, scope, operation) {
    try {
        await runtime.ready();
        return canonical(await operation());
    }
    catch (error) {
        const failure = safeError(error);
        runtime.logger.warn(scope, 'tool_failed', failure);
        return canonical({ ok: false, error: failure });
    }
}
function client(runtime) {
    return runtime.suwayomi;
}
function requiredId(value) {
    const id = value?.trim();
    return id ? id : null;
}
/** Register the independent manga tool family against the shared Suwayomi client. */
export function registerMangaTools(ctx, runtime, komga = runtime.mangaKomga) {
    ctx.tools.register(defineTool({
        name: 'studio_read',
        description: 'Read Studio through its scoped read-only API. Resources: health, novels, novelTasks, manga, mangaTasks, komga, komgaSeries (requires libraryId), mangaVolume (requires mangaId, optional volume).',
        parameters: {
            resource: { type: 'string', required: true, description: 'Studio resource name.' },
            libraryId: { type: 'string', description: 'Komga library ID for komgaSeries.' },
            mangaId: { type: 'string', description: 'Suwayomi manga ID for mangaVolume.' },
            volume: { type: 'number', description: 'Optional volume number.' },
        },
        output: jsonOutput(),
        async execute(args) {
            return runMangaTool(runtime, 'studio_read', async () => ok({ data: await readStudio({
                    ...args, url: process.env.LN_STUDIO_READ_URL, tokenFile: process.env.LN_STUDIO_READ_TOKEN_FILE,
                }) }));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'manga_komga_status',
        description: 'Read recognisable manga volumes, actual Suwayomi chapter download progress, and the exported CBZ filename in the Komga directory. Pass a volume number for a single volume.',
        parameters: {
            mangaId: { type: 'string', required: true, description: 'Suwayomi manga id from manga_search.' },
            volume: { type: 'number', description: 'Optional volume number.' },
        },
        output: jsonOutput(),
        async execute(args) {
            return runMangaTool(runtime, 'manga_komga_status', async () => ok(await komga.status(args.mangaId.trim(), args.volume)));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'manga_komga_download',
        description: 'Queue one explicitly selected manga volume for automatic CBZ export into the Komga library directory. Use manga_komga_status to find volume numbers and track the result.',
        parameters: {
            mangaId: { type: 'string', required: true, description: 'Suwayomi manga id from manga_search.' },
            volume: { type: 'number', required: true, description: 'Volume number returned by manga_komga_status.' },
        },
        output: jsonOutput(),
        async execute(args) {
            return runMangaTool(runtime, 'manga_komga_download', async () => {
                const result = await komga.download(args.mangaId.trim(), args.volume);
                if (result.unconfirmed?.length) {
                    return { ...result, ok: false, error: {
                            code: 'MANGA_DOWNLOAD_UNCONFIRMED',
                            message: 'Check manga_komga_status for the unconfirmed chapters.',
                            retryable: false,
                        } };
                }
                return ok(result);
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'manga_search',
        description: [
            'Search manga through the configured Suwayomi server and its installed sources.',
            'Use the returned manga id with manga_details, manga_chapters, manga_download, or manga_subscribe.',
            'Search types are SEARCH, POPULAR, and LATEST; pagination is one-based.',
        ].join(' '),
        parameters: {
            query: { type: 'string', description: 'Optional search phrase; required for SEARCH and ignored for POPULAR/LATEST.' },
            sourceId: { type: 'string', description: 'Optional Suwayomi source id to limit the search.' },
            type: { type: 'string', description: 'SEARCH (default), POPULAR, or LATEST.' },
            page: { type: 'number', description: 'One-based source page (default 1).' },
            offset: { type: 'number', description: 'Within an upstream page, reuse nextOffset from the previous result (default 0).' },
            resultId: { type: 'string', description: 'Reuse resultId when requesting a nonzero offset on the same page.' },
            limit: { type: 'number', description: 'Maximum results to return (1-50, default 20).' },
        },
        output: jsonOutput(),
        async execute(args) {
            return runMangaTool(runtime, 'manga_search', async () => {
                const type = (args.type ?? 'SEARCH').trim().toUpperCase();
                if (!['SEARCH', 'POPULAR', 'LATEST'].includes(type)) {
                    return { ok: false, error: { code: 'UNKNOWN_SEARCH_TYPE', message: 'type must be SEARCH, POPULAR, or LATEST.' } };
                }
                const query = args.query?.trim() ?? '';
                if (type === 'SEARCH' && !query) {
                    return { ok: false, error: { code: 'QUERY_REQUIRED', message: 'Provide query for SEARCH.' } };
                }
                const result = await client(runtime).searchManga({
                    query,
                    sourceId: args.sourceId?.trim() || undefined,
                    type: type,
                    page: Math.max(Math.trunc(args.page ?? 1), 1),
                    offset: Math.max(Math.trunc(args.offset ?? 0), 0),
                    resultId: args.resultId?.trim() || undefined,
                    limit: bounded(args.limit, 20, 50),
                });
                return ok({ ...result });
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'manga_details',
        description: 'Get normalized metadata for one manga from the configured Suwayomi server. Provide the id from manga_search or manga_library.',
        parameters: { mangaId: { type: 'string', required: true, description: 'Suwayomi manga id.' } },
        output: jsonOutput(),
        async execute(args) {
            return runMangaTool(runtime, 'manga_details', async () => {
                const mangaId = requiredId(args.mangaId);
                if (!mangaId)
                    return { ok: false, error: { code: 'MANGA_ID_REQUIRED', message: 'Provide mangaId.' } };
                return ok({ manga: await client(runtime).getManga(mangaId) });
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'manga_chapters',
        description: 'List chapters for a manga, including chapter ids, read/download state, page count, and upload date. Pass returned chapter ids to manga_download.',
        parameters: {
            mangaId: { type: 'string', required: true, description: 'Suwayomi manga id.' },
            limit: { type: 'number', description: 'Maximum chapters to return (1-100, default 50).' },
            offset: { type: 'number', description: 'Zero-based chapter offset (default 0).' },
        },
        output: jsonOutput(),
        async execute(args) {
            return runMangaTool(runtime, 'manga_chapters', async () => {
                const mangaId = requiredId(args.mangaId);
                if (!mangaId)
                    return { ok: false, error: { code: 'MANGA_ID_REQUIRED', message: 'Provide mangaId.' } };
                const result = await client(runtime).getChapters(mangaId, {
                    limit: bounded(args.limit, 50),
                    offset: Math.max(Math.trunc(args.offset ?? 0), 0),
                });
                return ok({ ...result });
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'manga_download',
        description: [
            'Queue explicitly selected Suwayomi chapters for download.',
            'This only enqueues chapter downloads; it does not fetch page images into this DSH process.',
            'Provide the parent manga id and chapter ids from manga_chapters, then use manga_tasks to inspect or dequeue them.',
        ].join(' '),
        parameters: {
            mangaId: { type: 'string', required: true, description: 'Suwayomi manga id that owns all selected chapters.' },
            chapterIds: {
                type: 'array', required: true, items: { type: 'string' },
                description: 'Chapter ids returned by manga_chapters. Select only the chapters to enqueue.',
            },
        },
        output: jsonOutput(),
        async execute(args) {
            return runMangaTool(runtime, 'manga_download', async () => {
                const mangaId = requiredId(args.mangaId);
                if (!mangaId)
                    return { ok: false, error: { code: 'MANGA_ID_REQUIRED', message: 'Provide mangaId.' } };
                const chapterIds = [...new Set((args.chapterIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
                if (chapterIds.length === 0) {
                    return { ok: false, error: { code: 'CHAPTER_IDS_REQUIRED', message: 'Provide one or more chapterIds from manga_chapters.' } };
                }
                const result = await client(runtime).download({ mangaId, chapterIds });
                if (result.unconfirmed?.length) {
                    return {
                        ...result,
                        ok: false,
                        error: {
                            code: 'MANGA_DOWNLOAD_UNCONFIRMED',
                            message: 'Suwayomi did not confirm every chapter. Check manga_tasks and manga_chapters.',
                            retryable: false,
                        },
                    };
                }
                return ok({ ...result });
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'manga_tasks',
        description: [
            'Inspect the Suwayomi download queue or cancel queued chapters.',
            'Actions are status (default), list, and cancel. Cancel requires chapterIds from the queue.',
        ].join(' '),
        parameters: {
            action: { type: 'string', description: 'status (default), list, or cancel.' },
            chapterIds: { type: 'array', items: { type: 'string' }, description: 'Chapter ids to dequeue; required for cancel.' },
        },
        output: jsonOutput(),
        async execute(args) {
            return runMangaTool(runtime, 'manga_tasks', async () => {
                const action = (args.action ?? 'status').trim().toLowerCase();
                if (!['status', 'list', 'cancel'].includes(action)) {
                    return { ok: false, error: { code: 'UNKNOWN_ACTION', message: 'action must be status, list, or cancel.' } };
                }
                const chapterIds = [...new Set((args.chapterIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
                if (action === 'cancel' && chapterIds.length === 0) {
                    return { ok: false, error: { code: 'CHAPTER_IDS_REQUIRED', message: 'Provide chapterIds to cancel.' } };
                }
                return ok({ ...(await client(runtime).tasks({ action: action, chapterIds })) });
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'manga_library',
        description: 'List manga currently in the Suwayomi library. Results are paginated; use manga_subscribe to add or remove an item.',
        parameters: {
            limit: { type: 'number', description: 'Maximum manga to return (1-100, default 50).' },
            offset: { type: 'number', description: 'Zero-based result offset (default 0).' },
        },
        output: jsonOutput(),
        async execute(args) {
            return runMangaTool(runtime, 'manga_library', async () => {
                return ok({ ...(await client(runtime).library({
                        limit: bounded(args.limit, 50),
                        offset: Math.max(Math.trunc(args.offset ?? 0), 0),
                    })) });
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'manga_sources',
        description: 'List sources installed in Suwayomi, including source ids and languages. Use a source id with manga_search.',
        parameters: {},
        output: jsonOutput(),
        async execute() {
            return runMangaTool(runtime, 'manga_sources', async () => ok({ ...(await client(runtime).sources()) }));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'manga_subscribe',
        description: [
            'Add a manga to or remove it from the Suwayomi library using the server’s in-library flag.',
            'Suwayomi exposes library membership here, not a separate recurring subscription schedule.',
        ].join(' '),
        parameters: {
            mangaId: { type: 'string', required: true, description: 'Suwayomi manga id from manga_search or manga_details.' },
            inLibrary: { type: 'boolean', required: true, description: 'true adds it to the library; false removes it.' },
        },
        output: jsonOutput(),
        async execute(args) {
            return runMangaTool(runtime, 'manga_subscribe', async () => {
                const mangaId = requiredId(args.mangaId);
                if (!mangaId)
                    return { ok: false, error: { code: 'MANGA_ID_REQUIRED', message: 'Provide mangaId.' } };
                return ok({ manga: await client(runtime).setLibrary({ mangaId, inLibrary: args.inLibrary }) });
            });
        },
    }));
}
//# sourceMappingURL=manga.js.map