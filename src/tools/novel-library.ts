import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { safeResolve } from '../util/paths.js'
import type { LibraryEntry } from '../types.js'
import type { PluginRuntime } from '../runtime.js'
import { jsonOutput, ok, runTool } from './common.js'

const ACTIONS = ['list', 'get', 'stats', 'verify', 'checksums', 'remove', 'status'] as const

/** Give the agent a usable absolute path while keeping the stored path relative. */
function withAbsolute(runtime: PluginRuntime, entry: LibraryEntry): Record<string, unknown> {
  return {
    ...entry,
    absolutePath: safeResolve(runtime.config.libraryDir, entry.relativePath),
  }
}

/**
 * Requirement #9: on-disk library with integrity verification. Entries expose
 * only plugin-managed relative paths; absolute paths are re-derived through
 * safeResolve so a corrupted index can never point outside the library root.
 */
export function registerNovelLibrary(ctx: Context, runtime: PluginRuntime) {
  ctx.tools.register(defineTool({
    name: 'novel_library',
    description: [
      'Browse and verify the local EPUB library produced by completed downloads. Actions: list, get, stats, verify, checksums, remove, status.',
      'Each entry has id, title, author, volumeNames, chapterCount, bytes, sha256, integrity, createdAt, taskId, relativePath and absolutePath.',
      'verify re-checks ZIP/EPUB structure and sha256 sidecars for one entry (id) or the whole library; remove deletes one entry only when confirm=true.',
      'checksums returns the sha256 sidecar lines for external verification; stats aggregates counts, bytes, chapters and integrity.',
    ].join(' '),
    parameters: {
      action: {
        type: 'string',
        description: 'One of: list (default), get, stats, verify, checksums, remove, status.',
      },
      id: { type: 'string', description: 'Library entry id (lib_...). Required for get/remove, optional for verify.' },
      query: { type: 'string', description: 'Optional case-insensitive title/author/volume filter for list.' },
      limit: { type: 'number', description: 'Max entries for list (default 20).' },
      confirm: { type: 'boolean', description: 'Must be true for the destructive remove action.' },
    },
    output: jsonOutput(),
    async execute(args) {
      return runTool(runtime, 'novel_library', async () => {
        const action = (args.action ?? 'list').trim().toLowerCase()
        if (!(ACTIONS as readonly string[]).includes(action)) {
          return { ok: false, error: { code: 'UNKNOWN_ACTION', message: `action must be one of ${ACTIONS.join(', ')}` } }
        }
        const limit = Math.min(Math.max(Math.trunc(args.limit ?? 20), 1), 200)
        const status = () => ({
          libraryDir: runtime.config.libraryDir,
          indexFile: path.join(runtime.config.libraryDir, 'index.json'),
          dartAvailable: runtime.dartAvailable,
        })

        if (action === 'status') {
          return ok({ status: { ...status(), ...runtime.status() }, stats: runtime.library.stats() })
        }
        if (action === 'stats') {
          return ok({ stats: runtime.library.stats(), status: status() })
        }
        if (action === 'checksums') {
          return ok({ checksums: await runtime.library.readChecksums() })
        }
        if (action === 'verify') {
          const results = await runtime.library.verify(args.id?.trim() || undefined)
          return ok({
            results,
            allOk: results.every((r) => r.ok),
            verified: results.length,
            nextStep: 'Use list to inspect entries whose integrity is not ok.',
          })
        }
        if (action === 'list') {
          const entries = runtime.library.list({ query: args.query?.trim(), limit })
          return ok({
            entries: entries.map((e) => withAbsolute(runtime, e)),
            total: entries.length,
            stats: runtime.library.stats(),
            status: status(),
          })
        }
        if (action === 'get') {
          const id = args.id?.trim()
          if (!id) return { ok: false, error: { code: 'ID_REQUIRED', message: 'Provide id for get.' } }
          const entry = runtime.library.get(id)
          if (!entry) return { ok: false, error: { code: 'ENTRY_NOT_FOUND', message: `No library entry with id ${id}` } }
          return ok({ entry: withAbsolute(runtime, entry) })
        }

        // remove — deliberately destructive, requires an explicit confirmation.
        const id = args.id?.trim()
        if (!id) return { ok: false, error: { code: 'ID_REQUIRED', message: 'Provide id for remove.' } }
        if (args.confirm !== true) {
          return { ok: false, error: { code: 'CONFIRM_REQUIRED', message: 'remove requires confirm=true.' } }
        }
        const removed = await runtime.library.remove(id)
        if (!removed) return { ok: false, error: { code: 'ENTRY_NOT_FOUND', message: `No library entry with id ${id}` } }
        return ok({ removed: true, id, stats: runtime.library.stats() })
      })
    },
  }))
}
