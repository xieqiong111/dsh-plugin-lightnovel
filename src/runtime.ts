import { mkdir } from 'node:fs/promises'
import type { ResolvedConfig } from './config.js'
import { DartBridge } from './core/bridge.js'
import { Library } from './core/library.js'
import { NovelService } from './core/novel-service.js'
import { TaskStore } from './core/store.js'
import { TaskManager } from './core/tasks.js'
import { SearchEngine } from './search.js'
import { LocalIndex } from './sources/local-index.js'
import { SourceRegistry } from './sources/registry.js'
import type { SourceContext } from './sources/types.js'
import { PoliteFetcher } from './util/http.js'
import type { Logger } from './util/logger.js'

/**
 * Owns every long-lived object of one plugin instance.
 *
 * Cordis disposes the whole fiber on unload/HMR, so all of these are created
 * inside `apply()` and released through `dispose()` — no module-level state.
 */
export class PluginRuntime {
  readonly logger: Logger
  readonly fetcher: PoliteFetcher
  readonly registry: SourceRegistry
  readonly index: LocalIndex
  readonly bridge: DartBridge
  readonly store: TaskStore
  readonly library: Library
  readonly tasks: TaskManager
  readonly search: SearchEngine
  readonly novels: NovelService

  private initPromise: Promise<void> | null = null
  private dartStatus: { available: boolean; runner: string | null; reason?: string } = {
    available: false,
    runner: null,
    reason: 'not probed yet',
  }

  constructor(readonly config: ResolvedConfig, logger: Logger) {
    this.logger = logger
    this.fetcher = new PoliteFetcher({
      userAgent: config.userAgent,
      minIntervalMs: config.requestIntervalMs,
      timeoutMs: config.searchTimeoutMs,
      respectRobots: config.respectRobots,
      logger,
    })
    this.registry = new SourceRegistry(config, logger)
    this.index = new LocalIndex(config.indexPath, logger)
    this.bridge = new DartBridge(config, logger)
    this.store = new TaskStore(config.tasksDir, logger)
    this.library = new Library(config.libraryDir, logger)

    const sourceContext: SourceContext = { config, fetcher: this.fetcher, logger }
    this.search = new SearchEngine(config, this.registry, this.index, sourceContext, logger)
    this.novels = new NovelService(config, this.bridge, this.index, this.registry, logger)
    this.tasks = new TaskManager(config, this.store, this.bridge, this.library, this.registry, logger)
  }

  /** Idempotent, awaited by every tool before its first operation. */
  init(): Promise<void> {
    this.initPromise ??= this.doInit()
    return this.initPromise
  }

  ready(): Promise<void> {
    return this.init()
  }

  private async doInit(): Promise<void> {
    await Promise.all([
      mkdir(this.config.dataDir, { recursive: true }),
      mkdir(this.config.tasksDir, { recursive: true }),
      mkdir(this.config.logsDir, { recursive: true }),
      mkdir(this.config.libraryDir, { recursive: true }),
    ])
    await this.index.load()
    this.dartStatus = await this.bridge.probe()
    if (!this.dartStatus.available) {
      this.logger.warn('plugin', 'dart_core_unavailable', {
        reason: this.dartStatus.reason,
        hint: 'search/details will still work from the local index; downloads need the Dart core',
      })
    }
    await this.tasks.init()
    this.logger.info('plugin', 'ready', {
      dataDir: this.config.dataDir,
      libraryDir: this.config.libraryDir,
      sources: this.registry.describe().map((s) => s.id),
      searchMode: this.config.searchMode,
      offlineOnly: this.config.offlineOnly,
      dart: this.dartStatus,
      interruptedTasks: this.store.list().filter((t) => t.state === 'interrupted').length,
    })
  }

  /** True once the Dart headless runner has been located. */
  get dartAvailable(): boolean {
    return this.dartStatus.available
  }

  /** Diagnostics surfaced by `novel_tasks` / `novel_library` results. */
  status(): Record<string, unknown> {
    return {
      ok: this.dartStatus.available,
      dart: this.dartStatus,
      sources: this.registry.describe(),
      searchMode: this.config.searchMode,
      respectRobots: this.config.respectRobots,
      offlineOnly: this.config.offlineOnly,
      dataDir: this.config.dataDir,
      libraryDir: this.config.libraryDir,
      logsDir: this.config.logsDir,
      recentLogCount: this.logger.recent(500).length,
    }
  }

  async dispose(): Promise<void> {
    await this.tasks.dispose()
    this.logger.info('plugin', 'disposing', {})
    await this.logger.flush()
    await this.logger.close()
  }
}
