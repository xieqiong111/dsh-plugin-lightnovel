import { FixtureSourceAdapter } from './fixture.js';
import { biliNovelAdapter, wenku8Adapter } from './live.js';
export class SourceRegistry {
    all;
    enabled;
    byId;
    constructor(config, logger) {
        this.all = [biliNovelAdapter, wenku8Adapter, new FixtureSourceAdapter()];
        const requested = config.offlineOnly
            ? ['fixture']
            : config.enabledSources.length > 0
                ? config.enabledSources
                : ['bilinovel', 'fixture'];
        const enabled = [];
        for (const id of requested) {
            const adapter = this.all.find((s) => s.info.id === id);
            if (!adapter) {
                logger.warn('sources', 'unknown_source', { id });
                continue;
            }
            if (adapter.info.access === 'restricted' && !config.allowNonPublicSources) {
                logger.warn('sources', 'restricted_source_disabled', {
                    id,
                    reason: 'set allowNonPublicSources=true to enable; credentials are never used',
                });
                continue;
            }
            enabled.push(adapter);
        }
        if (enabled.length === 0)
            enabled.push(this.all[this.all.length - 1]);
        this.enabled = enabled;
        this.byId = new Map(this.all.map((s) => [s.info.id, s]));
    }
    get(id) {
        return this.byId.get(id);
    }
    /** Reject unknown/disabled sources before any book id is accepted. */
    requireEnabled(id) {
        const adapter = this.byId.get(id);
        if (!adapter)
            throw new SourceError('UNKNOWN_SOURCE', `Unknown source: ${id}`);
        if (!this.enabled.some((s) => s.info.id === id)) {
            throw new SourceError('SOURCE_DISABLED', `Source "${id}" is not enabled in this profile`);
        }
        return adapter;
    }
    byDetailUrl(url) {
        return this.all.find((s) => s.supportsDetailUrl(url));
    }
    describe() {
        return this.enabled.map((s) => s.info);
    }
    /** Allowed sources for the Dart process, always excluding restricted ones by default. */
    dartAllowedSources(config) {
        const ids = this.enabled.map((s) => s.info.id);
        if (!config.allowNonPublicSources)
            return ids.filter((id) => id !== 'wenku8');
        return ids;
    }
}
export class SourceError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'SourceError';
    }
}
//# sourceMappingURL=registry.js.map