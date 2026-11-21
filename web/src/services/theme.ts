import { useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
const key = 'studio_theme'
const system = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function readPreference(value: string | null): ThemePreference {
  return value === 'dark' || value === 'system' ? value : 'light'
}

function storedPreference(): ThemePreference {
  try { return readPreference(localStorage.getItem(key)) } catch { return 'light' }
}

let preference = storedPreference()
let snapshot = { preference, dark: false }

function apply() {
  const dark = preference === 'dark' || (preference === 'system' && system.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  if (snapshot.preference === preference && snapshot.dark === dark) return
  snapshot = { preference, dark }
  for (const notify of listeners) notify()
}

function subscribe(notify: () => void) {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

function getSnapshot() {
  return snapshot
}

export function setTheme(preferred: ThemePreference) {
  preference = preferred
  try { localStorage.setItem(key, preferred) } catch { /* keep the choice for this page */ }
  apply()
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

system.addEventListener('change', apply)
window.addEventListener('storage', (event) => {
  if (event.key !== key && event.key !== null) return
  preference = storedPreference()
  apply()
})
apply()
