export declare class PathViolation extends Error {
    readonly code = "PATH_VIOLATION";
    constructor(message: string);
}
/** Rejects absolute paths, `..`, NUL/control bytes and Windows drive tricks. */
export declare function assertSafeRelative(relative: string): string;
/** Resolve inside `root` and prove the result did not escape. */
export declare function safeResolve(root: string, ...parts: string[]): string;
/** Filesystem-safe single path segment derived from an untrusted book title. */
export declare function sanitizeFileName(name: string, fallback?: string): string;
export declare class UrlViolation extends Error {
    readonly code = "URL_VIOLATION";
    constructor(message: string);
}
/**
 * SSRF / compliance guard. Only public http(s) URLs on standard ports are
 * accepted; credentials, localhost and private ranges are refused. We never
 * send cookies or Authorization headers, so login/paywall bypass is impossible.
 */
export declare function assertSafePublicUrl(raw: string, allowedHosts?: readonly string[]): URL;
export declare function isPrivateHost(host: string): boolean;
