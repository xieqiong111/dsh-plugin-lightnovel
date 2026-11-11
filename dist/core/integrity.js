import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
/**
 * Minimal ZIP (stored + deflate) reader. Avoids a native/unzip dependency so
 * integrity checks work identically on macOS dev and linux/amd64 NAS images.
 */
export function readZipEntries(buffer) {
    if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) {
        throw new Error('Not a ZIP/EPUB file (missing local file header)');
    }
    let eocd = -1;
    const scanStart = Math.max(0, buffer.length - 65557);
    for (let i = buffer.length - 22; i >= scanStart; i--) {
        if (buffer.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0)
        throw new Error('Not a ZIP/EPUB file (missing end-of-central-directory)');
    const total = buffer.readUInt16LE(eocd + 10);
    let cursor = buffer.readUInt32LE(eocd + 16);
    const entries = [];
    for (let i = 0; i < total; i++) {
        if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50)
            break;
        const nameLength = buffer.readUInt16LE(cursor + 28);
        const extraLength = buffer.readUInt16LE(cursor + 30);
        const commentLength = buffer.readUInt16LE(cursor + 32);
        entries.push({
            name: buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength),
            method: buffer.readUInt16LE(cursor + 10),
            compressedSize: buffer.readUInt32LE(cursor + 20),
            uncompressedSize: buffer.readUInt32LE(cursor + 24),
            localHeaderOffset: buffer.readUInt32LE(cursor + 42),
        });
        cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}
export function readZipEntry(buffer, entry) {
    const offset = entry.localHeaderOffset;
    if (buffer.readUInt32LE(offset) !== 0x04034b50)
        throw new Error(`Bad local header for ${entry.name}`);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(start, start + entry.compressedSize);
    if (entry.method === 0)
        return Buffer.from(data);
    if (entry.method === 8)
        return inflateRawSync(data);
    throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}`);
}
/** Verify EPUB structure and every manifest reference. */
export async function verifyEpub(filePath) {
    const buffer = await readFile(filePath);
    const problems = [];
    let entries = [];
    try {
        entries = readZipEntries(buffer);
    }
    catch (error) {
        return {
            ok: false,
            bytes: buffer.length,
            sha256: createHash('sha256').update(buffer).digest('hex'),
            chapters: 0,
            images: 0,
            manifestItems: 0,
            problems: [String(error)],
        };
    }
    const byName = new Map(entries.map((e) => [e.name, e]));
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const mimetype = byName.get('mimetype');
    if (!mimetype)
        problems.push('missing mimetype entry');
    else {
        if (entries[0]?.name !== 'mimetype')
            problems.push('mimetype is not the first ZIP entry');
        if (mimetype.method !== 0)
            problems.push('mimetype must be stored uncompressed');
        if (readZipEntry(buffer, mimetype).toString('utf8').trim() !== 'application/epub+zip') {
            problems.push('mimetype content is invalid');
        }
    }
    const container = byName.get('META-INF/container.xml');
    let opfPath = 'OEBPS/content.opf';
    if (!container)
        problems.push('missing META-INF/container.xml');
    else {
        const xml = readZipEntry(buffer, container).toString('utf8');
        const fullPath = /full-path=["']([^"']+)["']/.exec(xml)?.[1];
        if (fullPath)
            opfPath = fullPath;
        if (!/rootfile/.test(xml))
            problems.push('container.xml has no rootfile');
    }
    const opf = byName.get(opfPath);
    let manifestItems = 0;
    let chapters = 0;
    let images = 0;
    if (!opf) {
        problems.push(`missing ${opfPath}`);
    }
    else {
        const xml = readZipEntry(buffer, opf).toString('utf8');
        const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
        const items = [...xml.matchAll(/<item\b[^>]*>/gi)];
        manifestItems = items.length;
        for (const [tag] of items) {
            const href = /href=["']([^"']+)["']/i.exec(tag ?? '')?.[1];
            const media = /media-type=["']([^"']+)["']/i.exec(tag ?? '')?.[1] ?? '';
            if (!href) {
                problems.push('manifest item without href');
                continue;
            }
            const target = decodeURIComponent(href.replace(/^\//, ''));
            const resolved = href.startsWith('/') ? target : opfDir + target;
            const entry = byName.get(resolved);
            if (!entry) {
                problems.push(`manifest target missing: ${resolved}`);
                continue;
            }
            if (entry.uncompressedSize === 0)
                problems.push(`empty manifest target: ${resolved}`);
            if (media === 'application/xhtml+xml' || /\.xhtml$/i.test(href))
                chapters++;
            if (media.startsWith('image/'))
                images++;
            if (tag && /properties=["'][^"']*nav[^"']*["']/i.test(tag) && !byName.get(resolved)) {
                problems.push(`nav document missing: ${resolved}`);
            }
        }
        if (items.length === 0)
            problems.push('content.opf has an empty manifest');
        if (!/<spine\b/i.test(xml))
            problems.push('content.opf has no spine');
        if (!byName.get(`${opfDir}toc.ncx`) && !byName.get(`${opfDir}nav.xhtml`) && !/properties=["'][^"']*nav/i.test(xml)) {
            problems.push('no navigation document (toc.ncx / nav.xhtml)');
        }
    }
    if (chapters === 0)
        problems.push('no chapter documents found');
    return {
        ok: problems.length === 0,
        bytes: buffer.length,
        sha256,
        chapters,
        images,
        manifestItems,
        problems,
    };
}
//# sourceMappingURL=integrity.js.map