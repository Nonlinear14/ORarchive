import { useCallback, useEffect, useState } from 'react'
import type { DocumentSummary } from './documents'
import { useRepository } from './useRepository'

export interface MyDocumentsState {
  status: 'loading' | 'ready' | 'error'
  docs: DocumentSummary[]
  error: string | null
}

/** 내 문서 목록 (삭제되지 않은 것, 최근 수정순) */
export function useMyDocuments() {
  const repo = useRepository()
  const [state, setState] = useState<MyDocumentsState>({ status: 'loading', docs: [], error: null })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    repo
      .list()
      .then((docs) => {
        if (active) setState({ status: 'ready', docs, error: null })
      })
      .catch((error: unknown) => {
        if (active)
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          }))
      })
    return () => {
      active = false
    }
  }, [repo, reloadKey])

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, status: prev.docs.length ? prev.status : 'loading' }))
    setReloadKey((key) => key + 1)
  }, [])

  /** 낙관적 제거 (삭제 직후 목록에서 바로 뺀다) */
  const removeLocal = useCallback((id: string) => {
    setState((prev) => ({ ...prev, docs: prev.docs.filter((doc) => doc.id !== id) }))
  }, [])

  return { ...state, reload, removeLocal }
}
