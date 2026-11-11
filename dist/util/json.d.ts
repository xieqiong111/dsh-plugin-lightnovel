/** Write JSON atomically (temp file in the same directory + rename). */
export declare function atomicWriteJson(filePath: string, value: unknown): Promise<void>;
export declare function readJson<T>(filePath: string, fallback: T): Promise<T>;
/** Lossless JSON used by tool canonical values. */
export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
export declare function toJson(value: unknown): Json;
