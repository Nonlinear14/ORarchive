import { createContext, useContext, useSyncExternalStore } from 'react'
import type { BackgroundSync, BackgroundSyncSnapshot } from '../backgroundSync'
import { getDocumentCache, type DocumentCache } from '../documentCache'
import { getLocks, type Locks } from '../locks'
import { getPendingStore, type PendingStore } from '../pendingStore'

/** 로컬 동기화 저장소들. 앱에서는 전역 기본값, 테스트에서는 렌더마다 새 메모리 구현을 주입한다 */
export interface SyncServices {
  store: PendingStore
  cache: DocumentCache
  locks: Locks
}

export const SyncServicesContext = createContext<SyncServices | null>(null)

let defaultServices: SyncServices | null = null

export function useSyncServices(): SyncServices {
  const injected = useContext(SyncServicesContext)
  if (injected) return injected
  defaultServices ??= { store: getPendingStore(), cache: getDocumentCache(), locks: getLocks() }
  return defaultServices
}

/** 로그인한 사용자의 백그라운드 동기화 (비로그인이면 null) */
export const BackgroundSyncContext = createContext<BackgroundSync | null>(null)

const emptySnapshot: BackgroundSyncSnapshot = { items: [] }
const noopSubscribe = () => () => {}
const getEmptySnapshot = () => emptySnapshot

/**
 * 아직 서버에 반영되지 않은 이 사용자의 변경 목록.
 * 버리기는 여기서 하지 않는다 — 문서 화면에서 내용을 확인한 뒤 확인 창을 거쳐서만 버린다.
 */
export function usePendingChanges() {
  const sync = useContext(BackgroundSyncContext)
  const snapshot = useSyncExternalStore(sync?.subscribe ?? noopSubscribe, sync?.getSnapshot ?? getEmptySnapshot)
  return { items: snapshot.items }
}
