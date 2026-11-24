import type { DocumentCache } from './documentCache'
import type { DocumentRepository } from './documents'
import {
  defaultIsOnline,
  errorMessageOf,
  NETWORK_ERROR,
  RETRY_MS,
  sameDraft,
  toDraft,
} from './documentSync'
import type { Locks } from './locks'
import { keyOf, pendingLockName, type PendingConflict, type PendingEdit, type PendingStore } from './pendingStore'

/** 상단바 목록에 보여 줄 대기 변경 하나 */
export interface PendingItem {
  key: string
  docId: string
  title: string
  savedAt: number
  /** null 이면 보낼 차례를 기다리는 중 */
  conflict: PendingConflict | null
}

export interface BackgroundSyncSnapshot {
  items: PendingItem[]
}

export interface BackgroundSyncOptions {
  userId: string
  repo: DocumentRepository
  store: PendingStore
  cache: DocumentCache
  locks: Locks
  isOnline?: () => boolean
  /** 대기 기록이 남아 있는 동안 다시 훑는 간격 */
  intervalMs?: number
}

export interface BackgroundSync {
  subscribe(listener: () => void): () => void
  getSnapshot(): BackgroundSyncSnapshot
  /** 이벤트(online, 화면 복귀, 이 페이지의 대기 기록 변경)를 듣고 첫 동기화를 시작한다 */
  start(): void
  /** 지금 한 번 훑는다. 이미 훑는 중이면 끝난 뒤 한 번 더 */
  syncNow(): Promise<void>
  dispose(): void
}

type SendOutcome = 'done' | 'conflict' | 'offline' | 'failed' | 'skipped'

const emptySnapshot: BackgroundSyncSnapshot = { items: [] }

/**
 * 로그인한 사용자 한 명의 앱 전역 백그라운드 동기화.
 *
 * - 이 사용자의 모든 대기 기록(닫힌 탭이 남긴 것 포함)을 훑는다: 앱 시작·로그인, online, 화면 복귀,
 *   이 페이지의 기록 변경, 그리고 기록이 남아 있는 동안 주기적으로.
 * - 기록마다 잠금을 "바로 얻을 수 있을 때만" 처리한다 → 열린 편집기가 쥔 기록은 건드리지 않는다(중복 전송 방지).
 * - 기준 version 이 서버와 같을 때만 보낸다. 다르면 충돌로 표시하고 남겨 둔다(문서 화면에서 사용자가 선택).
 * - 다른 사용자의 기록은 목록에 나오지도 않는다(키·필드 모두 userId 로 거른다).
 */
export function createBackgroundSync(options: BackgroundSyncOptions): BackgroundSync {
  const { userId, repo, store, cache, locks } = options
  const isOnline = options.isOnline ?? defaultIsOnline
  const intervalMs = options.intervalMs ?? RETRY_MS

  let snapshot = emptySnapshot
  const listeners = new Set<() => void>()
  let generation = 0
  /** dispose 뒤에는 이벤트·타이머·대기 중이던 재실행 모두 무시한다 (start 로 다시 켠다) */
  let disposed = false
  let running: Promise<void> | null = null
  let again = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribeStore: (() => void) | null = null

  function publish(items: PendingItem[]) {
    // 편집기가 입력할 때마다 다시 훑으므로, 바뀐 것이 없으면 알리지 않는다.
    if (JSON.stringify(items) === JSON.stringify(snapshot.items)) return
    snapshot = { items }
    listeners.forEach((listener) => listener())
  }

  /** 기록 하나를 (주인이 없을 때만) 처리한다 */
  async function send(key: string, gen: number): Promise<SendOutcome> {
    const result = await locks.tryRequest(pendingLockName(key), async (): Promise<SendOutcome> => {
      const record = await store.get(key)
      if (!record || record.userId !== userId || record.conflict || gen !== generation) return 'skipped'

      try {
        const server = await repo.get(record.docId)
        if (gen !== generation) return 'skipped'
        if (!server) {
          // 지우지 않는다 — 사용자가 문서를 열어 내용을 확인하고 복구·복사·버리기를 고른다.
          await store.markConflict(key, record.revision, 'deleted')
          return 'conflict'
        }
        if (sameDraft(record.draft, toDraft(server))) {
          await store.ack(key, record.revision)
          return 'done'
        }
        if (server.version !== record.baseVersion) {
          await store.markConflict(key, record.revision, 'changed')
          return 'conflict'
        }

        const updated = await repo.update(record.docId, record.draft, record.baseVersion)
        if (updated.kind === 'ok') {
          // 요청이 이미 반영됐으므로 세대가 바뀌었어도(로그아웃 중) 기록은 정리한다.
          await store.ack(key, record.revision)
          cache.put(userId, updated.doc).catch(() => {})
          return 'done'
        }
        if (gen !== generation) return 'skipped'
        if (updated.server && sameDraft(record.draft, toDraft(updated.server))) {
          await store.ack(key, record.revision)
          return 'done'
        }
        await store.markConflict(key, record.revision, updated.server ? 'changed' : 'deleted')
        return 'conflict'
      } catch (error) {
        return !isOnline() || NETWORK_ERROR.test(errorMessageOf(error)) ? 'offline' : 'failed'
      }
    })
    return result.acquired ? result.value : 'skipped'
  }

  async function scan(gen: number) {
    let records = await store.list(userId).catch((): PendingEdit[] => [])
    if (gen !== generation) return

    if (isOnline()) {
      for (const record of records) {
        if (record.conflict) continue
        const outcome = await send(keyOf(record), gen)
        if (gen !== generation) return
        if (outcome === 'offline') break
      }
      records = await store.list(userId).catch((): PendingEdit[] => [])
      if (gen !== generation) return
    }

    // 열린 편집기가 쥐고 있는(=그 화면에서 저장 상태를 보여 주는) 기록은 충돌이 아니면 목록에서 뺀다.
    const held = await locks.held().catch(() => new Set<string>())
    if (gen !== generation) return
    const items = records
      .filter((record) => record.conflict !== null || !held.has(pendingLockName(keyOf(record))))
      .sort((a, b) => b.savedAt - a.savedAt)
      .map(
        (record): PendingItem => ({
          key: keyOf(record),
          docId: record.docId,
          title: record.draft.title,
          savedAt: record.savedAt,
          conflict: record.conflict,
        }),
      )
    publish(items)

    clearTimeout(timer)
    timer = records.length > 0 ? setTimeout(() => void syncNow(), intervalMs) : undefined
  }

  function syncNow(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (running) {
      again = true
      return running
    }
    running = scan(generation).finally(() => {
      running = null
      if (again) {
        again = false
        void syncNow() // 정리(dispose)된 뒤면 아무것도 하지 않는다
      }
    })
    return running
  }

  const onOnline = () => void syncNow()
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void syncNow()
  }

  function start() {
    generation += 1
    disposed = false
    again = false
    unsubscribeStore ??= store.subscribe((change) => {
      if (change.userId === userId) void syncNow()
    })
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline)
      document.addEventListener('visibilitychange', onVisibility)
    }
    void syncNow()
  }

  function dispose() {
    generation += 1
    disposed = true
    again = false
    clearTimeout(timer)
    timer = undefined
    unsubscribeStore?.()
    unsubscribeStore = null
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    publish([])
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    start,
    syncNow,
    dispose,
  }
}
