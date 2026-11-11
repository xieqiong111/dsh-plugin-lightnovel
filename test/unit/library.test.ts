import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Library } from '../../src/core/library.js'
import { createLogger } from '../../src/util/logger.js'
import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'

let dir: string
const logger = createLogger('/tmp/ln-test-logs')
beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'ln-lib-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

function crc32(buf: Buffer): number {
  let c = ~0
  for (const byte of buf) { c ^= byte; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) }
  return ~c >>> 0
}

function makeEpub(): Buffer {
  const names = ['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/toc.ncx', 'OEBPS/chapter000001.xhtml']
  const contents = [
    Buffer.from('application/epub+zip'),
    Buffer.from('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'),
    Buffer.from('<package><manifest><item id="c" href="chapter000001.xhtml" media-type="application/xhtml+xml"/></manifest><spine/></package>'),
    Buffer.from('<ncx/>'),
    Buffer.from('<html><body><p>content</p></body></html>'),
  ]
  const locals: Buffer[] = [], centrals: Buffer[] = []
  let offset = 0
  names.forEach((name, i) => {
    const n = Buffer.from(name), data = contents[i]!
    const store = i === 0
    const payload = store ? data : deflateRawSync(data)
    const crc = crc32(data)
    const l = Buffer.alloc(30)
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(store ? 0 : 8, 8)
    l.writeUInt32LE(crc, 14); l.writeUInt32LE(payload.length, 18); l.writeUInt32LE(data.length, 22)
    l.writeUInt16LE(n.length, 26)
    locals.push(l, n, payload)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6)
    c.writeUInt16LE(store ? 0 : 8, 10); c.writeUInt32LE(crc, 16)
    c.writeUInt32LE(payload.length, 20); c.writeUInt32LE(data.length, 24)
    c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42)
    centrals.push(c, n)
    offset += l.length + n.length + payload.length
  })
  const central = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(names.length, 8)
  eocd.writeUInt16LE(names.length, 10); eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, central, eocd])
}

async function seedEpub(): Promise<string> {
  const work = path.join(dir, 'work')
  const { mkdir } = await import('node:fs/promises')
  await mkdir(work, { recursive: true })
  const p = path.join(work, 'novel.epub')
  await writeFile(p, makeEpub())
  return p
}

describe('Library (requirement #9)', () => {
  it('copies a verified EPUB, writes a sha256 sidecar and persists a portable index', async () => {
    const lib = new Library(dir, logger)
    await lib.load()
    const source = await seedEpub()
    const entry = await lib.add({
      artifact: { path: source, volumeNames: ['第一卷 启程'], chapters: 1, bytes: 0, sha256: null, integrity: 'pending', integrityError: null },
      title: '星海/旅途', author: '测试作者', sourceId: 'fixture', bookId: 'fixture:one', taskId: 'task_1',
    })
    expect(entry).not.toBeNull()
    expect(entry!.integrity).toBe('ok')
    expect(entry!.relativePath).not.toMatch(/^\//)
    expect(entry!.relativePath).not.toContain('..')
    const copied = path.join(dir, entry!.relativePath)
    expect((await stat(copied)).size).toBeGreaterThan(0)
    const checksum = await readFile(`${copied}.sha256`, 'utf8')
    expect(checksum).toContain(entry!.sha256)
    expect(checksum).toHaveLength(createHash('sha256').digest('hex').length + 2 + path.basename(copied).length + 1)

    // Index is reloadable and paths stay relative.
    const reloaded = new Library(dir, logger)
    await reloaded.load()
    expect(reloaded.get(entry!.id)!.title).toBe('星海/旅途')
    expect(reloaded.stats().total).toBe(1)
  })

  it('list / get / stats / checksums / remove', async () => {
    const lib = new Library(dir, logger)
    await lib.load()
    const source = await seedEpub()
    const entry = await lib.add({
      artifact: { path: source, volumeNames: ['第二卷'], chapters: 1, bytes: 0, sha256: null, integrity: 'pending', integrityError: null },
      title: '月下茶馆', author: '林小满', sourceId: 'fixture', bookId: 'fixture:two', taskId: 'task_2',
    })
    expect(lib.list({ query: '茶馆' })).toHaveLength(1)
    expect(lib.list({ query: '不存在' })).toHaveLength(0)
    expect(lib.get(entry!.id)!.integrity).toBe('ok')
    expect(lib.stats().ok).toBe(1)
    expect(await lib.readChecksums()).toHaveLength(1)
    expect((await lib.verify(entry!.id))[0]!.ok).toBe(true)
    expect(await lib.remove(entry!.id)).toBe(true)
    expect(lib.stats().total).toBe(0)
    expect(await lib.remove(entry!.id)).toBe(false)
  })

  it('verify() detects a mutated file via sha256 change', async () => {
    const lib = new Library(dir, logger)
    await lib.load()
    const source = await seedEpub()
    const entry = await lib.add({
      artifact: { path: source, volumeNames: ['卷一'], chapters: 1, bytes: 0, sha256: null, integrity: 'pending', integrityError: null },
      title: '书', author: '作者', sourceId: 'fixture', bookId: 'fixture:3', taskId: 'task_3',
    })
    await writeFile(path.join(dir, entry!.relativePath), Buffer.from('corrupted'))
    const [result] = await lib.verify(entry!.id)
    expect(result!.ok).toBe(false)
    expect(result!.sha256Changed).toBe(true)
    expect(lib.get(entry!.id)!.integrity).toBe('failed')
  })
})
