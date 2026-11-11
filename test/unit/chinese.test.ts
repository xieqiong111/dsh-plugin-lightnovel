import { beforeAll, describe, expect, it } from 'vitest'
import { diceSimilarity, ensureChinese, normalizeText, scoreBook, toSimplified } from '../../src/util/chinese.js'

beforeAll(async () => {
  await ensureChinese('臺台,裡里')
})

describe('Traditional/Simplified matching (requirement #3)', () => {
  it('normalises traditional characters to simplified', () => {
    expect(toSimplified('輕小說')).toContain('轻')
    expect(toSimplified('書')).toBe('书')
    // operator-supplied extra pairs
    expect(toSimplified('臺裡')).toBe('台里')
  })

  it('normalizeText removes punctuation, spacing and case', () => {
    expect(normalizeText('  Ｓｔａｒ  Ｖｏｙａｇｅ！  ')).toBe('starvoyage')
    expect(normalizeText('星海-旅途')).toBe(normalizeText('星海旅途'))
  })

  it('traditional query matches a simplified title', () => {
    const hit = scoreBook('月下的茶館', {
      title: '月下的茶馆', aliases: [], author: '林小满', tags: [], description: null,
    })
    expect(hit.score).toBeGreaterThanOrEqual(55)
    expect(hit.matchedBy).toContain('title')
    expect(hit.matchedBy).toContain('variant')
  })

  it('alias matching works for English and Chinese aliases', () => {
    const fields = { title: '星海旅途', aliases: ['星辰之旅', 'Star Voyage'], author: '測試作者', tags: [], description: null }
    expect(scoreBook('Star Voyage', fields).matchedBy).toContain('alias')
    expect(scoreBook('星辰之旅', fields).matchedBy).toContain('alias')
  })

  it('author search is supported with a lower weight than title', () => {
    const fields = { title: '星海旅途', aliases: [], author: '測試作者', tags: [], description: null }
    const byAuthor = scoreBook('測試作者', fields)
    expect(byAuthor.matchedBy).toContain('author')
    expect(scoreBook('星海旅途', fields).score).toBeGreaterThan(byAuthor.score)
  })

  it('exact match beats fuzzy, unrelated text scores low', () => {
    expect(scoreBook('星海旅途', { title: '星海旅途', aliases: [], author: '', tags: [] }).score).toBe(100)
    expect(scoreBook('完全无关的另一本书名', { title: '星海旅途', aliases: [], author: '', tags: [] }).score).toBeLessThan(20)
  })

  it('diceSimilarity bounds', () => {
    expect(diceSimilarity('abc', 'abc')).toBe(1)
    expect(diceSimilarity('', 'abc')).toBe(0)
    expect(diceSimilarity('abcd', 'abce')).toBeGreaterThan(0)
    expect(diceSimilarity('abcd', 'abce')).toBeLessThan(1)
  })
})
