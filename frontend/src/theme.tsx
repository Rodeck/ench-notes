import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ThemePref } from './data/types'

interface ThemeState {
  pref: ThemePref
  /** The theme actually applied ("system" resolved). */
  effective: 'light' | 'dark'
  setPref: (p: ThemePref) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeState>({
  pref: 'system',
  effective: 'light',
  setPref: () => {},
  toggle: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

const STORAGE_KEY = 'ench-theme'

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  })
  const [sys, setSys] = useState<'light' | 'dark'>(systemTheme)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSys(systemTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const effective = pref === 'system' ? sys : pref

  useEffect(() => {
    document.documentElement.dataset.theme = effective
  }, [effective])

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p)
    localStorage.setItem(STORAGE_KEY, p)
  }, [])

  const toggle = useCallback(() => {
    setPref(effective === 'dark' ? 'light' : 'dark')
  }, [effective, setPref])

  return (
    <ThemeContext.Provider value={{ pref, effective, setPref, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}
