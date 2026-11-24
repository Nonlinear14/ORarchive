import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../test/fakeSupabase'
import { createBackgroundSync, type BackgroundSync } from './backgroundSync'
import { createMemoryDocumentCache, type DocumentCache } from './documentCache'
import { createDocumentRepository, type DocumentRecord, type DocumentRepository } from './documents'
import { createDocumentSync, type DocumentSync } from './documentSync'
import { createMemoryLocks, type Locks } from './locks'
import { createMemoryPendingStore, keyOf, type PendingEdit, type PendingStore } from './pendingStore'

let fake: FakeSupabase
let repo: DocumentRepository
let store: PendingStore
let cache: DocumentCache
let locks: Locks
let online: boolean
let safeDoc: DocumentRecord
let changedDoc: DocumentRecord
const disposers: { dispose(): void }[] = []

function makeBackground(userId = 'user-1'): BackgroundSync {
  const sync = createBackgroundSync({ userId, repo, store, cache, locks, isOnline: () => online, intervalMs: 5000 })
  disposers.push(sync)
  return sync
}

function makeEditor(docId: string): DocumentSync {
  const sync = createDocumentSync({ docId, userId: 'user-1', repo, store, cache, locks, isOnline: () => online })
  disposers.push(sync)
  return sync
}

function record(doc: DocumentRecord, patch: Partial<PendingEdit> = {}): PendingEdit {
  return {
    userId: 'user-1',
    docId: doc.id,
    instanceId: `closed-${Math.random().toString(36).slice(2)}`,
    draft: { title: `${doc.title} (오프라인)`, content: { text: '보내지 못한 문장' } },
    baseVersion: doc.version,
    revision: 4,
    conflict: null,
    savedAt: Date.now(),
    ...patch,
  }
}

const row = (id: string) => fake.control.tables.documents.find((r) => r.id === id)!
const updateCalls = () => fake.control.calls.filter((c) => c.table === 'documents' && c.op === 'update').length

beforeEach(async () => {
  fake = createFakeSupabase()
  repo = createDocumentRepository(fake.client)
  store = createMemoryPendingStore()
  cache = createMemoryDocumentCache()
  locks = createMemoryLocks()
  online = true
  safeDoc = await repo.create({ type: 'handout', title: '안전한 문서', content: { text: '처음' } })
  changedDoc = await repo.create({ type: 'log', title: '바뀐 문서', content: { text: '처음' } })
  fake.control.calls.length = 0
})

afterEach(() => {
  disposers.splice(0).forEach((d) => d.dispose())
  vi.useRealTimers()
})

describe('백그라운드 동기화 (편집기 없이)', () => {
  it('기준 version 이 서버와 같은 기록은 보내고, 다른 기록은 충돌로 표시해 남긴다', async () => {
    const safe = record(safeDoc)
    const conflicting = record(changedDoc)
    await store.put(safe)
    await store.put(conflicting)
    fake.control.serverEdit('documents', changedDoc.id, { title: '다른 기기 편집' })

    const sync = makeBackground()
    await sync.syncNow()

    expect(row(safeDoc.id)).toMatchObject({ title: '안전한 문서 (오프라인)', version: 2 })
    expect(await store.get(keyOf(safe))).toBeUndefined()
    expect(await cache.get('user-1', safeDoc.id)).toMatchObject({ version: 2 })

    expect(row(changedDoc.id)).toMatchObject({ title: '다른 기기 편집', version: 2 })
    expect(await store.get(keyOf(conflicting))).toMatchObject({ conflict: 'changed', baseVersion: 1 })
    expect(sync.getSnapshot().items).toEqual([
      expect.objectContaining({ docId: changedDoc.id, conflict: 'changed', title: '바뀐 문서 (오프라인)' }),
    ])
    expect(updateCalls()).toBe(1)
  })

  it('충돌로 표시된 기록은 다시 보내지 않는다 (사용자 선택 대기)', async () => {
    const flagged = record(safeDoc, { conflict: 'changed' })
    await store.put(flagged)

    const sync = makeBackground()
    await sync.syncNow()
    await sync.syncNow()

    expect(updateCalls()).toBe(0)
    expect(row(safeDoc.id).title).toBe('안전한 문서')
    expect(sync.getSnapshot().items).toHaveLength(1)
  })

  it('충돌 표시된 기록은 문서를 열면 충돌 선택으로 이어진다', async () => {
    const conflicting = record(changedDoc)
    await store.put(conflicting)
    fake.control.serverEdit('documents', changedDoc.id, { title: '다른 기기 편집' })
    await makeBackground().syncNow()

    const editor = makeEditor(changedDoc.id)
    await editor.start()
    expect(editor.getSnapshot()).toMatchObject({
      status: 'conflict',
      draft: { title: '바뀐 문서 (오프라인)' },
      conflict: { server: { title: '다른 기기 편집' } },
    })
    expect(updateCalls()).toBe(0)
  })

  it('서버에서 사라진 문서의 기록은 지우지 않고 삭제됨으로 표시, 문서를 열어 내용을 본 뒤에만 버릴 수 있다', async () => {
    const gone = record(safeDoc)
    await store.put(gone)
    await repo.softDelete(safeDoc.id)
    fake.control.calls.length = 0

    const sync = makeBackground()
    await sync.syncNow()
    await sync.syncNow()
    expect(await store.get(keyOf(gone))).toMatchObject({ conflict: 'deleted', draft: gone.draft })
    expect(sync.getSnapshot().items).toEqual([expect.objectContaining({ conflict: 'deleted' })])
    expect(updateCalls()).toBe(0)

    // 목록의 링크 → 문서 화면(복구 화면)에서 내용을 확인하고 버린다
    const editor = makeEditor(safeDoc.id)
    await editor.start()
    expect(editor.getSnapshot()).toMatchObject({ phase: 'deleted', recoverSource: 'pending', draft: gone.draft })
    await editor.discardDeleted()
    expect(editor.getSnapshot().phase).toBe('notfound')
    await sync.syncNow()
    await vi.waitFor(() => expect(sync.getSnapshot().items).toEqual([]))
    expect(await store.list('user-1')).toEqual([])
  })

  it('네트워크 오류면 기록을 남기고, 기록이 있는 동안 주기적으로 다시 시도한다', async () => {
    vi.useFakeTimers()
    const safe = record(safeDoc)
    await store.put(safe)
    fake.control.offline = true

    const sync = makeBackground()
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(await store.get(keyOf(safe))).toMatchObject({ conflict: null })
    expect(sync.getSnapshot().items).toHaveLength(1)

    fake.control.offline = false
    await vi.advanceTimersByTimeAsync(5000)
    expect(row(safeDoc.id).title).toBe('안전한 문서 (오프라인)')
    expect(sync.getSnapshot().items).toEqual([])
  })

  it('오프라인이면 서버에 요청하지 않고, online 이벤트에 보낸다', async () => {
    online = false
    await store.put(record(safeDoc))
    const sync = makeBackground()
    sync.start()
    await vi.waitFor(() => expect(sync.getSnapshot().items).toHaveLength(1))
    expect(fake.control.calls).toEqual([])

    online = true
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(sync.getSnapshot().items).toEqual([]))
    expect(row(safeDoc.id).title).toBe('안전한 문서 (오프라인)')
  })
})

describe('열린 편집기와의 조율', () => {
  it('열린 편집기가 쥔 기록은 보내지도 목록에 띄우지도 않는다 (중복 전송 방지)', async () => {
    const editor = makeEditor(safeDoc.id)
    await editor.start()
    online = false
    editor.edit({ title: '편집기에서 입력' })
    online = true

    const sync = makeBackground()
    await sync.syncNow()
    expect(updateCalls()).toBe(0)
    expect(sync.getSnapshot().items).toEqual([])

    await editor.flush()
    expect(updateCalls()).toBe(1)
    expect(row(safeDoc.id)).toMatchObject({ title: '편집기에서 입력', version: 2 })
    expect(editor.getSnapshot().status).toBe('saved')
  })

  it('편집기가 닫히면(탭 닫힘) 남은 기록을 백그라운드가 보낸다', async () => {
    const editor = makeEditor(safeDoc.id)
    await editor.start()
    online = false
    editor.edit({ title: '닫기 전 입력' })
    editor.dispose()
    online = true

    const sync = makeBackground()
    await vi.waitFor(async () => {
      await sync.syncNow()
      expect(row(safeDoc.id).title).toBe('닫기 전 입력')
    })
    expect(await store.list('user-1')).toEqual([])
  })

  it('같은 문서가 깨끗한 상태로 열려 있으면, 백그라운드가 보낸 뒤 편집기가 최신 내용으로 갱신된다', async () => {
    const editor = makeEditor(safeDoc.id)
    await editor.start()
    const sync = makeBackground()
    sync.start()

    await store.put(record(safeDoc, { draft: { title: '다른 탭의 편집', content: {} } }))

    await vi.waitFor(() => expect(row(safeDoc.id).title).toBe('다른 탭의 편집'))
    await vi.waitFor(() =>
      expect(editor.getSnapshot()).toMatchObject({ status: 'saved', draft: { title: '다른 탭의 편집' }, doc: { version: 2 } }),
    )
    expect(updateCalls()).toBe(1)
  })
})

describe('사용자 분리 · 정리', () => {
  it('다른 사용자의 기록은 보내지도 목록에 띄우지도 않는다', async () => {
    const foreign = record(safeDoc, { userId: 'user-2' })
    await store.put(foreign)

    const sync = makeBackground('user-1')
    await sync.syncNow()

    expect(updateCalls()).toBe(0)
    expect(fake.control.calls).toEqual([])
    expect(sync.getSnapshot().items).toEqual([])
    expect(await store.get(keyOf(foreign))).toMatchObject({ conflict: null, userId: 'user-2' })
  })

  it('정리(로그아웃) 뒤에는 이벤트·타이머가 더 이상 동기화하지 않는다', async () => {
    vi.useFakeTimers()
    const sync = makeBackground()
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    sync.dispose()

    await store.put(record(safeDoc))
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(20_000)

    expect(fake.control.calls).toEqual([])
    expect(sync.getSnapshot().items).toEqual([])
  })
})
