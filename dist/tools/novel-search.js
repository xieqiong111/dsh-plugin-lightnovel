import { defineTool } from '@deepseek-ai/dsh-tools';
import { jsonOutput, ok, runTool } from './common.js';
/**
 * Requirement #3/#4: multi-source keyword search with alias/author matching and
 * traditional<->simplified Chinese normalisation. Every hit carries a uniform
 * set of fields so the agent never has to parse a source-specific page.
 */
export function registerNovelSearch(ctx, runtime) {
    ctx.tools.register(defineTool({
        name: 'novel_search',
        description: [
            'Search light novels across the enabled public book sources by title, alias, author or tag.',
            'Traditional and Simplified Chinese queries are matched, and results are ranked and deduplicated.',
            'Returns structured hits containing title, author, coverUrl, description, source, sourceUrl, status/statusText, lastUpdated, volumeCount, tags and score.',
            'Use the returned `id` (sourceId:bookId) with novel_details, novel_volumes and novel_download.',
            'Only public pages are accessed, with robots.txt and per-host rate limits honoured.',
        ].join(' '),
        parameters: {
            query: {
                type: 'string', required: true,
                description: 'Keyword: novel title, alias, author or tag. Traditional/Simplified Chinese both work.',
            },
            sources: {
                type: 'array', items: { type: 'string' },
                description: 'Optional source ids to query, e.g. ["bilinovel", "fixture"]. Defaults to all enabled sources.',
            },
            status: {
                type: 'string',
                description: 'Optional update-status filter: ongoing | completed | unknown (also accepts 连载中 / 已完结).',
            },
            limit: { type: 'number', description: 'Maximum number of hits (1-50, default 10).' },
            refresh: {
                type: 'boolean',
                description: 'Force a live source query even when the local index already has matches (default false).',
            },
        },
        output: jsonOutput(),
        async execute(args) {
            return runTool(runtime, 'novel_search', async () => {
                const outcome = await runtime.search.search({
                    query: args.query,
                    sources: args.sources,
                    status: args.status,
                    limit: args.limit,
                    refresh: args.refresh,
                });
                return ok({
                    ...outcome,
                    nextStep: outcome.results.length > 0
                        ? `Call novel_details with bookId "${outcome.results[0].id}" to see volumes.`
                        : 'No matches. Try a shorter title, an alias, the author name, or searchMode=hybrid with refresh=true.',
                });
            });
        },
    }));
}
//# sourceMappingURL=novel-search.js.map