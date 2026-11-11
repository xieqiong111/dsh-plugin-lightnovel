import type { Logger } from './logger.js';
export interface PoliteFetcherOptions {
    userAgent: string;
    minIntervalMs: number;
    timeoutMs: number;
    respectRobots: boolean;
    logger: Logger;
}
interface RobotsRule {
    allow: string[];
    disallow: string[];
    crawlDelayMs: number;
}
/**
 * Read-only, credential-free HTTP client for public source pages.
 *
 * - one in-flight request per host, spaced by `minIntervalMs` (and robots
 *   Crawl-delay when larger);
 * - robots.txt is fetched and honoured before any other path;
 * - redirects are followed manually so each hop is re-validated;
 * - no cookies, no Authorization, no login or paywall handling of any kind.
 */
export declare class PoliteFetcher {
    private readonly lastRequest;
    private readonly queues;
    private readonly robots;
    private readonly opts;
    constructor(opts: PoliteFetcherOptions);
    getBuffer(rawUrl: string, allowedHosts?: readonly string[]): Promise<ArrayBuffer>;
    getText(rawUrl: string, options?: {
        encoding?: string;
        allowedHosts?: readonly string[];
    }): Promise<string>;
    private rawFetch;
    private before;
    private robotsFor;
    private pathAllowed;
}
export declare class HttpError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
export declare class RobotsDenied extends Error {
    readonly code = "ROBOTS_DENIED";
    constructor(message: string);
}
/** Minimal robots.txt parser for the wildcard user-agent group. */
export declare function parseRobots(text: string): RobotsRule;
/** Convenience guard used by adapters before building outbound URLs. */
export declare function safeHttpUrl(raw: string): URL | null;
export {};
