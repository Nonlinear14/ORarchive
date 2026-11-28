import { createStore, del, get, promisifyRequest, set, values, type UseStore } from 'idb-keyval'
import type { DocumentType } from './database.types'
import type { DocumentDraft } from './documents'

/**
 * 대기 기록이 충돌 상태인 이유.
 * - changed: 이 편집의 기준 version 이후 서버가 바뀜
 * - deleted: 서버에서 문서를 찾지 못함 (다른 기기에서 삭제)
 */
export type PendingConflict = 'changed' | 'deleted'

/**
 * 아직 서버에 반영되지 않은 편집 내용.
 *
 * 키: `${userId}/${docId}/${instanceId}` — 편집 인스턴스(문서 화면 하나 = 편집 컨트롤러 하나)마다 따로 둔다.
 * 그래서 같은 문서를 연 탭 B 가 저장에 성공해도 탭 A 의 기록은 지워지지 않는다.
 *
 * - baseVersion: 이 편집이 기반한 서버 version. 사용자가 충돌을 해결하기 전까지 절대 올리지 않는다.
 * - revision: 같은 인스턴스 안에서 기록할 때마다 증가. 지우기/표시는 "내가 본 revision 그대로일 때만" 한다.
 * - conflict: 해결되지 않은 충돌. 새로고침해도 유지되며, 이 값이 있으면 자동으로 보내지 않는다.
 */
export interface PendingEdit {
  userId: string
  docId: string
  instanceId: string
  draft: DocumentDraft
  baseVersion: number
  revision: number
  conflict: PendingConflict | null
  savedAt: number
  /** 문서 유형 — 서버에서 삭제된 문서를 새 문서로 복구할 때 쓴다 (이전 기록에는 없을 수 있다) */
  docType?: DocumentType
  /** 수동 저장 편집기(핸드아웃 · 롤꾸코드)의 저장하지 않은 변경 — 사용자가 저장을 누를 때만 보낸다.
   *  백그라운드 동기화도 보내지 않는다 (문서를 다시 열면 저장 · 변경 버리기를 고른다) */
  manual?: boolean
}

export interface PendingChange {
  userId: string
  docId: string
  key: string
}

export interface PendingStore {
  /** 이 사용자의 모든 대기 기록 (닫힌 탭이 남긴 것 포함) */
  list(userId: string): Promise<PendingEdit[]>
  get(key: string): Promise<PendingEdit | undefined>
  put(edit: PendingEdit): Promise<void>
  /** 저장된 revision 이 그대로일 때만 지운다(그 사이 새 편집이 기록됐으면 남긴다). 지웠으면 true */
  ack(key: string, revision: number): Promise<boolean>
  /** 저장된 revision 이 그대로일 때만 충돌로 표시한다. 표시했으면 true */
  markConflict(key: string, revision: number, conflict: PendingConflict): Promise<boolean>
  /**
   * 기록 하나를 다른 키로 옮긴다 (닫힌 탭이 남긴 기록 넘겨받기). 하나의 트랜잭션에서
   * fromKey 를 읽어 revision 이 그대로인지 확인 → to 를 쓰고(null 이면 쓰지 않음) → fromKey 를 지운다.
   * revision 이 다르면 아무것도 바꾸지 않고 false. 쓰기가 실패하면 전부 취소되어 원래 기록이 그대로 남고 reject 한다.
   * to 의 키가 fromKey 와 같으면 조건부 바꿔 쓰기(compare-and-set)다: 읽은 revision 그대로일 때만 to 로 바꾼다.
   */
  transfer(fromKey: string, revision: number, to: PendingEdit | null): Promise<boolean>
  /** 무조건 지운다 — 사용자가 직접 버리기로 했을 때만 */
  remove(key: string): Promise<void>
  /** 이 페이지 안에서 기록이 바뀔 때 알림 */
  subscribe(listener: (change: PendingChange) => void): () => void
}

export function pendingKey(userId: string, docId: string, instanceId: string): string {
  return `${userId}/${docId}/${instanceId}`
}

export function keyOf(edit: Pick<PendingEdit, 'userId' | 'docId' | 'instanceId'>): string {
  return pendingKey(edit.userId, edit.docId, edit.instanceId)
}

/** 대기 기록 하나를 보내는 쪽(열린 편집기 또는 백그라운드 동기화)이 쥐는 잠금 이름 */
export function pendingLockName(key: string): string {
  return `folio-pending:${key}`
}

function parseKey(key: string): Omit<PendingChange, 'key'> {
  const [userId = '', docId = ''] = key.split('/')
  return { userId, docId }
}

/** 이전 형식(문서당 하나)이나 깨진 값은 건너뛴다 */
function isPendingEdit(value: unknown): value is PendingEdit {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<PendingEdit>
  return (
    typeof v.userId === 'string' &&
    typeof v.docId === 'string' &&
    typeof v.instanceId === 'string' &&
    typeof v.baseVersion === 'number' &&
    typeof v.revision === 'number' &&
    typeof v.draft === 'object' &&
    v.draft !== null
  )
}

function createEmitter() {
  const listeners = new Set<(change: PendingChange) => void>()
  return {
    emit(key: string) {
      const change = { ...parseKey(key), key }
      listeners.forEach((listener) => listener(change))
    },
    subscribe(listener: (change: PendingChange) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** IndexedDB(idb-keyval) 구현. DB: folio-sync / store: pending */
export function createIdbPendingStore(dbName = 'folio-sync', storeName = 'pending'): PendingStore {
  let store: UseStore | null = null
  const idbStore = () => (store ??= createStore(dbName, storeName))
  const emitter = createEmitter()

  /** 한 트랜잭션 안에서 읽고 → revision 이 같으면 apply (compare-and-set) */
  function conditional(key: string, revision: number, apply: (current: PendingEdit, os: IDBObjectStore) => void) {
    return idbStore()('readwrite', (os) => {
      let changed = false
      const request = os.get(key)
      request.onsuccess = () => {
        const current: unknown = request.result
        if (isPendingEdit(current) && current.revision === revision) {
          apply(current, os)
          changed = true
        }
      }
      return promisifyRequest(os.transaction).then(() => changed)
    })
  }

  const notify = <T>(key: string, result: T) => {
    emitter.emit(key)
    return result
  }

  /** 읽기 → revision 확인 → 쓰기 → 지우기를 한 readwrite 트랜잭션에서 (중간에 실패하면 전부 취소) */
  function transfer(fromKey: string, revision: number, to: PendingEdit | null): Promise<boolean> {
    return idbStore()('readwrite', (os) => {
      let moved = false
      let failure: unknown = null
      const request = os.get(fromKey)
      request.onsuccess = () => {
        const current: unknown = request.result
        if (!isPendingEdit(current) || current.revision !== revision) return
        try {
          const toKey = to && keyOf(to)
          if (to && toKey) os.put(to, toKey)
          if (toKey !== fromKey) os.delete(fromKey)
          moved = true
        } catch (error) {
          // 예: 복제할 수 없는 값(DataCloneError). 이미 넣은 요청까지 모두 되돌린다.
          failure = error
          moved = false
          os.transaction.abort()
        }
      }
      return promisifyRequest(os.transaction).then(
        () => moved,
        (error: unknown) => {
          throw failure ?? error ?? new Error('대기 기록을 옮기지 못했습니다.')
        },
      )
    }).then((moved) => {
      if (moved) {
        emitter.emit(fromKey)
        if (to) emitter.emit(keyOf(to))
      }
      return moved
    })
  }

  return {
    async list(userId) {
      const all = await values(idbStore())
      return all.filter((value): value is PendingEdit => isPendingEdit(value) && value.userId === userId)
    },
    async get(key) {
      const value: unknown = await get(key, idbStore())
      return isPendingEdit(value) ? value : undefined
    },
    put: (edit) => set(keyOf(edit), edit, idbStore()).then(() => notify(keyOf(edit), undefined)),
    ack: (key, revision) => conditional(key, revision, (_, os) => os.delete(key)).then((done) => notify(key, done)),
    markConflict: (key, revision, conflict) =>
      conditional(key, revision, (current, os) => os.put({ ...current, conflict }, key)).then((done) =>
        notify(key, done),
      ),
    transfer,
    remove: (key) => del(key, idbStore()).then(() => notify(key, undefined)),
    subscribe: emitter.subscribe,
  }
}

/** IndexedDB 를 쓸 수 없는 환경(일부 사생활 보호 모드, 테스트)용 메모리 구현 */
export function createMemoryPendingStore(): PendingStore {
  const map = new Map<string, PendingEdit>()
  const emitter = createEmitter()

  function conditional(key: string, revision: number, apply: (current: PendingEdit) => void): boolean {
    const current = map.get(key)
    if (!current || current.revision !== revision) return false
    apply(current)
    return true
  }

  return {
    list: async (userId) => [...map.values()].filter((edit) => edit.userId === userId).map((e) => structuredClone(e)),
    get: async (key) => {
      const edit = map.get(key)
      return edit && structuredClone(edit)
    },
    put: async (edit) => {
      map.set(keyOf(edit), structuredClone(edit))
      emitter.emit(keyOf(edit))
    },
    ack: async (key, revision) => {
      const done = conditional(key, revision, () => map.delete(key))
      emitter.emit(key)
      return done
    },
    markConflict: async (key, revision, conflict) => {
      const done = conditional(key, revision, (current) => map.set(key, { ...current, conflict }))
      emitter.emit(key)
      return done
    },
    // IndexedDB 구현과 같은 의미: revision 이 다르면 false, 복제(쓰기)가 실패하면 아무것도 바꾸지 않고 reject.
    transfer: async (fromKey, revision, to) => {
      const current = map.get(fromKey)
      if (!current || current.revision !== revision) return false
      const copy = to && structuredClone(to) // 여기서 실패하면 아직 아무것도 바뀌지 않았다
      map.delete(fromKey)
      if (copy) map.set(keyOf(copy), copy)
      emitter.emit(fromKey)
      if (copy) emitter.emit(keyOf(copy))
      return true
    },
    remove: async (key) => {
      map.delete(key)
      emitter.emit(key)
    },
    subscribe: emitter.subscribe,
  }
}

let defaultStore: PendingStore | null = null

/** 앱 전역 기본 저장소 */
export function getPendingStore(): PendingStore {
  defaultStore ??= typeof indexedDB === 'undefined' ? createMemoryPendingStore() : createIdbPendingStore()
  return defaultStore
}
