import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../test/fakeSupabase'
import { createBackgroundSync } from './backgroundSync'
import { createIdbDocumentCache, createMemoryDocumentCache, type DocumentCache } from './documentCache'
import { createDocumentRepository, type DocumentRecord, type DocumentRepository } from './documents'
import { createDocumentSync, type DocumentSync } from './documentSync'
import { createMemoryLocks, type Locks } from './locks'
import {
  createIdbPendingStore,
  createMemoryPendingStore,
  keyOf,
  pendingKey,
  pendingLockName,
  type PendingEdit,
  type PendingStore,
} from './pendingStore'

let fake: FakeSupabase
let repo: DocumentRepository
let store: PendingStore
let cache: DocumentCache
let locks: Locks
let online: boolean
let doc: DocumentRecord
const syncs: DocumentSync[] = []

interface SyncOverrides {
  store?: PendingStore
  userId?: string
  docId?: string
  repo?: DocumentRepository
  cache?: DocumentCache
  locks?: Locks
  instanceId?: string
}

function makeSync(overrides: SyncOverrides = {}) {
  const sync = createDocumentSync({
    docId: overrides.docId ?? doc.id,
    userId: overrides.userId ?? 'user-1',
    repo: overrides.repo ?? repo,
    store: overrides.store ?? store,
    cache: overrides.cache ?? cache,
    locks: overrides.locks ?? locks,
    debounceMs: 800,
    retryMs: 5000,
    isOnline: () => online,
    instanceId: overrides.instanceId,
  })
  syncs.push(sync)
  return sync
}

/** 닫힌 탭이 남긴 대기 기록을 흉내 낸다 */
function orphan(patch: Partial<PendingEdit> = {}): PendingEdit {
  return {
    userId: 'user-1',
    docId: doc.id,
    instanceId: `closed-tab-${Math.random().toString(36).slice(2)}`,
    draft: { title: '오프라인 편집', content: {} },
    baseVersion: 1,
    revision: 1,
    conflict: null,
    savedAt: Date.now(),
    ...patch,
  }
}

const updateCalls = () => fake.control.calls.filter((c) => c.table === 'documents' && c.op === 'update').length
const serverRow = () => fake.control.tables.documents.find((r) => r.id === doc.id)!
const pending = async (s: PendingStore = store, userId = 'user-1') =>
  (await s.list(userId)).filter((r) => r.docId === doc.id)

beforeEach(async () => {
  fake = createFakeSupabase()
  repo = createDocumentRepository(fake.client)
  store = createMemoryPendingStore()
  cache = createMemoryDocumentCache()
  locks = createMemoryLocks()
  online = true
  doc = await repo.create({ type: 'handout', title: '원본', content: { text: '처음' } })
  fake.control.calls.length = 0
})

afterEach(() => {
  syncs.splice(0).forEach((s) => s.dispose())
  vi.useRealTimers()
})

describe('자동 저장 (debounce + 상태 전이)', () => {
  it('불러오면 saved, 입력하면 saving, 800ms 동안 입력이 없을 때 한 번만 저장 → saved', async () => {
    const sync = makeSync()
    await sync.start()
    expect(sync.getSnapshot()).toMatchObject({ phase: 'ready', status: 'saved', dirty: false })

    vi.useFakeTimers()
    sync.edit({ title: '편' })
    expect(sync.getSnapshot().status).toBe('saving')
    await vi.advanceTimersByTimeAsync(500)
    sync.edit({ title: '편지' })
    await vi.advanceTimersByTimeAsync(799)
    expect(updateCalls()).toBe(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(updateCalls()).toBe(1)
    expect(sync.getSnapshot()).toMatchObject({ status: 'saved', dirty: false })
    expect(sync.getSnapshot().doc?.version).toBe(2)
    expect(serverRow().title).toBe('편지')
    expect(await pending()).toEqual([])
  })

  it('저장 요청 중에 입력한 내용은 새 version 으로 이어서 저장한다', async () => {
    const sync = makeSync()
    await sync.start()
    vi.useFakeTimers()

    sync.edit({ content: { text: 'A' } })
    const saving = sync.flush() // 요청 시작
    sync.edit({ content: { text: 'AB' } }) // 요청 중 입력
    await saving
    expect(sync.getSnapshot()).toMatchObject({ status: 'saving', dirty: true })
    expect(await pending()).toMatchObject([{ baseVersion: 2, draft: { content: { text: 'AB' } } }])

    await vi.advanceTimersByTimeAsync(800)
    expect(serverRow()).toMatchObject({ content: { text: 'AB' }, version: 3 })
    expect(sync.getSnapshot()).toMatchObject({ status: 'saved', dirty: false })
    expect(await pending()).toEqual([])
  })

  it('서버 오류는 error 상태와 메시지, flush 로 재시도', async () => {
    const sync = makeSync()
    await sync.start()
    fake.control.failNext = { message: 'value too long', code: '22001', details: '', hint: '' }

    sync.edit({ title: 'x' })
    await sync.flush()
    expect(sync.getSnapshot()).toMatchObject({ status: 'error', errorMessage: 'value too long', dirty: true })

    await sync.flush()
    expect(sync.getSnapshot()).toMatchObject({ status: 'saved', errorMessage: null })
  })
})

describe('오프라인 대기열', () => {
  it('오프라인이면 보내지 않고 IndexedDB 에 남겼다가 온라인이 되면 보낸다', async () => {
    const sync = makeSync()
    await sync.start()
    vi.useFakeTimers()
    online = false

    sync.edit({ content: { text: '지하철에서' } })
    expect(sync.getSnapshot().status).toBe('offline')
    await vi.advanceTimersByTimeAsync(800)
    expect(updateCalls()).toBe(0)
    expect(await pending()).toMatchObject([
      { instanceId: sync.instanceId, baseVersion: 1, conflict: null, draft: { content: { text: '지하철에서' } } },
    ])

    online = true
    await sync.flush() // 훅에서는 window 'online' 이벤트가 호출
    expect(sync.getSnapshot().status).toBe('saved')
    expect(serverRow().content).toEqual({ text: '지하철에서' })
    expect(await pending()).toEqual([])
  })

  it('요청이 네트워크 오류로 실패하면 offline 으로 두고 잠시 뒤 자동 재시도한다', async () => {
    const sync = makeSync()
    await sync.start()
    vi.useFakeTimers()
    fake.control.offline = true

    sync.edit({ title: '터널' })
    await vi.advanceTimersByTimeAsync(800)
    expect(sync.getSnapshot().status).toBe('offline')

    fake.control.offline = false
    await vi.advanceTimersByTimeAsync(5000)
    expect(sync.getSnapshot().status).toBe('saved')
    expect(serverRow().title).toBe('터널')
  })

  it('못 보낸 편집은 탭을 닫았다 다시 열어도(새 컨트롤러) 넘겨받아 보낸다 — IndexedDB(fake-indexeddb)', async () => {
    const idb = createIdbPendingStore(`folio-test-${Math.random()}`)
    const first = makeSync({ store: idb })
    await first.start()
    online = false
    first.edit({ content: { text: '저장 안 된 문장' } })
    first.dispose()
    await vi.waitFor(async () => expect(await pending(idb)).toHaveLength(1))

    online = true
    const second = makeSync({ store: idb })
    await second.start()

    expect(second.getSnapshot()).toMatchObject({ status: 'saved', draft: { content: { text: '저장 안 된 문장' } } })
    expect(serverRow().content).toEqual({ text: '저장 안 된 문장' })
    await vi.waitFor(async () => expect(await pending(idb)).toEqual([]))
  })
})

describe('충돌', () => {
  it('저장 시 다른 기기가 먼저 저장했으면 conflict — 조용히 덮어쓰지 않는다', async () => {
    const sync = makeSync()
    await sync.start()
    fake.control.serverEdit('documents', doc.id, { title: '노트북에서' })

    sync.edit({ title: '휴대폰에서' })
    await sync.flush()

    const snap = sync.getSnapshot()
    expect(snap.status).toBe('conflict')
    expect(snap.conflict?.server).toMatchObject({ title: '노트북에서', version: 2 })
    expect(serverRow().title).toBe('노트북에서')

    // 충돌 중 추가 입력도 자동 저장되지 않는다
    sync.edit({ title: '휴대폰에서!' })
    await sync.flush()
    expect(serverRow().title).toBe('노트북에서')
  })

  it("'서버 버전 불러오기' 는 서버 내용으로 되돌리고 대기 기록을 지운다", async () => {
    const sync = makeSync()
    await sync.start()
    fake.control.serverEdit('documents', doc.id, { title: '노트북에서' })
    sync.edit({ title: '휴대폰에서' })
    await sync.flush()

    await sync.resolveConflict('server')

    expect(sync.getSnapshot()).toMatchObject({ status: 'saved', dirty: false, conflict: null, draft: { title: '노트북에서' } })
    await vi.waitFor(async () => expect(await pending()).toEqual([]))
  })

  it("'내 변경으로 덮어쓰기' 는 최신 version 기준으로 내 내용을 저장한다", async () => {
    const sync = makeSync()
    await sync.start()
    fake.control.serverEdit('documents', doc.id, { title: '노트북에서' })
    sync.edit({ title: '휴대폰에서' })
    await sync.flush()

    await sync.resolveConflict('mine')

    expect(sync.getSnapshot()).toMatchObject({ status: 'saved', conflict: null })
    expect(serverRow()).toMatchObject({ title: '휴대폰에서', version: 3 })
    expect(await pending()).toEqual([])
  })

  it('다시 열었을 때 대기 기록의 기준 version 이 서버와 다르면 바로 conflict 로 시작한다', async () => {
    await store.put(orphan())
    fake.control.serverEdit('documents', doc.id, { title: '다른 기기 편집' })

    const sync = makeSync()
    await sync.start()

    expect(sync.getSnapshot()).toMatchObject({
      status: 'conflict',
      draft: { title: '오프라인 편집' },
      conflict: { server: { title: '다른 기기 편집' } },
    })
    expect(updateCalls()).toBe(0)
  })

  it('없는 문서는 notfound', async () => {
    const sync = makeSync({ docId: 'missing' })
    await sync.start()
    expect(sync.getSnapshot().phase).toBe('notfound')
  })
})

describe('회귀: 복원된 충돌은 새로고침해도 충돌로 남는다 (BLOCKING 1)', () => {
  it('복원된 충돌 중에 편집하고 다시 열어도 충돌 — 서버에 쓰지 않는다', async () => {
    await store.put(orphan({ draft: { title: '오프라인 편집', content: {} }, baseVersion: 1 }))
    fake.control.serverEdit('documents', doc.id, { title: '다른 기기 편집' }) // 서버 v2

    const first = makeSync()
    await first.start()
    expect(first.getSnapshot().status).toBe('conflict')

    // 충돌 배너가 떠 있는 동안 계속 입력
    first.edit({ title: '충돌 중 추가 편집' })
    await first.flush()
    expect(await pending()).toMatchObject([
      { instanceId: first.instanceId, baseVersion: 1, conflict: 'changed', draft: { title: '충돌 중 추가 편집' } },
    ])
    first.dispose()

    // 새로고침
    const second = makeSync()
    await second.start()
    await second.flush()

    expect(second.getSnapshot()).toMatchObject({
      status: 'conflict',
      draft: { title: '충돌 중 추가 편집' },
      conflict: { server: { title: '다른 기기 편집', version: 2 } },
    })
    expect(updateCalls()).toBe(0)
    expect(serverRow()).toMatchObject({ title: '다른 기기 편집', version: 2 })
  })

  it('저장 중 발견한 충돌도 편집 후 새로고침하면 그대로 충돌', async () => {
    const first = makeSync()
    await first.start()
    fake.control.serverEdit('documents', doc.id, { title: '노트북에서' })
    first.edit({ title: '휴대폰에서' })
    await first.flush()
    first.edit({ title: '휴대폰에서 더' })
    first.dispose()

    const second = makeSync()
    await second.start()

    expect(second.getSnapshot()).toMatchObject({ status: 'conflict', draft: { title: '휴대폰에서 더' } })
    expect(serverRow().title).toBe('노트북에서')
    expect(updateCalls()).toBe(1) // 처음 충돌을 발견한 요청 하나뿐
  })

  it('충돌을 해결하기 전까지는 다시 열어도 자동 저장하지 않고, 해결하면 그때 저장한다', async () => {
    await store.put(orphan({ conflict: 'changed', baseVersion: 1 }))
    fake.control.serverEdit('documents', doc.id, { title: '다른 기기 편집' })

    const sync = makeSync()
    await sync.start()
    expect(sync.getSnapshot().status).toBe('conflict')
    await sync.resolveConflict('mine')

    expect(serverRow()).toMatchObject({ title: '오프라인 편집', version: 3 })
    expect(await pending()).toEqual([])
  })
})

describe('회귀: 탭(편집 인스턴스)마다 대기 기록이 따로 있다 (BLOCKING 2)', () => {
  it('탭 B 의 저장 성공이 탭 A 의 오프라인 편집을 지우지 않고, A 는 나중에 충돌로 알린다', async () => {
    const tabA = makeSync()
    const tabB = makeSync()
    await tabA.start()
    await tabB.start()

    online = false
    tabA.edit({ title: 'A 의 오프라인 편집' })
    online = true
    tabB.edit({ title: 'B 의 편집' })
    await tabB.flush()
    expect(serverRow()).toMatchObject({ title: 'B 의 편집', version: 2 })

    // B 의 저장은 B 의 기록만 정리한다
    expect(await pending()).toMatchObject([
      { instanceId: tabA.instanceId, baseVersion: 1, draft: { title: 'A 의 오프라인 편집' } },
    ])

    await tabA.flush() // A 가 다시 연결됨
    expect(tabA.getSnapshot()).toMatchObject({ status: 'conflict', draft: { title: 'A 의 오프라인 편집' } })
    expect(serverRow().title).toBe('B 의 편집')
    expect(await pending()).toMatchObject([{ instanceId: tabA.instanceId, conflict: 'changed', baseVersion: 1 }])
  })

  it('A 탭을 닫은 뒤 B 가 저장해도 A 의 편집은 남고, 다음에 열면 충돌로 보여 준다', async () => {
    const tabA = makeSync()
    const tabB = makeSync()
    await tabA.start()
    await tabB.start()

    online = false
    tabA.edit({ title: 'A 의 오프라인 편집' })
    tabA.dispose() // 탭 닫힘
    online = true
    tabB.edit({ title: 'B 의 편집' })
    await tabB.flush()
    tabB.dispose()
    expect(await pending()).toHaveLength(1)

    const reopened = makeSync()
    await reopened.start()
    expect(reopened.getSnapshot()).toMatchObject({
      status: 'conflict',
      draft: { title: 'A 의 오프라인 편집' },
      conflict: { server: { title: 'B 의 편집' } },
    })
    expect(serverRow().title).toBe('B 의 편집')
  })

  it('살아 있는 다른 탭의 기록은 넘겨받지 않는다 (잠금)', async () => {
    const tabA = makeSync()
    await tabA.start()
    online = false
    tabA.edit({ title: 'A 편집 중' })
    online = true

    const tabB = makeSync()
    await tabB.start()

    expect(tabB.getSnapshot()).toMatchObject({ status: 'saved', draft: { title: '원본' } })
    expect(await pending()).toMatchObject([{ instanceId: tabA.instanceId }])
    expect(updateCalls()).toBe(0)
  })

  it('넘겨받은 편집 인스턴스가 닫히면 다른 열린 탭이 그 기록을 이어받는다', async () => {
    const tabB = makeSync()
    await tabB.start() // 깨끗한 상태로 열려 있음

    const tabA = makeSync()
    await tabA.start()
    online = false
    tabA.edit({ title: 'A 의 편집' })
    tabA.dispose()
    online = true
    // 같은 페이지의 다른 인스턴스 기록이 바뀌면(백그라운드 동기화 등) B 가 확인한다
    await store.put({ ...(await pending())[0], savedAt: Date.now() })

    await vi.waitFor(() => expect(tabB.getSnapshot()).toMatchObject({ status: 'saved', draft: { title: 'A 의 편집' } }))
    expect(serverRow()).toMatchObject({ title: 'A 의 편집', version: 2 })
    await vi.waitFor(async () => expect(await pending()).toEqual([]))
  })
})

describe('회귀: 오프라인에서 다시 열기 (사본)', () => {
  it('서버에 연결하지 못하면 마지막으로 불러온 사본을 오프라인 상태로 보여 주고, 편집을 보관했다가 연결되면 저장한다', async () => {
    const first = makeSync()
    await first.start()
    first.dispose()

    fake.control.offline = true
    online = false
    const second = makeSync()
    await second.start()
    expect(second.getSnapshot()).toMatchObject({
      phase: 'ready',
      status: 'offline',
      offlineCopy: true,
      draft: { title: '원본', content: { text: '처음' } },
    })

    second.edit({ title: '비행기에서' })
    expect(await pending()).toMatchObject([{ baseVersion: 1, draft: { title: '비행기에서' } }])

    fake.control.offline = false
    online = true
    await second.flush()
    expect(second.getSnapshot()).toMatchObject({ status: 'saved', offlineCopy: false })
    expect(serverRow()).toMatchObject({ title: '비행기에서', version: 2 })
  })

  it('오프라인으로 다시 열면 닫힌 탭이 남긴 대기 편집도 보여 준다', async () => {
    const first = makeSync()
    await first.start()
    online = false
    first.edit({ title: '보내지 못한 편집' })
    first.dispose()

    fake.control.offline = true
    const second = makeSync()
    await second.start()
    expect(second.getSnapshot()).toMatchObject({ offlineCopy: true, status: 'offline', draft: { title: '보내지 못한 편집' } })
    expect(updateCalls()).toBe(0)
  })

  it('사본도 없으면 오류 화면', async () => {
    fake.control.offline = true
    online = false
    const sync = makeSync()
    await sync.start()
    expect(sync.getSnapshot()).toMatchObject({ phase: 'error', status: 'offline' })
  })
})

describe('회귀: 사용자 분리', () => {
  it('다른 계정이 남긴 대기 기록은 넘겨받지도, 지우지도 않는다', async () => {
    const foreign = orphan({ userId: 'someone-else', draft: { title: '남의 것', content: {} } })
    await store.put(foreign)

    const sync = makeSync()
    await sync.start()

    expect(sync.getSnapshot()).toMatchObject({ status: 'saved', draft: { title: '원본' } })
    expect(updateCalls()).toBe(0)
    expect(await store.get(keyOf(foreign))).toMatchObject({ draft: { title: '남의 것' } })
    expect(await store.list('user-1')).toEqual([])
  })
})

describe('대기 기록 저장소 (revision 조건부 정리)', () => {
  const stores: [string, () => PendingStore][] = [
    ['memory', () => createMemoryPendingStore()],
    ['indexeddb', () => createIdbPendingStore(`folio-test-${Math.random()}`)],
  ]

  it.each(stores)('%s: ack/markConflict 는 내가 본 revision 일 때만 적용된다', async (_, make) => {
    const s = make()
    const record = orphan({ revision: 3 })
    const key = keyOf(record)
    await s.put(record)

    expect(await s.ack(key, 2)).toBe(false)
    expect(await s.markConflict(key, 2, 'changed')).toBe(false)
    expect(await s.get(key)).toMatchObject({ revision: 3, conflict: null })

    expect(await s.markConflict(key, 3, 'changed')).toBe(true)
    expect(await s.get(key)).toMatchObject({ conflict: 'changed' })
    expect(await s.ack(key, 3)).toBe(true)
    expect(await s.get(key)).toBeUndefined()
  })

  it.each(stores)('%s: 사용자별 목록, 키는 사용자/문서/인스턴스', async (_, make) => {
    const s = make()
    await s.put(orphan({ instanceId: 'a' }))
    await s.put(orphan({ instanceId: 'b' }))
    await s.put(orphan({ userId: 'user-2', instanceId: 'c' }))

    expect((await s.list('user-1')).map((r) => r.instanceId).sort()).toEqual(['a', 'b'])
    expect((await s.list('user-2')).map(keyOf)).toEqual([pendingKey('user-2', doc.id, 'c')])
  })
})

describe('회귀: ack 를 기다리는 동안의 입력 (BLOCKING 1)', () => {
  /**
   * ack 응답을 늦게 돌려주는 저장소.
   * applyFirst: ack 는 바로 적용되고 응답만 늦다 (IndexedDB 커밋 지연) / false: ack 가 그 뒤의 입력 기록보다 늦게 적용된다.
   */
  function slowAckStore(applyFirst: boolean) {
    const base = createMemoryPendingStore()
    let release = () => {}
    let markStarted = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const started = new Promise<void>((resolve) => (markStarted = resolve))
    const wrapped: PendingStore = {
      ...base,
      async ack(key, revision) {
        markStarted()
        if (applyFirst) {
          const done = base.ack(key, revision)
          await gate
          return done
        }
        await gate
        return base.ack(key, revision)
      },
    }
    return { store: wrapped, base, started, release: () => release() }
  }

  it.each([
    ['ack 가 먼저 적용되고 응답만 늦을 때', true],
    ['ack 가 새 입력 기록보다 늦게 적용될 때', false],
  ])('%s: 새 입력은 dirty 로 남고(기록 유지) 다음 저장에서 보낸다', async (_, applyFirst) => {
    const slow = slowAckStore(applyFirst)
    const sync = makeSync({ store: slow.store })
    await sync.start()
    vi.useFakeTimers()

    sync.edit({ content: { text: 'A' } })
    const saving = sync.flush()
    await slow.started // 서버 저장은 끝났고, 기록 정리(ack)를 기다리는 중
    expect(serverRow()).toMatchObject({ content: { text: 'A' }, version: 2 })
    sync.edit({ content: { text: 'AB' } }) // ack 대기 중 입력
    slow.release()
    await saving

    expect(sync.getSnapshot()).toMatchObject({ dirty: true, status: 'saving', draft: { content: { text: 'AB' } } })
    // 조건부 ack 는 revision 이 바뀐 새 기록을 지우지 않는다 — 새 version 기준으로 남아 있다
    expect(await pending(slow.base)).toMatchObject([{ baseVersion: 2, conflict: null, draft: { content: { text: 'AB' } } }])

    await vi.advanceTimersByTimeAsync(800)
    expect(serverRow()).toMatchObject({ content: { text: 'AB' }, version: 3 })
    expect(sync.getSnapshot()).toMatchObject({ dirty: false, status: 'saved' })
    expect(await pending(slow.base)).toEqual([])
    expect(updateCalls()).toBe(2)
  })

  it('저장 중에 입력하고 바로 닫아도(dispose) 그 입력을 새 version 기준으로 보낸 뒤에 잠금을 푼다', async () => {
    const sync = makeSync()
    await sync.start()

    sync.edit({ title: '첫 입력' })
    const saving = sync.flush()
    sync.edit({ title: '닫기 직전 입력' })
    sync.dispose()
    await saving

    await vi.waitFor(() => expect(serverRow()).toMatchObject({ title: '닫기 직전 입력', version: 3 }))
    await vi.waitFor(async () => expect(await pending()).toEqual([]))
    await vi.waitFor(async () => expect((await locks.held()).size).toBe(0))
    expect(updateCalls()).toBe(2) // 충돌(0행) 없이 두 번
  })

  it('정리(dispose) 중 오프라인이면 새 version 기준으로 기록을 남긴다 — 다음에 충돌로 오인하지 않는다', async () => {
    const sync = makeSync()
    await sync.start()

    sync.edit({ title: '첫 입력' })
    const saving = sync.flush()
    sync.edit({ title: '터널 진입 직전' })
    online = false
    sync.dispose()
    await saving

    await vi.waitFor(async () => expect((await locks.held()).size).toBe(0))
    expect(await pending()).toMatchObject([{ baseVersion: 2, conflict: null, draft: { title: '터널 진입 직전' } }])

    online = true
    const background = createBackgroundSync({ userId: 'user-1', repo, store, cache, locks, isOnline: () => online })
    await background.syncNow()
    background.dispose()
    expect(serverRow()).toMatchObject({ title: '터널 진입 직전', version: 3 })
    expect(await pending()).toEqual([])
  })
})

describe('회귀: 넘겨받기는 한 트랜잭션 (BLOCKING 2)', () => {
  it('넘겨받으면 같은 내용이 내 키에 기록되고 원래 기록은 지워진다', async () => {
    const closed = orphan({ draft: { title: '닫힌 탭의 편집', content: { text: '본문' } }, revision: 7 })
    await store.put(closed)
    online = false

    const sync = makeSync()
    await sync.start()

    expect(sync.getSnapshot()).toMatchObject({ status: 'offline', dirty: true, draft: closed.draft })
    expect(await store.get(keyOf(closed))).toBeUndefined()
    expect(await pending()).toMatchObject([{ instanceId: sync.instanceId, baseVersion: 1, draft: closed.draft }])
  })

  it('옮기기(새 기록 쓰기)가 실패하면 원래 기록이 그대로 남는다 — 내용을 잃지 않고, 서버 반영을 확인한 뒤에만 정리된다', async () => {
    const closed = orphan({ draft: { title: '하나뿐인 사본', content: { text: '잃으면 안 됨' } }, revision: 7 })
    await store.put(closed)
    // 넘겨받는 쪽의 새 기록 쓰기는 모두 실패한다 (put 이든 transfer 든)
    let attempts = 0
    const diskFull = () => new DOMException('디스크가 가득 참', 'QuotaExceededError')
    const failing: PendingStore = {
      ...store,
      async put(edit) {
        if (edit.instanceId !== closed.instanceId) throw diskFull()
        return store.put(edit)
      },
      async transfer() {
        attempts += 1
        throw diskFull()
      },
    }
    online = false

    const sync = makeSync({ store: failing })
    await sync.start()

    expect(attempts).toBe(1)
    expect(sync.getSnapshot()).toMatchObject({ dirty: true, draft: closed.draft })
    expect(await store.get(keyOf(closed))).toEqual(closed) // 원래 기록 그대로

    online = true
    await sync.flush()
    expect(serverRow()).toMatchObject({ title: '하나뿐인 사본', version: 2 })
    expect(await store.get(keyOf(closed))).toEqual(closed) // 편집기는 남의 기록을 함부로 지우지 않는다

    sync.dispose()
    await vi.waitFor(async () => expect((await locks.held()).size).toBe(0))
    const background = createBackgroundSync({ userId: 'user-1', repo, store, cache, locks, isOnline: () => online })
    await background.syncNow() // 같은 내용이 서버에 있음을 확인하고 정리
    background.dispose()
    expect(await pending()).toEqual([])
    expect(updateCalls()).toBe(1)
  })
})

describe('회귀: 서버에서 삭제된 문서의 대기 편집 (BLOCKING 3)', () => {
  const deletedDraft = { title: '살려야 할 편집', content: { text: '서버에 없는 문장' } }

  it('닫힌 탭이 남긴 편집은 지우지 않고 복구 화면(deleted)으로 보여 준다 — 서버에 쓰지 않는다', async () => {
    const closed = orphan({ draft: deletedDraft, docType: 'character' })
    await store.put(closed)
    await repo.softDelete(doc.id)
    fake.control.calls.length = 0

    const sync = makeSync()
    await sync.start()

    expect(sync.getSnapshot()).toMatchObject({
      phase: 'deleted',
      recoverSource: 'pending',
      draft: deletedDraft,
      dirty: true,
      conflict: { server: null },
    })
    expect(await pending()).toMatchObject([
      { instanceId: sync.instanceId, conflict: 'deleted', draft: deletedDraft, docType: 'character' },
    ])
    expect(updateCalls()).toBe(0)

    // 복구 화면에서는 입력·저장·한 번 클릭 버리기가 일어나지 않는다
    sync.edit({ title: '무시됨' })
    await sync.resolveConflict('server')
    await sync.flush()
    expect(sync.getSnapshot().draft).toEqual(deletedDraft)
    expect(await pending()).toHaveLength(1)
    expect(updateCalls()).toBe(0)
  })

  it('새 문서로 복구: 만들기에 실패하면 기록이 그대로 남고, 성공한 뒤에만 기록을 지운다', async () => {
    await store.put(orphan({ draft: deletedDraft, docType: 'character' }))
    await repo.softDelete(doc.id)
    const sync = makeSync()
    await sync.start()

    fake.control.failNext = { message: 'server unavailable', code: '503', details: '', hint: '' }
    await expect(sync.restoreAsNew()).rejects.toThrow('server unavailable')
    expect(sync.getSnapshot()).toMatchObject({ phase: 'deleted', draft: deletedDraft })
    expect(await pending()).toMatchObject([{ conflict: 'deleted', draft: deletedDraft }])

    const newId = await sync.restoreAsNew()
    expect(newId).not.toBe(doc.id)
    expect(fake.control.tables.documents.find((r) => r.id === newId)).toMatchObject({
      type: 'character',
      title: deletedDraft.title,
      content: deletedDraft.content,
      deleted_at: null,
      version: 1,
    })
    expect(await pending()).toEqual([])
    expect(await cache.get('user-1', newId)).toMatchObject({ title: deletedDraft.title })
  })

  it('버리기: 기록을 지우고, 같은 문서의 다른 닫힌 탭 기록이 있으면 이어서 보여 준 뒤 notfound', async () => {
    const older = orphan({ draft: { title: '오래된 편집', content: {} }, savedAt: Date.now() - 60_000 })
    const newer = orphan({ draft: { title: '최근 편집', content: {} }, savedAt: Date.now() })
    await store.put(older)
    await store.put(newer)
    await repo.softDelete(doc.id)

    const sync = makeSync()
    await sync.start()
    expect(sync.getSnapshot()).toMatchObject({ phase: 'deleted', draft: { title: '최근 편집' } })

    await sync.discardDeleted()
    expect(sync.getSnapshot()).toMatchObject({ phase: 'deleted', draft: { title: '오래된 편집' } })
    expect(await pending()).toHaveLength(1)

    await sync.discardDeleted()
    expect(sync.getSnapshot().phase).toBe('notfound')
    expect(await pending()).toEqual([])
  })

  it('편집 중 다른 곳에서 삭제되면 저장할 때 복구 화면으로 바뀌고, 입력은 삭제됨 표시와 함께 남아 다시 열어도 보인다', async () => {
    const sync = makeSync()
    await sync.start()
    await repo.softDelete(doc.id)

    sync.edit({ title: '삭제된 줄 모르고 입력' })
    await sync.flush()

    expect(sync.getSnapshot()).toMatchObject({
      phase: 'deleted',
      recoverSource: 'pending',
      draft: { title: '삭제된 줄 모르고 입력' },
    })
    expect(await pending()).toMatchObject([{ conflict: 'deleted', draft: { title: '삭제된 줄 모르고 입력' } }])

    sync.dispose()
    await vi.waitFor(async () => expect((await locks.held()).size).toBe(0))
    const reopened = makeSync()
    await reopened.start()
    expect(reopened.getSnapshot()).toMatchObject({ phase: 'deleted', draft: { title: '삭제된 줄 모르고 입력' } })
  })

  it('대기 편집이 없어도 이 기기의 사본이 있으면 사본을 복구 화면으로 보여 주고, 지우면 notfound', async () => {
    const first = makeSync()
    await first.start() // 사본을 남긴다
    first.dispose()
    await repo.softDelete(doc.id)

    const sync = makeSync()
    await sync.start()
    expect(sync.getSnapshot()).toMatchObject({
      phase: 'deleted',
      recoverSource: 'cache',
      dirty: false,
      draft: { title: '원본', content: { text: '처음' } },
    })

    await sync.discardDeleted()
    expect(sync.getSnapshot().phase).toBe('notfound')
    expect(await cache.get('user-1', doc.id)).toBeUndefined()
  })

  it('다른 곳(백그라운드 동기화)이 잠깐 쥐고 있던 기록도 잠금이 풀리면 넘겨받아 보여 준다', async () => {
    const closed = orphan({ draft: deletedDraft })
    await store.put(closed)
    await repo.softDelete(doc.id)

    let releaseHolder = () => {}
    const holding = locks.request(
      pendingLockName(keyOf(closed)),
      () => new Promise<void>((resolve) => (releaseHolder = resolve)),
    )
    const sync = makeSync()
    const starting = sync.start()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sync.getSnapshot().phase).toBe('loading')
    releaseHolder()
    await holding
    await starting

    expect(sync.getSnapshot()).toMatchObject({ phase: 'deleted', recoverSource: 'pending', draft: deletedDraft })
  })
})

describe('대기 기록 저장소: transfer (한 트랜잭션 넘겨받기)', () => {
  const stores: [string, () => PendingStore][] = [
    ['memory', () => createMemoryPendingStore()],
    ['indexeddb', () => createIdbPendingStore(`folio-test-${Math.random()}`)],
  ]

  it.each(stores)('%s: 원래 revision 일 때만 옮긴다 (쓰기 + 지우기)', async (_, make) => {
    const s = make()
    const from = orphan({ instanceId: 'closed', revision: 5 })
    const to = orphan({ instanceId: 'mine', revision: 1, draft: from.draft })
    await s.put(from)

    expect(await s.transfer(keyOf(from), 4, to)).toBe(false)
    expect(await s.get(keyOf(from))).toEqual(from)
    expect(await s.get(keyOf(to))).toBeUndefined()

    expect(await s.transfer(keyOf(from), 5, to)).toBe(true)
    expect(await s.get(keyOf(from))).toBeUndefined()
    expect(await s.get(keyOf(to))).toEqual(to)
  })

  it.each(stores)('%s: 새 기록 쓰기가 실패하면 아무것도 바뀌지 않는다 — 원래 기록 보존', async (_, make) => {
    const s = make()
    const from = orphan({ instanceId: 'closed', revision: 2 })
    await s.put(from)
    const unwritable = orphan({
      instanceId: 'mine',
      draft: { title: '복제할 수 없는 값', content: { text: (() => 'fn') as unknown as string } },
    })

    await expect(s.transfer(keyOf(from), 2, unwritable)).rejects.toBeTruthy()
    expect(await s.get(keyOf(from))).toEqual(from)
    expect(await s.get(keyOf(unwritable))).toBeUndefined()
    expect(await s.list('user-1')).toEqual([from])
  })

  it.each(stores)('%s: to 가 null 이면 원래 기록만 조건부로 지운다', async (_, make) => {
    const s = make()
    const from = orphan({ instanceId: 'closed', revision: 3 })
    await s.put(from)

    expect(await s.transfer(keyOf(from), 2, null)).toBe(false)
    expect(await s.get(keyOf(from))).toEqual(from)
    expect(await s.transfer(keyOf(from), 3, null)).toBe(true)
    expect(await s.list('user-1')).toEqual([])
  })

  it.each(stores)('%s: 같은 키로 옮기면 조건부 바꿔 쓰기 — 그 사이 더 새 기록이 생겼으면 건드리지 않는다', async (_, make) => {
    const s = make()
    const read = orphan({ instanceId: 'mine', revision: 1, draft: { title: '읽은 기록', content: {} } })
    const newer = { ...read, revision: 2, draft: { title: '그 사이 입력', content: {} } }
    await s.put(read)
    await s.put(newer)

    const stale = { ...read, revision: 3, conflict: 'deleted' as const }
    expect(await s.transfer(keyOf(read), read.revision, stale)).toBe(false)
    expect(await s.get(keyOf(read))).toEqual(newer)

    const replaced = { ...newer, revision: 3, conflict: 'deleted' as const }
    expect(await s.transfer(keyOf(newer), newer.revision, replaced)).toBe(true)
    expect(await s.list('user-1')).toEqual([replaced])
  })
})

describe('문서 사본 (DocumentCache): version 이 거꾸로 가지 않는다', () => {
  const caches: [string, () => DocumentCache][] = [
    ['memory', () => createMemoryDocumentCache()],
    ['indexeddb', () => createIdbDocumentCache(`folio-cache-test-${Math.random()}`)],
  ]

  it.each(caches)('%s: 늦게 도착한 오래된 서버 응답은 더 새 사본을 덮지 않는다', async (_, make) => {
    const c = make()
    await c.put('user-1', { ...doc, title: 'v2', version: 2 })
    await c.put('user-1', { ...doc, title: 'v1 (늦게 도착)', version: 1 })
    expect(await c.get('user-1', doc.id)).toMatchObject({ title: 'v2', version: 2 })

    await c.put('user-1', { ...doc, title: 'v3', version: 3 })
    expect(await c.get('user-1', doc.id)).toMatchObject({ title: 'v3', version: 3 })
    await c.remove('user-1', doc.id)
    expect(await c.get('user-1', doc.id)).toBeUndefined()
  })
})

/**
 * 비동기 호출 하나를 그 자리에 멈춰 세운다. arm() 한 뒤 처음으로 조건에 맞는 호출이 pass() 에 오면
 * reached 가 풀리고, release() 할 때까지 기다린다 — 그 사이에 테스트가 입력 등을 끼워 넣는다.
 */
function pausePoint() {
  let release = () => {}
  let markReached = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  const reached = new Promise<void>((resolve) => (markReached = resolve))
  let armed = false
  return {
    reached,
    arm() {
      armed = true
    },
    release: () => release(),
    async pass(matches: boolean) {
      if (!armed || !matches) return
      armed = false
      markReached()
      await gate
    },
  }
}

/** 읽기는 바로 하고(그 순간의 값), 결과만 멈춘 지점이 풀릴 때까지 늦게 돌려주는 저장소 */
function pausingStore(
  base: PendingStore,
  hooks: { get?: (key: string) => Promise<void>; list?: () => Promise<void> },
): PendingStore {
  return {
    ...base,
    async get(key) {
      const value = await base.get(key)
      await hooks.get?.(key)
      return value
    },
    async list(userId) {
      const value = await base.list(userId)
      await hooks.list?.()
      return value
    },
  }
}

function pausingCache(base: DocumentCache, hook: () => Promise<void>): DocumentCache {
  return {
    ...base,
    async get(userId, docId) {
      const value = await base.get(userId, docId)
      await hook()
      return value
    },
  }
}

function pausingRepo(
  base: DocumentRepository,
  hooks: { get?: () => Promise<void>; create?: () => Promise<void> },
): DocumentRepository {
  return {
    ...base,
    async get(id) {
      const value = await base.get(id)
      await hooks.get?.()
      return value
    },
    async create(input) {
      const value = await base.create(input)
      await hooks.create?.()
      return value
    },
  }
}

/** 지금 쌓인 비동기 작업(이 테스트에서는 모두 마이크로태스크)을 끝까지 돌린다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('회귀: 불러오는 동안의 입력은 덮어쓰지 않는다 (round 3 BLOCKING)', () => {
  const stores: [string, () => PendingStore][] = [
    ['memory', () => createMemoryPendingStore()],
    ['indexeddb', () => createIdbPendingStore(`folio-test-${Math.random()}`)],
  ]
  const typed = { title: '다시 연결되는 순간의 입력', content: { text: '살려야 할 문장' } }
  const myKey = () => pendingKey('user-1', doc.id, 'tab-a')

  /** 서버에 연결하지 못해 이 기기의 사본을 보여 주는, 아직 아무것도 입력하지 않은 편집기 */
  async function openOfflineCopy(overrides: SyncOverrides = {}) {
    await cache.put('user-1', doc)
    fake.control.offline = true
    online = false
    const sync = makeSync(overrides)
    await sync.start()
    expect(sync.getSnapshot()).toMatchObject({ phase: 'ready', offlineCopy: true, dirty: false, draft: { title: '원본' } })
    return sync
  }

  /** 다시 연결됨 — 훅에서는 window 'online' 이벤트가 flush() 를 부르고, 사본을 보던 화면은 서버에서 다시 불러온다 */
  function reconnect() {
    fake.control.offline = false
    online = true
  }

  it.each(stores)(
    '%s: 사본 화면 → 다시 연결 → 서버에서 삭제됨 → 첫 입력의 기록을 읽은 뒤 적용 전에 또 입력 → 마지막 입력이 화면·IndexedDB·복구 화면에 남는다',
    async (_, make) => {
      const base = make()
      const cacheRead = pausePoint()
      const ownRead = pausePoint()
      const sync = await openOfflineCopy({
        instanceId: 'tab-a',
        store: pausingStore(base, { get: (k) => ownRead.pass(k === myKey()) }),
        cache: pausingCache(cache, () => cacheRead.pass(true)),
      })
      reconnect()
      await repo.softDelete(doc.id)
      fake.control.calls.length = 0

      cacheRead.arm()
      ownRead.arm()
      const reconnecting = sync.flush()
      await cacheRead.reached // 서버에서 삭제됨을 확인하고 사본을 읽는 중 — 화면은 아직 편집 가능
      sync.edit({ title: '첫 입력' }) // 내 기록 revision 1 로 남는다
      cacheRead.release()
      await ownRead.reached // loadDeleted 가 그 기록(첫 입력 — 이제는 오래된 기록)을 읽었고 아직 적용하기 전
      sync.edit(typed) // 더 새 입력 — revision 2
      ownRead.release()
      await reconnecting

      expect(sync.getSnapshot()).toMatchObject({
        phase: 'deleted',
        recoverSource: 'pending',
        dirty: true,
        conflict: { server: null },
        draft: typed,
      })
      await vi.waitFor(async () => expect(await base.get(myKey())).toMatchObject({ draft: typed, conflict: 'deleted' }))
      expect(updateCalls()).toBe(0)

      // 다시 열어도(새 편집 인스턴스) 지금 입력이 복구 화면에 나온다
      sync.dispose()
      await vi.waitFor(async () => expect((await locks.held()).size).toBe(0))
      const reopened = makeSync({ store: base })
      await reopened.start()
      expect(reopened.getSnapshot()).toMatchObject({ phase: 'deleted', recoverSource: 'pending', draft: typed })
    },
  )

  it('삭제된 문서: 닫힌 탭의 기록을 넘겨받는 중(그 기록을 읽은 뒤) 입력하면 넘겨받지 않는다 — 지금 입력은 복구 화면·내 기록에, 닫힌 탭의 기록은 그대로', async () => {
    const closed = orphan({ draft: { title: '닫힌 탭의 편집', content: { text: '다른 탭' } }, docType: 'log' })
    const orphanRead = pausePoint()
    const sync = await openOfflineCopy({
      instanceId: 'tab-a',
      store: pausingStore(store, { get: (k) => orphanRead.pass(k === keyOf(closed)) }),
    })
    reconnect()
    await repo.softDelete(doc.id)
    await store.put(closed) // 서버에서 삭제된 뒤라 깨끗한 화면도 이 기록을 넘겨받지 않는다 (adoptIfIdle)
    fake.control.calls.length = 0

    orphanRead.arm()
    const reconnecting = sync.flush()
    await orphanRead.reached
    sync.edit(typed)
    orphanRead.release()
    await reconnecting

    expect(sync.getSnapshot()).toMatchObject({ phase: 'deleted', recoverSource: 'pending', draft: typed })
    await vi.waitFor(async () => expect(await store.get(myKey())).toMatchObject({ draft: typed, conflict: 'deleted' }))
    expect(await store.get(keyOf(closed))).toEqual(closed) // 옮겨지지도 지워지지도 않았다
    expect(updateCalls()).toBe(0)
  })

  it('삭제된 문서: 내 기록이 없다고 읽은 뒤 입력하면 사본이 아니라 지금 입력을 복구 화면에 보여 준다', async () => {
    const ownRead = pausePoint()
    const sync = await openOfflineCopy({
      instanceId: 'tab-a',
      store: pausingStore(store, { get: (k) => ownRead.pass(k === myKey()) }),
    })
    reconnect()
    await repo.softDelete(doc.id)

    ownRead.arm()
    const reconnecting = sync.flush()
    await ownRead.reached
    sync.edit(typed)
    ownRead.release()
    await reconnecting

    expect(sync.getSnapshot()).toMatchObject({ phase: 'deleted', recoverSource: 'pending', draft: typed })
    await vi.waitFor(async () => expect(await store.get(myKey())).toMatchObject({ draft: typed, conflict: 'deleted' }))
  })

  it('삭제된 문서: 사본도 대기 기록도 없을 때 입력하면 notfound 가 아니라 지금 입력을 복구 화면에 보여 준다', async () => {
    const listRead = pausePoint()
    const sync = await openOfflineCopy({ store: pausingStore(store, { list: () => listRead.pass(true) }) })
    await cache.remove('user-1', doc.id)
    reconnect()
    await repo.softDelete(doc.id)

    listRead.arm()
    const reconnecting = sync.flush()
    await listRead.reached
    sync.edit(typed)
    listRead.release()
    await reconnecting

    expect(sync.getSnapshot()).toMatchObject({ phase: 'deleted', recoverSource: 'pending', draft: typed })
    await vi.waitFor(async () => expect(await pending()).toMatchObject([{ draft: typed, conflict: 'deleted' }]))
  })

  it('삭제된 문서: 다른 곳이 쥔 닫힌 탭의 기록을 기다리는 동안 입력하면 그 기록을 넘겨받지 않고 지금 입력을 복구 화면에 보여 준다', async () => {
    const closed = orphan({ draft: { title: '닫힌 탭의 편집', content: {} } })
    const closedLock = pendingLockName(keyOf(closed))
    let releaseHolder = () => {}
    const holding = locks.request(closedLock, () => new Promise<void>((resolve) => (releaseHolder = resolve)))
    await store.put(closed)
    let misses = 0
    const watching: Locks = {
      ...locks,
      async tryRequest<T>(name: string, fn: () => Promise<T>) {
        const result = await locks.tryRequest(name, fn)
        if (!result.acquired && name === closedLock) misses += 1
        return result
      },
    }
    const sync = await openOfflineCopy({ instanceId: 'tab-a', locks: watching })
    reconnect()
    await repo.softDelete(doc.id)

    const before = misses
    const reconnecting = sync.flush()
    await vi.waitFor(() => expect(misses).toBeGreaterThan(before)) // 잠금이 풀리기를 기다리는 중
    sync.edit(typed)
    releaseHolder()
    await holding
    await reconnecting

    expect(sync.getSnapshot()).toMatchObject({ phase: 'deleted', recoverSource: 'pending', draft: typed })
    await vi.waitFor(async () => expect(await store.get(myKey())).toMatchObject({ draft: typed, conflict: 'deleted' }))
    expect(await store.get(keyOf(closed))).toEqual(closed)
  })

  it('있는 문서(다시 시작): 정리하지 못하고 남은 내 기록을 읽은 뒤 입력하면 그 기록으로 덮지 않고 지금 입력을 저장한다', async () => {
    let ackFails = true
    const flaky: PendingStore = {
      ...store,
      async ack(key, rev) {
        if (ackFails) {
          ackFails = false
          throw new DOMException('트랜잭션이 취소됨', 'AbortError')
        }
        return store.ack(key, rev)
      },
    }
    const ownRead = pausePoint()
    const sync = makeSync({ instanceId: 'tab-a', store: pausingStore(flaky, { get: (k) => ownRead.pass(k === myKey()) }) })
    await sync.start()
    sync.edit({ title: '저장된 입력' })
    await sync.flush() // 서버에는 저장됐지만 기록 정리(ack)가 실패해 내 기록(revision 1)이 남는다
    expect(sync.getSnapshot()).toMatchObject({ status: 'saved', dirty: false })
    expect(await store.get(myKey())).toMatchObject({ revision: 1, draft: { title: '저장된 입력' } })

    // 같은 편집기를 다시 시작한다 (StrictMode 재마운트 등) — 남은 기록을 읽은 뒤 적용 전에 입력
    sync.dispose()
    ownRead.arm()
    const restarting = sync.start()
    await ownRead.reached
    sync.edit(typed)
    ownRead.release()
    await restarting

    expect(sync.getSnapshot().draft).toEqual(typed)
    await vi.waitFor(() => expect(sync.getSnapshot()).toMatchObject({ status: 'saved', dirty: false, draft: typed }))
    expect(serverRow()).toMatchObject({ title: typed.title, content: typed.content, version: 3 })
    await vi.waitFor(async () => expect(await pending()).toEqual([]))
  })

  it('있는 문서: 닫힌 탭의 기록을 넘겨받는 중 입력하면 넘겨받지 않고 지금 입력을 저장한다 — 그 기록은 그 뒤 충돌로 보여 준다', async () => {
    const closed = orphan({ draft: { title: '닫힌 탭의 편집', content: {} } })
    // 편집기가 사본으로 열릴 때는 백그라운드 동기화가 잠깐 쥐고 있어 넘겨받지 못했다
    let releaseHolder = () => {}
    const holding = locks.request(
      pendingLockName(keyOf(closed)),
      () => new Promise<void>((resolve) => (releaseHolder = resolve)),
    )
    await store.put(closed)
    const orphanRead = pausePoint()
    const sync = await openOfflineCopy({
      store: pausingStore(store, { get: (k) => orphanRead.pass(k === keyOf(closed)) }),
    })
    releaseHolder()
    await holding
    reconnect()

    orphanRead.arm()
    const reconnecting = sync.flush()
    await orphanRead.reached
    sync.edit(typed)
    orphanRead.release()
    await reconnecting

    expect(sync.getSnapshot()).toMatchObject({ draft: typed, dirty: true })
    expect(await store.get(keyOf(closed))).toEqual(closed)
    await vi.waitFor(() => expect(serverRow()).toMatchObject({ title: typed.title, content: typed.content, version: 2 }))
    // 닫힌 탭의 편집도 잃지 않는다: 깨끗해진 화면이 넘겨받아 (기준 version 이 달라) 충돌로 보여 준다
    await vi.waitFor(() =>
      expect(sync.getSnapshot()).toMatchObject({
        status: 'conflict',
        draft: closed.draft,
        conflict: { server: { title: typed.title, version: 2 } },
      }),
    )
  })

  it('있는 문서: 서버 상태로 바꾸기 직전(기록 목록을 읽는 중) 입력하면 덮지 않고, 서버가 바뀌었으면 충돌로 알린다', async () => {
    const listRead = pausePoint()
    const sync = await openOfflineCopy({ store: pausingStore(store, { list: () => listRead.pass(true) }) })
    reconnect()
    fake.control.serverEdit('documents', doc.id, { title: '다른 기기 편집' }) // 서버 v2

    listRead.arm()
    const reconnecting = sync.flush()
    await listRead.reached
    sync.edit(typed)
    listRead.release()
    await reconnecting

    // 사본(v1) 위의 입력 — 조용히 덮지도, 덮어쓰지도 않고 충돌로 고르게 한다
    await vi.waitFor(() =>
      expect(sync.getSnapshot()).toMatchObject({
        status: 'conflict',
        draft: typed,
        conflict: { server: { title: '다른 기기 편집', version: 2 } },
      }),
    )
    expect(serverRow()).toMatchObject({ title: '다른 기기 편집', version: 2 })
  })

  it('연결 실패: 사본을 찾는 중 입력하면 오류 화면으로 바꾸지 않고 입력을 보관한다', async () => {
    const cacheRead = pausePoint()
    const sync = await openOfflineCopy({ cache: pausingCache(cache, () => cacheRead.pass(true)) })
    await cache.remove('user-1', doc.id) // 이 기기의 사본이 지워졌다 (저장 공간 정리 등)
    online = true // 브라우저는 연결됐다고 하지만 서버에는 아직 닿지 않는다 (fake.control.offline)

    cacheRead.arm()
    const reconnecting = sync.flush()
    await cacheRead.reached
    sync.edit(typed)
    cacheRead.release()
    await reconnecting

    expect(sync.getSnapshot()).toMatchObject({ phase: 'ready', dirty: true, status: 'offline', draft: typed })
    expect(await pending()).toMatchObject([{ instanceId: sync.instanceId, draft: typed, conflict: null }])
  })

  it('다른 불러오기가 화면을 바꿔도(닫힌 탭의 기록 넘겨받기) 진행 중이던 다시 불러오기가 그 화면을 덮지 않는다', async () => {
    const closed = orphan({ draft: { title: '닫힌 탭의 편집', content: { text: '살려야 할 문장' } } })
    const ownRead = pausePoint()
    const sync = await openOfflineCopy({
      instanceId: 'tab-a',
      store: pausingStore(store, { get: (k) => ownRead.pass(k === myKey()) }),
    })
    reconnect()

    ownRead.arm()
    const reconnecting = sync.flush()
    await ownRead.reached // 다시 불러오기가 내 기록(없음)을 읽었고 아직 적용하기 전
    await store.put(closed) // 그 사이 나타난 닫힌 탭의 기록을 깨끗한 화면이 넘겨받는다 (adoptIfIdle) — 입력은 없다
    await vi.waitFor(() => expect(sync.getSnapshot().draft).toEqual(closed.draft))
    ownRead.release()
    await reconnecting

    await vi.waitFor(() => expect(sync.getSnapshot()).toMatchObject({ status: 'saved', draft: closed.draft }))
    expect(serverRow()).toMatchObject({ title: closed.draft.title, content: closed.draft.content, version: 2 })
    await vi.waitFor(async () => expect(await pending()).toEqual([]))
  })

  it('다시 불러오는 동안 다른 불러오기가 화면을 더 새 서버 내용으로 바꾸면, 늦게 도착한 오래된 응답으로 되돌리지 않는다', async () => {
    const serverRead = pausePoint()
    const sync = await openOfflineCopy({ repo: pausingRepo(repo, { get: () => serverRead.pass(true) }) })
    reconnect()

    serverRead.arm()
    const reconnecting = sync.flush()
    await serverRead.reached // 다시 불러오기가 서버 응답(v1)을 받았고 아직 적용하기 전
    fake.control.serverEdit('documents', doc.id, { title: '다른 기기 편집' }) // 서버 v2
    await store.remove(pendingKey('user-1', doc.id, 'other-tab')) // 같은 문서의 기록 변경 → 깨끗한 화면이 v2 로 갱신 (입력 없음)
    await vi.waitFor(() => expect(sync.getSnapshot()).toMatchObject({ draft: { title: '다른 기기 편집' }, doc: { version: 2 } }))
    serverRead.release()
    await reconnecting

    expect(sync.getSnapshot()).toMatchObject({
      status: 'saved',
      dirty: false,
      offlineCopy: false,
      draft: { title: '다른 기기 편집' },
      doc: { version: 2 },
    })
    sync.edit(typed) // v2 기준의 입력 — v1 로 되돌아갔다면 충돌이 났을 것
    await sync.flush()
    expect(serverRow()).toMatchObject({ title: typed.title, version: 3 })
  })

  it('다시 불러오는 동안 저장이 먼저 끝나면, 늦게 도착한 서버 응답이 화면도 이 기기의 사본도 되돌리지 않는다', async () => {
    const serverRead = pausePoint()
    const sync = await openOfflineCopy({ repo: pausingRepo(repo, { get: () => serverRead.pass(true) }) })
    reconnect()

    serverRead.arm()
    const reconnecting = sync.flush()
    await serverRead.reached // 서버 응답(v1)을 받았고 아직 적용하기 전
    sync.edit(typed)
    await sync.flush() // 그 사이 저장이 먼저 끝남 → 서버 v2, 사본 v2
    expect(serverRow()).toMatchObject({ title: typed.title, version: 2 })
    serverRead.release()
    await reconnecting

    expect(sync.getSnapshot()).toMatchObject({ status: 'saved', dirty: false, draft: typed, doc: { version: 2 } })
    expect(await cache.get('user-1', doc.id)).toMatchObject({ title: typed.title, version: 2 })
  })

  it('깨끗한 화면: 서버의 최신 내용을 받은 뒤 적용 전에 입력하면 서버 내용으로 덮지 않는다', async () => {
    const serverRead = pausePoint()
    const sync = makeSync({ repo: pausingRepo(repo, { get: () => serverRead.pass(true) }) })
    await sync.start()
    fake.control.serverEdit('documents', doc.id, { title: '다른 기기 편집' }) // 서버 v2

    serverRead.arm()
    await store.remove(pendingKey('user-1', doc.id, 'other-tab')) // 같은 문서의 다른 기록이 바뀜 → 서버 최신 내용 확인
    await serverRead.reached
    sync.edit(typed)
    serverRead.release()
    await settle()

    expect(sync.getSnapshot()).toMatchObject({ draft: typed, dirty: true })
    await sync.flush()
    expect(sync.getSnapshot()).toMatchObject({ status: 'conflict', draft: typed, conflict: { server: { version: 2 } } })
    expect(await pending()).toMatchObject([{ draft: typed, baseVersion: 1, conflict: 'changed' }])
  })

  it('깨끗한 화면: 닫힌 탭의 기록을 넘겨받는 중(그 기록을 읽은 뒤) 입력하면 넘겨받지 않는다', async () => {
    const closed = orphan({ draft: { title: '닫힌 탭의 편집', content: {} } })
    const orphanRead = pausePoint()
    const sync = makeSync({
      instanceId: 'tab-a',
      store: pausingStore(store, { get: (k) => orphanRead.pass(k === keyOf(closed)) }),
    })
    await sync.start()

    orphanRead.arm()
    await store.put(closed) // → adoptIfIdle
    await orphanRead.reached
    sync.edit(typed)
    orphanRead.release()
    await settle()

    expect(sync.getSnapshot()).toMatchObject({ draft: typed, dirty: true })
    expect(await store.get(keyOf(closed))).toEqual(closed)
    expect(await store.get(myKey())).toMatchObject({ draft: typed })
  })

  it('정리(dispose)된 뒤에 돌아온 불러오기는 화면도 기록도 바꾸지 않는다', async () => {
    const closed = orphan({ draft: { title: '닫힌 탭의 편집', content: {} } })
    const orphanRead = pausePoint()
    const sync = await openOfflineCopy({
      store: pausingStore(store, { get: (k) => orphanRead.pass(k === keyOf(closed)) }),
    })
    reconnect()
    await repo.softDelete(doc.id)
    await store.put(closed)

    orphanRead.arm()
    const reconnecting = sync.flush()
    await orphanRead.reached
    sync.dispose()
    orphanRead.release()
    await reconnecting

    expect(sync.getSnapshot()).toMatchObject({ phase: 'ready', offlineCopy: true, draft: { title: '원본' } })
    expect(await store.get(keyOf(closed))).toEqual(closed)
    expect(await store.get(pendingKey('user-1', doc.id, sync.instanceId))).toBeUndefined()
  })

  it('버리기를 겹쳐 불러도 한 번만 버린다 — 앞의 버리기가 이어서 보여 준 기록을 뒤의 버리기가 지우지 않는다', async () => {
    const shown = orphan({ draft: { title: '보이는 편집', content: {} }, savedAt: Date.now() })
    const next = orphan({ draft: { title: '다음 편집', content: {} }, savedAt: Date.now() - 60_000 })
    await store.put(shown)
    await store.put(next)
    await repo.softDelete(doc.id)
    // 다음 기록을 넘겨받는 옮기기는 바로 적용되지만 응답이 늦다 (IndexedDB 커밋 지연)
    const moved = pausePoint()
    const slow: PendingStore = {
      ...store,
      async transfer(fromKey, rev, to) {
        const done = await store.transfer(fromKey, rev, to)
        await moved.pass(fromKey === keyOf(next))
        return done
      },
    }
    const sync = makeSync({ store: slow })
    await sync.start()
    expect(sync.getSnapshot()).toMatchObject({ phase: 'deleted', draft: shown.draft })

    moved.arm()
    const first = sync.discardDeleted()
    await moved.reached // 다음 기록이 화면에 나오고 내 키로 옮겨졌다 — 첫 버리기는 아직 끝나지 않음
    expect(sync.getSnapshot().draft).toEqual(next.draft)
    const second = sync.discardDeleted() // 확인을 한 번 더 누름
    moved.release()
    await Promise.all([first, second])

    expect(sync.getSnapshot()).toMatchObject({ phase: 'deleted', recoverSource: 'pending', draft: next.draft })
    expect(await pending()).toMatchObject([{ instanceId: sync.instanceId, draft: next.draft, conflict: 'deleted' }])
  })

  it('새 문서로 복구를 겹쳐 불러도 문서는 하나만 만든다', async () => {
    await store.put(orphan({ draft: { title: '복구할 편집', content: {} } }))
    await repo.softDelete(doc.id)
    const sync = makeSync()
    await sync.start()

    const [a, b] = await Promise.all([sync.restoreAsNew(), sync.restoreAsNew()])
    expect(a).toBe(b)
    expect(fake.control.tables.documents.filter((r) => r.id !== doc.id)).toHaveLength(1)
    expect(await pending()).toEqual([])
  })

  it('새 문서를 만드는 동안 화면이 다른 기록으로 바뀌면, 복구가 끝나도 그 화면과 기록을 지우지 않는다', async () => {
    const restored = orphan({ draft: { title: '복구할 편집', content: {} }, savedAt: Date.now() })
    const other = orphan({ draft: { title: '다른 닫힌 탭의 편집', content: {} }, savedAt: Date.now() - 60_000 })
    await store.put(restored)
    await store.put(other)
    await repo.softDelete(doc.id)
    const creating = pausePoint()
    const sync = makeSync({ repo: pausingRepo(repo, { create: () => creating.pass(true) }) })
    await sync.start()
    expect(sync.getSnapshot().draft).toEqual(restored.draft)

    creating.arm()
    const restoring = sync.restoreAsNew()
    await creating.reached // 새 문서는 만들어졌고, 이 기기의 기록 정리는 아직
    await sync.discardDeleted() // (API 수준) 그 사이 버리기 → 다음 기록을 보여 줌
    expect(sync.getSnapshot().draft).toEqual(other.draft)
    creating.release()
    const newId = await restoring

    expect(fake.control.tables.documents.find((r) => r.id === newId)).toMatchObject({ title: '복구할 편집' })
    expect(sync.getSnapshot()).toMatchObject({ phase: 'deleted', draft: other.draft })
    expect(await pending()).toMatchObject([{ instanceId: sync.instanceId, draft: other.draft, conflict: 'deleted' }])
  })
})
