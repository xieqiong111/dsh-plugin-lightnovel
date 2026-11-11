import { defineTool } from '@deepseek-ai/dsh-tools';
import { jsonOutput, ok, runTool } from './common.js';
/** Step 3 of the closed loop: list volumes + chapters so the agent can choose. */
export function registerNovelVolumes(ctx, runtime) {
    ctx.tools.register(defineTool({
        name: 'novel_volumes',
        description: [
            'List all volumes and their chapters for one book, using the original Dart catalogue scraper.',
            'Each volume has a 1-based `index`, `name`, `cover` and `chapterCount`; chapters have name and url.',
            'Pass the 1-based indices (e.g. "1,2,5") or exact volume names to novel_download.',
        ].join(' '),
        parameters: {
            bookId: { type: 'string', description: 'Book id from novel_search. Provide this or url.' },
            url: { type: 'string', description: 'Canonical detail page URL on an enabled source.' },
            source: { type: 'string', description: 'Optional source id hint.' },
            includeChapters: {
                type: 'boolean',
                description: 'Include chapter names/URLs in each volume (default true; set false for a compact list).',
            },
        },
        output: jsonOutput(),
        async execute(args) {
            return runTool(runtime, 'novel_volumes', async () => {
                if (!args.bookId && !args.url) {
                    return { ok: false, error: { code: 'EMPTY_BOOK_REFERENCE', message: 'Provide bookId or url.' } };
                }
                const result = await runtime.novels.volumes({ bookId: args.bookId, url: args.url, source: args.source });
                const volumes = (args.includeChapters ?? true)
                    ? result.volumes
                    : result.volumes.map(({ index, name, cover, chapterCount }) => ({ index, name, cover, chapterCount }));
                return ok({
                    novel: result.novel,
                    volumes,
                    totalVolumes: result.totalVolumes,
                    totalChapters: result.totalChapters,
                    nextStep: `Call novel_download with bookId "${result.novel.id}" and volumes "1" (or "all", or "1,2").`,
                });
            });
        },
    }));
}
//# sourceMappingURL=novel-volumes.js.map