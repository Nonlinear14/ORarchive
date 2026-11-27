import { useSyncExternalStore } from 'react'

/**
 * 사이드바 접기 · 펴기 (상단바 버튼).
 * - 넓은 화면(>1050px): 사용자가 고른 상태를 이 기기에 기억한다 (기본: 펼침)
 * - 좁은 화면(751–1050px): 기본은 접힘. 버튼으로 잠깐 펼칠 수 있고 기억하지 않는다
 * - 휴대폰(≤750px): 사이드바를 왼쪽에서 나오는 서랍으로 연다 (하단 메뉴 없음). 화면을 옮기면 닫힌다
 */
export const MOBILE_QUERY = '(max-width: 750px)'
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
let narrowExpanded = false
let mobileOpen = false

const mobileNow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches
const narrowNow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches

function emit() {
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const media = window.matchMedia(NARROW_QUERY)
  // 화면 폭이 바뀌면 좁은 화면에서 잠깐 펼친 상태는 거둔다
  const reset = () => {
    narrowExpanded = false
    mobileOpen = false
    emit()
  }
  media.addEventListener?.('change', reset)
  window.matchMedia(MOBILE_QUERY).addEventListener?.('change', reset)
}

/** 지금 사이드바가 접혀 있는가 (휴대폰: 서랍이 닫혀 있는가) */
export function isSidebarCollapsed(): boolean {
  if (mobileNow()) return !mobileOpen
  return narrowNow() ? !narrowExpanded : wideCollapsed
}

/** 휴대폰 서랍 닫기 (화면을 옮기거나 바깥을 눌렀을 때) */
export function closeMobileSidebar() {
  if (!mobileOpen) return
  mobileOpen = false
  emit()
}

export function toggleSidebar() {
  if (mobileNow()) mobileOpen = !mobileOpen
  else if (narrowNow()) narrowExpanded = !narrowExpanded
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
