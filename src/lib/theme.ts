import { useSyncExternalStore } from 'react'

/**
 * 화면 테마 (라이트/다크). 기기별 설정이라 브라우저 localStorage 에만 둔다.
 * index.html 의 인라인 스크립트가 첫 렌더 전에 같은 키를 읽어 <html data-theme> 를 먼저 붙인다 (깜빡임 방지).
 */
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'folio-theme'

const listeners = new Set<() => void>()

function readStored(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

let current: Theme = typeof window === 'undefined' ? 'light' : readStored()

function apply(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f191e' : '#142128')
}

apply(current)

export function getTheme(): Theme {
  return current
}

export function setTheme(theme: Theme) {
  current = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // 저장 불가(사생활 보호 모드 등) — 이번 방문 동안만 적용
  }
  apply(theme)
  listeners.forEach((listener) => listener())
}

export function toggleTheme() {
  setTheme(current === 'dark' ? 'light' : 'dark')
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => 'light')
}
