import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocumentContent, DocumentDraft } from './documents'

/** 저장된 content → 고친 content */
export type ContentEdit = (stored: DocumentContent) => DocumentContent

const LIMIT = 100
/** 같은 묶음(예: 한 글상자에 이어서 입력)은 이 시간 안에 이어지면 되돌리기 한 번으로 */
const GROUP_MS = 1000

/**
 * 되돌리기 · 다시 실행 기록 (이 화면을 연 동안만). 편집 전의 저장 값(content)을 쌓아 두었다가 그대로 다시 저장한다.
 * 모든 변경은 useDocument 의 edit 로 보낸다 — 자동 저장 · 오프라인 보관 · 충돌 처리는 동기화 계층이 맡는다.
 * group 을 주면 같은 group 이 GROUP_MS 안에 이어질 때 한 단계로 묶는다 (글자 입력 · 색 고르기 창을 끄는 동안).
 */
export function useEditHistory(stored: DocumentContent, edit: (patch: Partial<DocumentDraft>) => void) {
  const past = useRef<DocumentContent[]>([])
  const future = useRef<DocumentContent[]>([])
  const last = useRef<{ group: string; at: number } | null>(null)
  const [depth, setDepth] = useState({ undo: 0, redo: 0 })
  const sync = () => setDepth({ undo: past.current.length, redo: future.current.length })
  const current = useRef(stored)
  useEffect(() => {
    current.current = stored
  })

  const apply = useCallback(
    (op: ContentEdit, group?: string) => {
      const before = current.current
      const after = op(before)
      if (after === before) return
      const now = Date.now()
      const joined = group !== undefined && last.current?.group === group && now - last.current.at < GROUP_MS
      if (!joined) past.current = [...past.current.slice(-(LIMIT - 1)), before]
      last.current = group !== undefined ? { group, at: now } : null
      future.current = []
      current.current = after
      edit({ content: after })
      sync()
    },
    [edit],
  )
  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (prev === undefined) return
    last.current = null
    future.current.push(current.current)
    current.current = prev
    edit({ content: prev })
    sync()
  }, [edit])
  const redo = useCallback(() => {
    const next = future.current.pop()
    if (next === undefined) return
    last.current = null
    past.current.push(current.current)
    current.current = next
    edit({ content: next })
    sync()
  }, [edit])
  /** 다른 블록으로 옮기는 등 묶음을 끊는다 */
  const breakGroup = useCallback(() => {
    last.current = null
  }, [])
  return { apply, undo, redo, breakGroup, canUndo: depth.undo > 0, canRedo: depth.redo > 0 }
}
