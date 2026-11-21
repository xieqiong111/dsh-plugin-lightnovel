import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { callStudioMetadata } from '../../server/studio-metadata-client.mjs'
import type { PluginRuntime } from '../runtime.js'
import { jsonOutput, ok, runTool } from './common.js'

export function registerBangumiKomga(ctx: Context, runtime: PluginRuntime) {
  ctx.tools.register(defineTool({
    name: 'komga_bangumi_metadata',
    description: 'Search Bangumi for novel or manga metadata, preview changes for one Komga series or book, and apply the preview after user confirmation. Use studio_read to find Komga libraries and series. Search results are candidates and do not update Komga.',
    parameters: {
      action: { type: 'string', required: true, description: 'search: find Bangumi candidates; books: list a Komga series’s volumes; preview: compare one target and subject; apply: write an approved preview.' },
      kind: { type: 'string', description: 'novel or manga; required for search and preview.' },
      scope: { type: 'string', description: 'series or book; required for search and preview.' },
      query: { type: 'string', description: 'Bangumi title search text.' },
      seriesId: { type: 'string', description: 'Komga series ID for books and preview.' },
      bookId: { type: 'string', description: 'Komga book ID for a single-book preview.' },
      page: { type: 'number', description: 'Zero-based page for books.' },
      subjectId: { type: 'number', description: 'Explicitly selected Bangumi subject ID for preview.' },
      previewId: { type: 'string', description: 'ID returned by preview. Required for apply.' },
    },
    output: jsonOutput(),
    execute({ action, ...body }) {
      return runTool(runtime, 'komga_bangumi_metadata', async () => ok({
        data: await callStudioMetadata(action, body, {
          url: process.env.LN_STUDIO_METADATA_URL || process.env.LN_STUDIO_READ_URL,
          tokenFile: process.env.LN_STUDIO_METADATA_TOKEN_FILE,
        }),
      }))
    },
  }))
}
