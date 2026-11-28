import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useAuth } from './auth/context'
import type { DocumentRepository } from './documents'
import { createDocumentSync, type DocumentSync } from './documentSync'
import { useSyncServices } from './sync/context'
import { useRepository } from './useRepository'

interface UseDocumentOptions {
  repo?: DocumentRepository
  debounceMs?: number
  /** 수동 저장 (핸드아웃 · 롤꾸코드): saveNow() 를 부를 때만 서버에 보낸다. 입력은 그대로 이 기기에 기록된다 */
  manual?: boolean
}

/**
 * 문서 하나를 불러오고 편집 내용을 자동 저장한다.
 * 브라우저가 다시 온라인이 되거나, 탭이 가려지거나 다시 보이거나(visibilitychange) 떠날 때(pagehide)
 * 대기 중인 저장을 즉시 보낸다. 앱 전역 백그라운드 동기화와는 대기 기록의 잠금으로 조율한다.
 */
export function useDocument(docId: string, options: UseDocumentOptions = {}) {
  const { user } = useAuth()
  const defaultRepo = useRepository()
  const { store, cache, locks } = useSyncServices()
  const repo = options.repo ?? defaultRepo
  const userId = user?.id ?? ''
  const { debounceMs, manual } = options

  const sync: DocumentSync = useMemo(
    () => createDocumentSync({ docId, userId, repo, store, cache, locks, debounceMs, manual }),
    [docId, userId, repo, store, cache, locks, debounceMs, manual],
  )

  useEffect(() => {
    void sync.start()
    const flush = () => void sync.flush()
    window.addEventListener('online', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('online', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
      sync.dispose()
    }
  }, [sync])

  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot)

  return {
    ...snapshot,
    edit: sync.edit,
    flush: sync.flush,
    saveNow: sync.saveNow,
    discardChanges: sync.discardChanges,
    resolveConflict: sync.resolveConflict,
    restoreAsNew: sync.restoreAsNew,
    discardDeleted: sync.discardDeleted,
  }
}
