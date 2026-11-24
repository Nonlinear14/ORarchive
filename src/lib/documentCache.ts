import { createStore, del, get, update, type UseStore } from 'idb-keyval'
import type { DocumentRecord } from './documents'

/**
 * 마지막으로 서버에서 확인한 문서 행(메타데이터 + 본문 + version).
 * 오프라인에서 문서를 다시 열 때 보여 주는 용도로만 쓴다 — 저장 여부 판단은 언제나 서버의 version 검사가 한다.
 * 키: `${userId}/${docId}` (사용자별로 분리)
 */
export interface DocumentCache {
  get(userId: string, docId: string): Promise<DocumentRecord | undefined>
  /**
   * 이미 더 새 version 의 사본이 있으면 그대로 둔다 — 요청 중에 저장이 먼저 끝나 늦게 도착한 오래된 서버 응답이
   * 사본을 되돌리지 않게. (읽기와 쓰기가 한 트랜잭션)
   */
  put(userId: string, doc: DocumentRecord): Promise<void>
  remove(userId: string, docId: string): Promise<void>
}

const cacheKey = (userId: string, docId: string) => `${userId}/${docId}`

/** 같은 문서의 version 은 저장할 때마다 커진다 — 더 새 것을 남긴다 */
const newerOf = (current: DocumentRecord | undefined, doc: DocumentRecord) =>
  current && current.version > doc.version ? current : doc

/** IndexedDB 구현. idb-keyval 은 DB 하나에 저장소 하나만 만들므로 대기 기록과 다른 DB 를 쓴다. */
export function createIdbDocumentCache(dbName = 'folio-cache', storeName = 'documents'): DocumentCache {
  let store: UseStore | null = null
  const idbStore = () => (store ??= createStore(dbName, storeName))

  return {
    get: (userId, docId) => get<DocumentRecord>(cacheKey(userId, docId), idbStore()),
    // update: 한 readwrite 트랜잭션에서 읽고 → 더 새 것을 쓴다
    put: (userId, doc) =>
      update<DocumentRecord>(cacheKey(userId, doc.id), (current) => newerOf(current, doc), idbStore()),
    remove: (userId, docId) => del(cacheKey(userId, docId), idbStore()),
  }
}

export function createMemoryDocumentCache(): DocumentCache {
  const map = new Map<string, DocumentRecord>()
  return {
    get: async (userId, docId) => {
      const doc = map.get(cacheKey(userId, docId))
      return doc && structuredClone(doc)
    },
    put: async (userId, doc) => {
      const key = cacheKey(userId, doc.id)
      map.set(key, structuredClone(newerOf(map.get(key), doc)))
    },
    remove: async (userId, docId) => {
      map.delete(cacheKey(userId, docId))
    },
  }
}

let defaultCache: DocumentCache | null = null

export function getDocumentCache(): DocumentCache {
  defaultCache ??= typeof indexedDB === 'undefined' ? createMemoryDocumentCache() : createIdbDocumentCache()
  return defaultCache
}
