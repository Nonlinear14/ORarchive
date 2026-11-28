import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

/**
 * 로그 미리보기의 메시지 선택 · 끌어서 옮기기 · 키보드 (2026-11-29, Roll20 · 코코포리아 로그 편집 공통, PC만).
 * - 한 번 누르면 선택, 선택된 메시지를 더블 클릭하면 수정
 * - 선택된 메시지를 끌면 놓을 자리에 가로선, 놓으면 옮긴다 (되돌리기 한 번)
 * - 선택 상태에서 ↑/↓ 한 칸 옮기기 · Enter 수정 · Delete/Backspace 삭제 · Esc 선택 풀기
 * 선택은 메시지 id 에 붙어 있어서 옮긴 뒤에도 같은 메시지가 선택된 채로 남는다.
 * 미리보기는 그림자 DOM 안이고, 스크롤 상자는 그 host(.log-stage).
 */

/** 드래그로 볼 최소 이동 (px) */
const DRAG_START = 4
/** 상자 위아래 이만큼 안쪽으로 끌면 저절로 스크롤 */
const EDGE = 40

export interface DropTarget {
  targetId: string
  side: 'before' | 'after'
}

interface DragState {
  id: string
  startY: number
  dragging: boolean
  drop: DropTarget | null
  y: number
}

function rowsOf(root: ShadowRoot): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.log-msg[data-mid]')]
}

/** 마우스 높이 → 놓을 자리 (각 메시지의 가운데를 기준으로 앞/뒤) */
function dropAt(root: ShadowRoot, y: number): { drop: DropTarget; lineY: number } | null {
  const rows = rowsOf(root)
  if (rows.length === 0) return null
  for (const row of rows) {
    const rect = row.getBoundingClientRect()
    if (y < rect.top + rect.height / 2) return { drop: { targetId: row.dataset.mid!, side: 'before' }, lineY: rect.top }
  }
  const last = rows[rows.length - 1]
  return { drop: { targetId: last.dataset.mid!, side: 'after' }, lineY: last.getBoundingClientRect().bottom }
}

/** 옮겨도 그대로인 자리 (자기 앞 · 뒤) 인가 */
function isNoop(root: ShadowRoot, id: string, drop: DropTarget): boolean {
  const ids = rowsOf(root).map((r) => r.dataset.mid)
  const from = ids.indexOf(id)
  const to = ids.indexOf(drop.targetId)
  if (from < 0 || to < 0) return true
  if (drop.targetId === id) return true
  return drop.side === 'before' ? to === from + 1 : to === from - 1
}

export interface DropLine {
  top: number
  left: number
  width: number
}

/**
 * 선택된 메시지 끌어서 옮기기. 미리보기 host 의 onMouseDown 에 붙인다.
 * 반환하는 dropLine 은 화면(viewport) 기준 가로선 자리 — position:fixed 로 그린다.
 */
export function useMessageDrag({
  shadow,
  selectedId,
  enabled,
  onMove,
}: {
  shadow: ShadowRoot | null
  selectedId: string | null
  enabled: boolean
  onMove(id: string, drop: DropTarget): void
}) {
  const [dropLine, setDropLine] = useState<DropLine | null>(null)
  const drag = useRef<DragState | null>(null)
  const frame = useRef(0)
  const moveRef = useRef(onMove)
  useEffect(() => {
    moveRef.current = onMove
  })

  const update = useCallback(() => {
    const state = drag.current
    if (!shadow || !state?.dragging) return
    const host = shadow.host as HTMLElement
    const box = host.getBoundingClientRect()
    const hit = dropAt(shadow, state.y)
    state.drop = hit && !isNoop(shadow, state.id, hit.drop) ? hit.drop : null
    setDropLine(hit && state.drop ? { top: Math.max(box.top, Math.min(box.bottom, hit.lineY)) - 1, left: box.left + 8, width: box.width - 16 } : null)
  }, [shadow])

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current)
    drag.current = null
    setDropLine(null)
  }, [])

  useEffect(() => {
    if (!shadow) return
    const host = shadow.host as HTMLElement
    const tick = () => {
      const state = drag.current
      if (!state?.dragging) return
      const box = host.getBoundingClientRect()
      if (state.y < box.top + EDGE) host.scrollTop -= Math.ceil((box.top + EDGE - state.y) / 4)
      else if (state.y > box.bottom - EDGE) host.scrollTop += Math.ceil((state.y - (box.bottom - EDGE)) / 4)
      update()
      frame.current = requestAnimationFrame(tick)
    }
    const onMoveEvent = (e: MouseEvent) => {
      const state = drag.current
      if (!state) return
      state.y = e.clientY
      if (!state.dragging && Math.abs(e.clientY - state.startY) >= DRAG_START) {
        state.dragging = true
        host.classList.add('is-dragging')
        frame.current = requestAnimationFrame(tick)
      }
      if (state.dragging) {
        e.preventDefault()
        update()
      }
    }
    const onUp = () => {
      const state = drag.current
      host.classList.remove('is-dragging')
      if (state?.dragging) {
        // 끌고 놓은 직후의 click 은 버린다 (빈 곳 click 으로 선택이 풀리지 않게)
        const swallow = (ev: Event) => {
          ev.stopPropagation()
          ev.preventDefault()
        }
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
        if (state.drop) moveRef.current(state.id, state.drop)
      }
      stop()
    }
    document.addEventListener('mousemove', onMoveEvent)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMoveEvent)
      document.removeEventListener('mouseup', onUp)
      cancelAnimationFrame(frame.current)
    }
  }, [shadow, update, stop])

  const onMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (!enabled || e.button !== 0 || !selectedId) return
      const path = e.nativeEvent.composedPath()
      const row = path.find((el): el is HTMLElement => el instanceof HTMLElement && el.matches('.log-msg[data-mid]'))
      if (!row || row.dataset.mid !== selectedId || row.classList.contains('is-editing')) return
      // 버튼 · 메뉴 · 탭 이름은 끌지 않는다
      if (path.some((el) => el instanceof HTMLElement && el.matches('button, input, .msg-actions, .speaker-menu, .ccf-tab, .tab-hover'))) return
      drag.current = { id: selectedId, startY: e.clientY, dragging: false, drop: null, y: e.clientY }
    },
    [enabled, selectedId],
  )

  return { dropLine, onMouseDown }
}

/** 선택 상태의 키보드: ↑/↓ 옮기기 · Enter 수정 · Delete/Backspace 삭제 · Esc 선택 풀기 */
export function useSelectionKeys({
  selectedId,
  editingId,
  onKey,
}: {
  selectedId: string | null
  editingId: string | null
  onKey(key: 'up' | 'down' | 'edit' | 'remove' | 'clear', id: string): void
}) {
  const keyRef = useRef(onKey)
  useEffect(() => {
    keyRef.current = onKey
  })
  useEffect(() => {
    if (!selectedId || editingId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return
      const path = e.composedPath()
      // 로그 안(선택한 메시지에 포커스)이거나, 옮기면서 포커스가 빠져 body 일 때만 — 입력 칸 · 창 안의 키는 건드리지 않는다
      const inLog = path.some((el) => el instanceof HTMLElement && el.matches('.log-stage'))
      if (!inLog && e.target !== document.body) return
      if (path.some((el) => el instanceof HTMLElement && (el.matches('input, textarea, select, button') || el.isContentEditable))) return
      const key =
        e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'Enter' ? 'edit' : e.key === 'Delete' || e.key === 'Backspace' ? 'remove' : e.key === 'Escape' ? 'clear' : null
      if (!key) return
      e.preventDefault()
      keyRef.current(key, selectedId)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedId, editingId])
}

/** 로그 바깥(미리보기 밖)을 누르면 선택 풀기 */
export function useClearOnOutside(shadow: ShadowRoot | null, selectedId: string | null, clear: () => void) {
  useEffect(() => {
    if (!shadow || !selectedId) return
    const onDown = (e: MouseEvent) => {
      if (e.composedPath().includes(shadow.host)) return
      clear()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [shadow, selectedId, clear])
}

/** 선택한 메시지를 화면에 보이게 하고 포커스를 되돌린다 (옮긴 뒤 — DOM 이 옮겨지면 포커스가 빠진다) */
export function revealSelected(shadow: ShadowRoot | null, id: string | null) {
  if (!shadow || !id) return
  const row = shadow.querySelector<HTMLElement>(`.log-msg[data-mid="${CSS.escape(id)}"]`)
  if (!row) return
  row.focus({ preventScroll: true })
  row.scrollIntoView?.({ block: 'nearest' })
}

/** 미리보기에 덧입히는 선택 · 끌기 표시 */
export const SELECT_CSS = `
.log-msg:not(.is-editing){user-select:none;-webkit-user-select:none}
.log-msg.is-selected{cursor:grab}
:host(.is-dragging) .log-msg{cursor:grabbing}
.drop-line{position:fixed;height:2px;background:var(--point);z-index:20;pointer-events:none;border-radius:1px}
`
