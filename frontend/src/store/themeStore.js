import { create } from 'zustand'

const applyTheme = (theme) => {
  const root = document.documentElement
  if (theme === 'light') {
    root.classList.remove('dark')
    root.classList.add('light')
  } else {
    root.classList.remove('light')
    root.classList.add('dark')
  }
  // Update meta theme-color for browser chrome
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f8fafc' : '#0f172a')
}

export const useThemeStore = create((set) => ({
  theme: localStorage.getItem('theme') || 'dark',

  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    applyTheme(theme)
    set({ theme })
  },

  toggle: () => {
    const next = localStorage.getItem('theme') === 'light' ? 'dark' : 'light'
    localStorage.setItem('theme', next)
    applyTheme(next)
    set({ theme: next })
  },

  init: () => {
    const saved = localStorage.getItem('theme') || 'dark'
    applyTheme(saved)
    set({ theme: saved })
  },
}))
