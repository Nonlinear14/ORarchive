import { useSyncExternalStore } from 'react'

/**
 * 사이드바 접기 · 펴기 (상단바 버튼).
 * - 넓은 화면(>1050px): 접으면 완전히 사라진다. 고른 상태를 이 기기에 기억한다 (기본: 펼침)
 * - 좁은 화면 · 휴대폰(≤1050px): 평소에는 사라져 있고, 버튼으로 본문 위에 겹쳐 여는 서랍.
 *   기억하지 않고, 화면을 옮기거나 바깥 · Esc 로 닫힌다
 */
export const SIDEBAR_STORAGE_KEY = 'folio-sidebar-collapsed'
export const NARROW_QUERY = '(max-width: 1050px)'

const listeners = new Set<() => void>()

function readStored(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let wideCollapsed = typeof window === 'undefined' ? false : readStored()
let drawerOpen = false

const narrowNow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches

function emit() {
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  // 화면 폭이 바뀌면 서랍은 닫는다
  window.matchMedia(NARROW_QUERY).addEventListener?.('change', () => {
    drawerOpen = false
    emit()
  })
}

/** 지금 사이드바가 접혀(사라져) 있는가 */
export function isSidebarCollapsed(): boolean {
  return narrowNow() ? !drawerOpen : wideCollapsed
}

/** 좁은 화면 서랍 닫기 (화면을 옮기거나 바깥을 눌렀을 때) */
export function closeMobileSidebar() {
  if (!drawerOpen) return
  drawerOpen = false
  emit()
}

export function toggleSidebar() {
  if (narrowNow()) drawerOpen = !drawerOpen
  else {
    wideCollapsed = !wideCollapsed
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, wideCollapsed ? '1' : '0')
    } catch {
      // 저장 불가 — 이번 방문 동안만
    }
  }
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, isSidebarCollapsed, () => false)
}
