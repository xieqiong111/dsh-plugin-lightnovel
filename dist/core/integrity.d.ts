export interface ZipEntry {
    name: string;
    method: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
}
export interface EpubIntegrity {
    ok: boolean;
    bytes: number;
    sha256: string;
    chapters: number;
    images: number;
    manifestItems: number;
    problems: string[];
}
/**
 * Minimal ZIP (stored + deflate) reader. Avoids a native/unzip dependency so
 * integrity checks work identically on macOS dev and linux/amd64 NAS images.
 */
export declare function readZipEntries(buffer: Buffer): ZipEntry[];
export declare function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer;
/** Verify EPUB structure and every manifest reference. */
export declare function verifyEpub(filePath: string): Promise<EpubIntegrity>;
