import { Moon, Sun } from 'lucide-react'
import { setTheme, useTheme } from '@/services/theme'

export function ThemeToggle() {
  const { dark } = useTheme()
  const label = dark ? '切换为浅色模式' : '切换为深色模式'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-accent-soft hover:text-accent"
    >
      {dark ? <Sun aria-hidden="true" className="h-4 w-4" /> : <Moon aria-hidden="true" className="h-4 w-4" />}
    </button>
  )
}
