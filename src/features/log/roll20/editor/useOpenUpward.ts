import { useLayoutEffect, useState } from 'react'

/**
 * 아래로 열면 로그 상자(스크롤 영역) 아래로 잘릴 때 위로 연다.
 * 미리보기는 그림자 DOM 안이라 상자는 그림자의 바깥 host(.log-stage).
 */
export function useOpenUpward(ref: React.RefObject<HTMLElement | null>) {
  const [up, setUp] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const root = el.getRootNode()
    const box = (root instanceof ShadowRoot ? root.host : el.closest('.log-stage')) as HTMLElement | null
    if (!box) return
    const menu = el.getBoundingClientRect()
    const area = box.getBoundingClientRect()
    const row = (el.closest('.log-msg') as HTMLElement | null)?.getBoundingClientRect()
    const below = area.bottom - menu.top
    const above = (row ? row.top : menu.top) - area.top
    const openUp = menu.height > below && above > below
    if (openUp) setUp(true)
    // 고른 쪽도 모자라면 그 안에 맞게 줄이고 목록 안에서 스크롤
    const room = (openUp ? above : below) - 8
    if (menu.height > room && room > 120) el.style.maxHeight = `${Math.floor(room)}px`
  }, [ref])
  return up
}
