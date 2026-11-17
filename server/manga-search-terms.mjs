import { Converter } from 'opencc-js'

const simplify = Converter({ from: 't', to: 'cn' })
const traditional = Converter({ from: 'cn', to: 't' })
const taiwan = Converter({ from: 'cn', to: 'tw' })
const MAX_TERMS = 8
const MAX_TITLE_LENGTH = 160

const clean = (value) => value.trim().normalize('NFKC')
const keyOf = (value) => simplify(clean(value)).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')

function readAliasGroups(raw) {
  if (!raw) return []
  if (raw.length > 32768) throw new Error('SUWAYOMI_TITLE_ALIASES exceeds 32 KB')
  let groups
  try {
    groups = JSON.parse(raw)
  } catch {
    throw new Error('SUWAYOMI_TITLE_ALIASES must contain valid JSON')
  }
  if (!Array.isArray(groups) || groups.length > 100 ||
      groups.some((group) => !Array.isArray(group) || group.length < 2 || group.length > 8 ||
        group.some((title) => typeof title !== 'string' || !keyOf(title) || clean(title).length > MAX_TITLE_LENGTH))) {
    throw new Error('SUWAYOMI_TITLE_ALIASES must contain up to 100 groups of 2–8 non-empty titles (160 characters each)')
  }
  return groups.map((group) => group.map(clean))
}

export function makeMangaSearchTerms(env = process.env) {
  const aliases = new Map()
  for (const group of readAliasGroups(env.SUWAYOMI_TITLE_ALIASES)) {
    for (const title of group) {
      const key = keyOf(title)
      const previous = aliases.get(key) ?? []
      aliases.set(key, [...new Set([...previous, ...group])].slice(0, MAX_TERMS))
    }
  }

  return {
    terms(query, { chinese = true } = {}) {
      const original = query.trim()
      if (!original) return []
      const titles = [...new Set([original, clean(original), ...(aliases.get(keyOf(original)) ?? [])])]
      const variants = chinese ? titles.flatMap((title) => [simplify(title), traditional(title), taiwan(title)]) : []
      return [...new Set([...titles, ...variants])].slice(0, MAX_TERMS)
    },
  }
}
