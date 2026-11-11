import type { ResolvedConfig } from '../config.js'
import type { Logger } from '../util/logger.js'
import { FixtureSourceAdapter } from './fixture.js'
import { biliNovelAdapter, wenku8Adapter } from './live.js'
import type { SourceAdapter, SourceInfo } from './types.js'

export class SourceRegistry {
  readonly all: readonly SourceAdapter[]
  readonly enabled: readonly SourceAdapter[]
  private readonly byId: Map<string, SourceAdapter>

  constructor(config: ResolvedConfig, logger: Logger) {
    this.all = [biliNovelAdapter, wenku8Adapter, new FixtureSourceAdapter()]
    const requested = config.offlineOnly
      ? ['fixture']
      : config.enabledSources.length > 0
        ? config.enabledSources
        : ['bilinovel', 'fixture']
    const enabled: SourceAdapter[] = []
    for (const id of requested) {
      const adapter = this.all.find((s) => s.info.id === id)
      if (!adapter) {
        logger.warn('sources', 'unknown_source', { id })
        continue
      }
      if (adapter.info.access === 'restricted' && !config.allowNonPublicSources) {
        logger.warn('sources', 'restricted_source_disabled', {
          id,
          reason: 'set allowNonPublicSources=true to enable; credentials are never used',
        })
        continue
      }
      enabled.push(adapter)
    }
    if (enabled.length === 0) enabled.push(this.all[this.all.length - 1]!)
    this.enabled = enabled
    this.byId = new Map(this.all.map((s) => [s.info.id, s]))
  }

  get(id: string): SourceAdapter | undefined {
    return this.byId.get(id)
  }

  /** Reject unknown/disabled sources before any book id is accepted. */
  requireEnabled(id: string): SourceAdapter {
    const adapter = this.byId.get(id)
    if (!adapter) throw new SourceError('UNKNOWN_SOURCE', `Unknown source: ${id}`)
    if (!this.enabled.some((s) => s.info.id === id)) {
      throw new SourceError('SOURCE_DISABLED', `Source "${id}" is not enabled in this profile`)
    }
    return adapter
  }

  byDetailUrl(url: string): SourceAdapter | undefined {
    return this.all.find((s) => s.supportsDetailUrl(url))
  }

  describe(): SourceInfo[] {
    return this.enabled.map((s) => s.info)
  }

  /** Allowed sources for the Dart process, always excluding restricted ones by default. */
  dartAllowedSources(config: ResolvedConfig): string[] {
    const ids = this.enabled.map((s) => s.info.id)
    if (!config.allowNonPublicSources) return ids.filter((id) => id !== 'wenku8')
    return ids
  }
}

export class SourceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'SourceError'
  }
}
