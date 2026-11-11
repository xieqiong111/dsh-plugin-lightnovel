import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readZipEntries, readZipEntry, verifyEpub } from '../../src/core/integrity.js'
import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'ln-epub-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures')

/** Build a minimal but structurally valid EPUB ZIP entirely in memory. */
function crc32(buf: Buffer): number {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function zip(files: Array<{ name: string; data: Buffer; store?: boolean }>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const crc = crc32(f.data)
    const store = f.store ?? false
    const method = store ? 0 : 8
    // For "stored" entries use raw bytes; for deflate use zlib (method 8).
    const payload = store ? f.data : deflateRawSync(f.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(f.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, payload)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(f.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + payload.length
  }
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, eocd])
}

function opf(extraItems = ''): string {
  return `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
<metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Test</dc:title></metadata>
<manifest>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="ch1" href="chapter000001.xhtml" media-type="application/xhtml+xml"/>
${extraItems}
</manifest>
<spine toc="ncx"><itemref idref="ch1"/></spine>
</package>`
}

function validEpub(overrides: { opf?: string; includeMimetype?: boolean; storeMimetype?: boolean } = {}): Buffer {
  const files: Array<{ name: string; data: Buffer; store?: boolean }> = []
  if (overrides.includeMimetype !== false) {
    files.push({ name: 'mimetype', data: Buffer.from('application/epub+zip'), store: overrides.storeMimetype ?? true })
  }
  files.push(
    { name: 'META-INF/container.xml', data: Buffer.from('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>') },
    { name: 'OEBPS/content.opf', data: Buffer.from(overrides.opf ?? opf()) },
    { name: 'OEBPS/toc.ncx', data: Buffer.from('<ncx><navMap></navMap></ncx>') },
    { name: 'OEBPS/chapter000001.xhtml', data: Buffer.from('<html><body><p>hello</p></body></html>') },
  )
  return zip(files)
}

describe('ZIP reader', () => {
  it('reads both stored and deflate entries losslessly', () => {
    const buf = zip([
      { name: 'a.txt', data: Buffer.from('first'), store: true },
      { name: 'b.txt', data: Buffer.from('second'), store: false },
    ])
    const entries = readZipEntries(buf)
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'b.txt'])
    expect(readZipEntry(buf, entries[0]!).toString()).toBe('first')
    expect(readZipEntry(buf, entries[1]!).toString()).toBe('second')
  })

  it('rejects non-ZIP input', () => {
    expect(() => readZipEntries(Buffer.from('not a zip'))).toThrow(/Not a ZIP/)
  })
})

describe('verifyEpub() (requirement #9)', () => {
  it('accepts a valid EPUB and reports chapters, sha256 and bytes', async () => {
    const file = path.join(dir, 'ok.epub')
    const buf = validEpub()
    await writeFile(file, buf)
    const result = await verifyEpub(file)
    expect(result.ok).toBe(true)
    expect(result.problems).toEqual([])
    expect(result.chapters).toBe(1)
    expect(result.manifestItems).toBe(2)
    expect(result.bytes).toBe(buf.length)
    expect(result.sha256).toBe(createHash('sha256').update(buf).digest('hex'))
  })

  it('rejects a missing mimetype and a compressed first entry', async () => {
    const file = path.join(dir, 'no-mime.epub')
    await writeFile(file, validEpub({ includeMimetype: false }))
    const result = await verifyEpub(file)
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/mimetype/)
    const file2 = path.join(dir, 'compressed-mime.epub')
    await writeFile(file2, validEpub({ storeMimetype: false }))
    expect((await verifyEpub(file2)).problems.join(' ')).toMatch(/stored uncompressed/)
  })

  it('detects manifest targets that do not exist in the archive', async () => {
    const file = path.join(dir, 'missing-target.epub')
    await writeFile(file, validEpub({
      opf: opf('<item id="miss" href="missing.xhtml" media-type="application/xhtml+xml"/>'),
    }))
    const result = await verifyEpub(file)
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/manifest target missing/)
  })

  it('fails gracefully on a truncated/corrupt file', async () => {
    const file = path.join(dir, 'broken.epub')
    await writeFile(file, Buffer.from('garbage'))
    const result = await verifyEpub(file)
    expect(result.ok).toBe(false)
    expect(result.problems.length).toBeGreaterThan(0)
  })

  it('verifies the REAL EPUB produced by the vendored Dart packer', async () => {
    // Written by the Dart integration script (test:dart) before vitest runs.
    // Skip when the artifact is not present so unit tests stay self-contained.
    const generated = process.env.LN_DART_EPUB
    if (!generated) return
    const result = await verifyEpub(generated)
    expect(result.ok).toBe(true)
    expect(result.chapters).toBeGreaterThanOrEqual(3)
    expect(result.images).toBeGreaterThanOrEqual(1)
    expect((await readFile(generated)).length).toBeGreaterThan(1000)
    expect(FIXTURES).toContain('fixtures')
  })
})
