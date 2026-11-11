import { describe, expect, it } from 'vitest'
import {
  PathViolation,
  UrlViolation,
  assertSafeRelative,
  assertSafePublicUrl,
  isPrivateHost,
  safeResolve,
  sanitizeFileName,
} from '../../src/util/paths.js'

describe('path safety (requirement #9)', () => {
  it('accepts ordinary relative paths', () => {
    expect(assertSafeRelative('books/novel.epub')).toContain('novel.epub')
    expect(assertSafeRelative('task_abc.json')).toBe('task_abc.json')
  })

  it.each([
    '',
    '../secret',
    '/etc/passwd',
    'C:\\Windows\\system32',
    '\\\\server\\share',
    'foo\u0000bar',
    'a/../../b',
  ])('rejects unsafe relative path %j', (input) => {
    expect(() => assertSafeRelative(input)).toThrow(PathViolation)
  })

  it('safeResolve never escapes its root', () => {
    const root = '/srv/ln/library'
    expect(safeResolve(root, 'Book', 'Vol 1.epub')).toBe('/srv/ln/library/Book/Vol 1.epub')
    // Leading slashes are stripped rather than treated as absolute.
    expect(safeResolve(root, '/etc/passwd')).toBe('/srv/ln/library/etc/passwd')
    expect(() => safeResolve(root, '../escape.epub')).toThrow(PathViolation)
  })

  it('sanitizeFileName removes separators and Windows reserved names', () => {
    expect(sanitizeFileName('星/海:旅*途?.epub')).not.toMatch(/[/\\:*?"<>|]/)
    expect(sanitizeFileName('CON')).toBe('_CON')
    expect(sanitizeFileName('...')).toBe('untitled')
    expect(sanitizeFileName('  ')).toBe('untitled')
    expect(sanitizeFileName('A'.repeat(300)).length).toBeLessThanOrEqual(120)
  })
})

describe('SSRF / access-control guard (requirement #10)', () => {
  it('accepts public https URLs on the allowlist', () => {
    const url = assertSafePublicUrl('https://www.bilinovel.com/novel/1234.html', ['bilinovel.com'])
    expect(url.hostname).toBe('www.bilinovel.com')
  })

  it.each([
    ['http://127.0.0.1/admin', 'loopback'],
    ['http://192.168.1.10/', 'private LAN'],
    ['http://10.0.0.1/', 'private 10/8'],
    ['http://169.254.169.254/latest/meta-data', 'cloud metadata'],
    ['http://localhost:8080/', 'localhost'],
    ['https://user:pass@example.com/', 'embedded credentials'],
    ['https://example.com:8443/', 'non-standard port'],
    ['file:///etc/passwd', 'non-http scheme'],
    ['ftp://example.com/', 'ftp scheme'],
    ['https://[::1]/', 'IPv6 loopback'],
    ['not a url', 'malformed'],
  ])('refuses %j (%s)', (input) => {
    expect(() => assertSafePublicUrl(input)).toThrow(UrlViolation)
  })

  it('refuses hosts outside the source allowlist', () => {
    expect(() => assertSafePublicUrl('https://evil.example.com/novel/1', ['bilinovel.com']))
      .toThrow(UrlViolation)
  })

  it('isPrivateHost covers the reserved ranges', () => {
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.1.1', '100.64.0.1', '::1', 'fd00::1']) {
      expect(isPrivateHost(host), host).toBe(true)
    }
    expect(isPrivateHost('www.bilinovel.com')).toBe(false)
  })
})
