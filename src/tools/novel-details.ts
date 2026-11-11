import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PluginRuntime } from '../runtime.js'
import { jsonOutput, ok, runTool } from './common.js'

/** Step 2 of the closed loop: inspect one book before choosing volumes. */
export function registerNovelDetails(ctx: Context, runtime: PluginRuntime) {
  ctx.tools.register(defineTool({
    name: 'novel_details',
    description: [
      'Get full structured details for one light novel: title, aliases, author, cover, description, tags, publisher,',
      'source, canonical source URL, update status, last update time and volume summary.',
      'Accepts the `id` returned by novel_search as bookId, a source detail page URL, or a `sourceId:bookId` pair.',
      'Uses the original Dart scraper through the headless bridge (no interactive prompts).',
    ].join(' '),
    parameters: {
      bookId: {
        type: 'string',
        description: 'Book id from novel_search, e.g. "bilinovel:1234" or "fixture:demo". Provide this or url.',
      },
      url: {
        type: 'string',
        description: 'Canonical detail page URL on an enabled source. Provide this or bookId.',
      },
      source: {
        type: 'string',
        description: 'Optional source id hint (bilinovel / wenku8 / fixture).',
      },
      includeVolumes: {
        type: 'boolean',
        description: 'Fetch the volume list at the same time (default false; use novel_volumes for full chapter lists).',
      },
    },
    output: jsonOutput(),
    async execute(args) {
      return runTool(runtime, 'novel_details', async () => {
        if (!args.bookId && !args.url) {
          return { ok: false, error: { code: 'EMPTY_BOOK_REFERENCE', message: 'Provide bookId or url.' } }
        }
        const result = await runtime.novels.details(
          { bookId: args.bookId, url: args.url, source: args.source },
          args.includeVolumes ?? false,
        )
        return ok({
          novel: result.novel,
          raw: result.raw,
          nextStep: `Call novel_volumes with bookId "${result.novel.id}" to list selectable volumes and chapters.`,
        })
      })
    },
  }))
}
