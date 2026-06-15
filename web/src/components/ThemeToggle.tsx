import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

/**
 * Light/dark theme control. Three states cycled by one button: `system` (follow the OS, the default),
 * `light` and `dark`. The choice is written to `document.documentElement[data-theme]`, which flips
 * `color-scheme` in index.css — that's what the `light-dark()` tokens key off. Persisted under the
 * versioned `tjaldur:theme:v1` localStorage key (hard rule 5); a matching inline script in index.html
 * applies it before first paint so a non-system choice doesn't flash the OS theme.
 */
type Theme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'tjaldur:theme:v1'
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const ICON: Record<Theme, typeof Monitor> = { system: Monitor, light: Sun, dark: Moon }
const LABEL: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    const root = document.documentElement
    try {
      if (theme === 'system') {
        delete root.dataset.theme
        localStorage.removeItem(STORAGE_KEY)
      } else {
        root.dataset.theme = theme
        localStorage.setItem(STORAGE_KEY, theme)
      }
    } catch {
      /* private-mode localStorage: still apply the attribute below for this session */
      if (theme === 'system') delete root.dataset.theme
      else root.dataset.theme = theme
    }
  }, [theme])

  const Icon = ICON[theme]
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(NEXT[theme])}
      title={LABEL[theme]}
      aria-label={`${LABEL[theme]} (click for ${LABEL[NEXT[theme]].toLowerCase()})`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  )
}
