import type { ResolvedConfig } from '../config.js';
import type { DartBridge } from './bridge.js';
import type { LocalIndex } from '../sources/local-index.js';
import type { SourceRegistry } from '../sources/registry.js';
import type { NovelDetail, VolumeDetail } from '../types.js';
import type { Logger } from '../util/logger.js';
export interface DetailsResult {
    novel: NovelDetail;
    raw: Record<string, unknown>;
}
export interface VolumesResult {
    novel: NovelDetail;
    volumes: VolumeDetail[];
    totalVolumes: number;
    totalChapters: number;
}
export interface BookReference {
    bookId?: string;
    url?: string;
    source?: string;
}
/** Details/volume reads reuse the vendored Dart scrapers through the bridge. */
export declare class NovelService {
    private readonly config;
    private readonly bridge;
    private readonly index;
    private readonly registry;
    private readonly logger;
    constructor(config: ResolvedConfig, bridge: DartBridge, index: LocalIndex, registry: SourceRegistry, logger: Logger);
    details(reference: BookReference, includeVolumes?: boolean): Promise<DetailsResult>;
    volumes(reference: BookReference): Promise<VolumesResult>;
    private mergeBook;
}
