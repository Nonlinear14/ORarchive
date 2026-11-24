import type { DocumentType } from './database.types'
import type { DocumentCache } from './documentCache'
import { documentTypes, type DocumentDraft, type DocumentRecord, type DocumentRepository } from './documents'
import { holdLock, type Locks } from './locks'
import {
  keyOf,
  pendingKey,
  pendingLockName,
  type PendingChange,
  type PendingConflict,
  type PendingEdit,
  type PendingStore,
} from './pendingStore'

/*
 * ── 동시성 불변식 ─────────────────────────────────────────────────────────────────────────────
 * 핵심: 사용자의 입력은 (가) 충돌 없는 version 조건부 UPDATE 로 서버에 가거나, (나) 사용자가 직접
 * 해결·복구·버리기를 고를 때까지 IndexedDB 에 남는다. 화면도 기록도 더 오래된 내용으로 조용히 바뀌지 않는다.
 *
 * 1. await 하는 동안에는 무엇이든 바뀔 수 있다: 사용자 입력(edit), 다른 불러오기(adoptIfIdle 등),
 *    정리·재시작(dispose/start). 그래서 await 전에 읽은 값(서버 응답, 대기 기록, 사본, snapshot)을
 *    await 뒤에 화면에 적용하거나 기록으로 쓸 때는, 바로 그 직전에 같은 동기 구간에서 다시 확인한다.
 * 2. 확인 수단은 Ticket { gen, seq, dirty } 하나다. 불러오기를 시작할 때 ticket() 으로 찍고 stillCurrent(t) 로 확인한다.
 *    - generation: start/dispose 마다 증가 → 정리·재시작 전에 시작한 작업의 결과는 버린다.
 *    - contentSeq: 화면의 draft·phase 가 바뀔 때마다 update() 가 스스로 올린다 — 입력이든, 불러오기든,
 *      사용자 선택이든. 화면을 바꾸는 경로가 새로 생겨도 따로 챙길 것이 없다.
 *    - dirty: 보내지 않은 내용을 들고 있는지. 내용이 그대로여도 이것이 바뀌었으면(저장이 끝남 등) 다시 판단한다.
 *    불러온 내용으로 화면을 바꾸는 함수(applyLoaded, applyDeleted, showCachedCopy, showServer, showNotFound,
 *    showError)는 모두 첫 인자로 Ticket 을 받아 맨 앞에서 확인하고, 아니면 아무것도 바꾸지 않는다(STALE/false).
 *    그때 부른 쪽은 keepScreen 으로 지금 화면(= 가장 최근 입력)을 지킨다: 서버에서 삭제됐으면 지금 내용
 *    그대로 복구 화면으로, 아니면 이어서 저장.
 * 3. 보내지 않은 내용을 든 화면(dirty)은 불러오기가 바꾸지 않는다. 그런 화면을 바꾸는 것은 사용자의 명시적
 *    선택뿐이다(resolveConflict('server'), discardDeleted, restoreAsNew).
 * 4. 내 키의 기록: 그 키에 쓰는 것은 잠금을 쥔 이 인스턴스뿐이다. 입력의 기록(persist)은 언제나 그 순간의
 *    화면을 쓰고 revision 은 쓸 때마다 커진다. IndexedDB 는 요청한 순서대로 적용하므로 마지막으로 요청한
 *    쓰기 = 지금 화면이다. 그래서 불러온 기록을 내 키에 쓰는 일(넘겨받기·다시 쓰기)은 2 의 확인·화면 적용과
 *    같은 동기 구간에서 요청하고, 그것도 읽은 revision 그대로일 때만 적용되는 조건부 쓰기(PendingStore.transfer)로
 *    한다 — 더 새 기록을 덮어쓰지 않는다. 지우기도 조건부(ack)이고, 무조건 지우기(remove)는 사용자가 고른 경우뿐.
 * 5. 저장(save → onSaved)은 await 마다 contentSeq 로 그 사이의 입력을 확인하고, 있었으면 dirty 를 유지해 이어서 보낸다.
 * 6. 잠금: 다른 인스턴스의 기록은 그 잠금을 바로 얻을 수 있을 때만 넘겨받는다. 정리(dispose)는 진행 중인
 *    저장·복구가 끝난 뒤에 잠금을 푼다.
 * ───────────────────────────────────────────────────────────────────────────────────────────
 */

/** 저장 상태 칩에 표시되는 값 */
export type SaveStatus = 'saving' | 'saved' | 'offline' | 'error' | 'conflict'

/**
 * - deleted: 서버에서 삭제된 문서. 이 기기에 남은 내용(대기 편집 또는 마지막 사본)을 읽기 전용으로 보여 주고
 *   새 문서로 복구·복사·버리기를 고르게 한다.
 */
export type LoadPhase = 'loading' | 'ready' | 'deleted' | 'notfound' | 'error'

/** phase === 'deleted' 일 때 보여 주는 내용의 출처: 서버에 반영되지 않은 대기 편집, 또는 이 기기의 마지막 사본 */
export type RecoverSource = 'pending' | 'cache'

export interface SyncSnapshot {
  phase: LoadPhase
  /** 마지막으로 확인한 서버 상태 (version 포함). offlineCopy 면 이 기기에 저장해 둔 사본 */
  doc: DocumentRecord | null
  /** 화면에 보이는 편집 내용 */
  draft: DocumentDraft | null
  status: SaveStatus
  /** 서버에 아직 반영되지 않은 변경이 있음 */
  dirty: boolean
  /** status === 'conflict' 일 때 현재 서버 상태. server 가 null 이면 다른 곳에서 삭제됨 */
  conflict: { server: DocumentRecord | null } | null
  errorMessage: string | null
  /** 서버에 연결하지 못해 이 기기에 저장해 둔 마지막 사본을 보여 주는 중 */
  offlineCopy: boolean
  /** phase === 'deleted' 일 때만 값이 있다 */
  recoverSource: RecoverSource | null
}

export type ConflictChoice = 'server' | 'mine'

export interface DocumentSyncOptions {
  docId: string
  userId: string
  repo: DocumentRepository
  store: PendingStore
  cache: DocumentCache
  locks: Locks
  /** 마지막 입력 후 저장까지 기다리는 시간 */
  debounceMs?: number
  /** 네트워크 오류로 오프라인이 된 뒤 자동 재시도 간격 */
  retryMs?: number
  isOnline?: () => boolean
  /** 편집 인스턴스 id (기본: 무작위). 대기 기록의 키가 된다 */
  instanceId?: string
}

export interface DocumentSync {
  /** 이 편집 인스턴스의 id — 대기 기록 키 `${userId}/${docId}/${instanceId}` */
  readonly instanceId: string
  subscribe(listener: () => void): () => void
  getSnapshot(): SyncSnapshot
  start(): Promise<void>
  edit(patch: Partial<DocumentDraft>): void
  /** 대기 중인 변경을 즉시 저장 (debounce 무시). 불러오기에 실패했거나 사본을 보는 중이면 다시 불러온다 */
  flush(): Promise<void>
  resolveConflict(choice: ConflictChoice): Promise<void>
  /**
   * 서버에서 삭제된 문서의 내용으로 새 문서를 만든다. 새 문서가 만들어진 뒤에만 이 기기의 기록을 정리한다.
   * 새 문서의 id 를 돌려준다. 만들지 못하면 reject 하고 기록은 그대로 남는다. 진행 중에 다시 부르면 같은 결과를 기다린다.
   */
  restoreAsNew(): Promise<string>
  /** 서버에서 삭제된 문서의 내용을 버린다 (사용자가 확인한 뒤에만 부른다). 진행 중에 다시 부르면 같은 결과를 기다린다 */
  discardDeleted(): Promise<void>
  dispose(): void
}

export const SAVE_DEBOUNCE_MS = 800
export const RETRY_MS = 10_000
/** 삭제된 문서를 열 때, 다른 곳(백그라운드 동기화)이 잠깐 쥐고 있는 대기 기록을 다시 시도하는 간격과 횟수 */
const LOCKED_RETRY_MS = 200
const LOCKED_RETRIES = 10

/** stillCurrent 확인에 실패해 아무것도 적용하지 않았음 (불변식 2) */
const STALE = Symbol('stale')

/** 불러온 기록을 화면에 적용한 결과: 내 키에 남길 기록(null 이면 남길 것 없음), 또는 적용하지 않음(STALE) */
type Applied = PendingEdit | null | typeof STALE

type AdoptOutcome = 'adopted' | 'none' | 'locked' | 'stale'

/** 불러오기를 시작할 때 찍어 두는 화면 상태 (불변식 2) */
interface Ticket {
  readonly gen: number
  readonly seq: number
  readonly dirty: boolean
}

/** 불러오기가 확인한 서버 상태: 있음 / 삭제됨 / 연결하지 못함(보여 줄 사본도 없음) */
type ServerCheck = 'found' | 'deleted' | { message: string; network: boolean }

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const NETWORK_ERROR = /failed to fetch|networkerror|load failed|fetch failed|network request failed/i

export function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function defaultIsOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export function toDraft(doc: DocumentRecord): DocumentDraft {
  return { title: doc.title, content: doc.content }
}

export function sameDraft(a: DocumentDraft, b: DocumentDraft): boolean {
  return a.title === b.title && JSON.stringify(a.content) === JSON.stringify(b.content)
}

function newInstanceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const initialSnapshot: SyncSnapshot = {
  phase: 'loading',
  doc: null,
  draft: null,
  status: 'saved',
  dirty: false,
  conflict: null,
  errorMessage: null,
  offlineCopy: false,
  recoverSource: null,
}

/**
 * 문서 하나의 자동 저장 상태 기계 (React 와 무관 — 훅은 얇은 래퍼). 동시성 규칙은 파일 맨 위의 불변식을 따른다.
 *
 * - 편집할 때마다 IndexedDB(PendingStore)에 이 편집 인스턴스 전용 키로 즉시 기록한다.
 *   살아 있는 동안 그 키의 잠금(Locks)을 쥐고 있어 백그라운드 동기화가 대신 보내지 않는다.
 * - debounce 후 `version` 조건부 UPDATE. 0행이면 충돌로 보고 사용자의 선택을 기다린다.
 *   충돌 중에는 원래 기준 version(baseVersion)과 충돌 표시를 그대로 기록해, 새로고침해도 충돌로 남는다.
 * - 오프라인이면 보내지 않고 대기, online 이벤트·재시도 타이머·다음 로드에서 다시 보낸다.
 * - 닫힌 탭이 남긴 같은 문서의 대기 기록(주인 없는 기록)은 화면이 깨끗할 때 넘겨받아 보여 준다.
 *   넘겨받기는 한 트랜잭션(PendingStore.transfer)이라, 실패하면 원래 기록이 그대로 남는다.
 * - 서버에서 삭제된 문서라도 이 기기에 남은 내용은 지우지 않고 복구 화면(phase 'deleted')으로 보여 준다.
 */
export function createDocumentSync(options: DocumentSyncOptions): DocumentSync {
  const { docId, userId, repo, store, cache, locks } = options
  const debounceMs = options.debounceMs ?? SAVE_DEBOUNCE_MS
  const retryMs = options.retryMs ?? RETRY_MS
  const isOnline = options.isOnline ?? defaultIsOnline
  const instanceId = options.instanceId ?? newInstanceId()
  const key = pendingKey(userId, docId, instanceId)

  let snapshot = initialSnapshot
  const listeners = new Set<() => void>()
  /** start/dispose 마다 증가 — 이전 세대의 비동기 결과를 버린다 (StrictMode 재마운트 대비) */
  let generation = 0
  /** start 와 dispose 사이에만 true — 정리된 뒤에는 타이머·넘겨받기·이어 저장을 새로 시작하지 않는다 */
  let active = false
  /** 화면의 draft·phase 가 바뀔 때마다 update() 가 올린다 — 입력·불러오기·사용자 선택 모두 (불변식 2) */
  let contentSeq = 0
  /** 대기 기록을 쓸 때마다 증가 — 기록의 revision */
  let revision = 0
  /** 지금 draft 가 기반한 서버 version. 충돌을 사용자가 해결하기 전까지 바꾸지 않는다 */
  let baseVersion: number | null = null
  /** 문서 유형 — 대기 기록에 함께 남겨, 서버에서 삭제돼도 같은 유형으로 복구한다 */
  let docType: DocumentType | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | null = null
  /** 진행 중인 '새 문서로 복구' — 끝나기 전에는 잠금을 놓지 않는다 */
  let restoring: Promise<string> | null = null
  /** 진행 중인 '버리기' */
  let discarding: Promise<void> | null = null
  let saveQueued = false
  let releaseLock: (() => void) | null = null
  let unsubscribeStore: (() => void) | null = null
  let adopting: Promise<void> | null = null
  let adoptAgain: { refresh: boolean } | null = null

  function update(patch: Partial<SyncSnapshot>) {
    // 화면 내용(draft)이나 단계(phase)가 바뀌면 순번을 올린다. await 전에 Ticket 을 찍어 둔 작업은
    // 이것으로 그 사이의 입력·다른 불러오기를 알아채고 물러난다 (불변식 2).
    if (('draft' in patch && patch.draft !== snapshot.draft) || ('phase' in patch && patch.phase !== snapshot.phase)) {
      contentSeq += 1
    }
    snapshot = { ...snapshot, ...patch }
    listeners.forEach((listener) => listener())
  }

  /** 지금 화면 상태를 찍어 둔다 — 불러오기를 시작할 때 */
  function ticket(): Ticket {
    return { gen: generation, seq: contentSeq, dirty: snapshot.dirty }
  }

  /**
   * t 를 찍은 뒤로 정리·재시작되지 않았고, 화면 내용도 보내지 않은 내용이 있는지도 그대로다.
   * 불러온 값은 이것이 참인 바로 그 동기 구간에서만 화면에 적용하고 기록으로 쓴다 (불변식 2).
   */
  function stillCurrent(t: Ticket): boolean {
    return t.gen === generation && t.seq === contentSeq && t.dirty === snapshot.dirty
  }

  function clearTimers() {
    clearTimeout(debounceTimer)
    clearTimeout(retryTimer)
    debounceTimer = undefined
    retryTimer = undefined
  }

  /** 현재 충돌 상태를 기록용 값으로 */
  function conflictReason(): PendingConflict | null {
    const conflict = snapshot.conflict
    if (!conflict) return null
    return conflict.server ? 'changed' : 'deleted'
  }

  /** 이 인스턴스의 다음 대기 기록 (기준 version 과 충돌 표시 포함). 기준 version 을 아직 모르면 null */
  function nextRecord(draft: DocumentDraft): PendingEdit | null {
    if (baseVersion === null) return null
    revision += 1
    return {
      userId,
      docId,
      instanceId,
      draft,
      baseVersion,
      revision,
      conflict: conflictReason(),
      savedAt: Date.now(),
      ...(docType ? { docType } : {}),
    }
  }

  /** 이 인스턴스의 대기 기록을 쓴다. 기록은 호출한 순서대로 적용된다 (IndexedDB 트랜잭션 순서) */
  function persist(draft: DocumentDraft): Promise<void> {
    const record = nextRecord(draft)
    if (!record) return Promise.resolve()
    return store.put(record).catch(() => {
      // IndexedDB 기록 실패는 치명적이지 않다 — 메모리의 draft 로 계속 저장을 시도한다.
    })
  }

  function cacheDoc(doc: DocumentRecord) {
    cache.put(userId, doc).catch(() => {})
  }

  /** 보낼 것도, 결정할 것도 없는 상태 (저장은 dirty 일 때만 일어나므로 저장 중이 아님) */
  function isIdle(): boolean {
    return snapshot.phase === 'ready' && !snapshot.dirty && snapshot.status !== 'conflict'
  }

  function scheduleSave(delay: number) {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      void save()
    }, delay)
  }

  function scheduleRetry() {
    if (!active) return
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      void flush()
    }, retryMs)
  }

  async function acquireLock(gen: number): Promise<boolean> {
    if (releaseLock) return true
    const release = await holdLock(locks, pendingLockName(key))
    if (gen !== generation || releaseLock) {
      release()
      return gen === generation
    }
    releaseLock = release
    return true
  }

  /** 저장 중 충돌 발견. server 가 null 이면 서버에서 삭제됨 → 지금 화면 내용 그대로 복구 화면 */
  function enterConflict(server: DocumentRecord | null) {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
    if (server) {
      update({ status: 'conflict', conflict: { server }, dirty: true })
    } else {
      update({ phase: 'deleted', status: 'conflict', conflict: { server: null }, dirty: true, recoverSource: 'pending' })
    }
    // 원래 기준 version 과 충돌 표시를 남긴다 → 새로고침해도 자동으로 보내지 않는다.
    if (snapshot.draft) void persist(snapshot.draft)
  }

  async function save(): Promise<void> {
    const { draft, dirty, status, phase } = snapshot
    if (phase !== 'ready' || !draft || !dirty || status === 'conflict' || baseVersion === null) return
    if (inFlight) {
      saveQueued = true
      return inFlight
    }
    if (!isOnline()) {
      update({ status: 'offline' })
      return
    }

    const gen = generation
    const seq = contentSeq
    const sentBase = baseVersion
    clearTimeout(retryTimer)
    update({ status: 'saving', errorMessage: null })

    const run = async () => {
      try {
        const result = await repo.update(docId, draft, sentBase)
        // 다른 곳(예: 이 문서의 다른 탭)에서 이미 같은 내용을 저장했으면 충돌이 아니다.
        const saved =
          result.kind === 'ok' ? result.doc : result.server && sameDraft(draft, toDraft(result.server)) ? result.server : null

        if (saved) {
          await onSaved(saved, seq, gen)
          return
        }

        if (gen !== generation) return
        // 충돌은 지금 화면(그 사이 입력 포함)을 그대로 두고 표시만 바꾼다.
        enterConflict(result.kind === 'conflict' ? result.server : null)
      } catch (error) {
        if (gen !== generation) return
        const message = errorMessageOf(error)
        if (!isOnline() || NETWORK_ERROR.test(message)) {
          update({ status: 'offline', errorMessage: null })
          scheduleRetry()
        } else {
          update({ status: 'error', errorMessage: message })
        }
      }
    }

    inFlight = run().finally(() => {
      inFlight = null
      if (saveQueued && gen === generation && active) {
        saveQueued = false
        // debounce 가 아직 남아 있으면 그쪽에 맡긴다.
        if (!debounceTimer) void save()
      }
    })
    return inFlight
  }

  /**
   * 서버가 seq 시점의 draft 를 saved.version 으로 갖게 됐다.
   * await 할 때마다 그 사이 화면이 바뀌었는지(contentSeq) 다시 확인한다 — 바뀌었으면 dirty 를 유지하고 이어서 보낸다.
   *
   * 세대가 바뀌었어도(정리 중) 기록 정리와 기준 version 갱신은 한다: 이 저장이 끝나기 전에는
   * 다시 시작하는 쪽이 잠금을 기다리므로(dispose → drain) 다른 곳이 baseVersion·draft 를 바꾸지 않는다.
   */
  async function onSaved(saved: DocumentRecord, seq: number, gen: number) {
    cacheDoc(saved)
    // 이후 입력의 기준 version. ack 를 기다리는 동안 입력해도 새 version 기준으로 기록된다.
    baseVersion = saved.version
    if (contentSeq === seq) {
      const sent = revision
      // 조건부: 그 사이 새 입력이 기록됐으면(revision 증가) 지우지 않는다.
      const acked = await store.ack(key, sent).catch(() => false)
      if (!acked && contentSeq === seq) {
        // sent 기록이 실패했다면 더 오래된 기록이 남아 있을 수 있다 — 그 내용은 이미 서버에 있다.
        const stale = await store.get(key).catch(() => undefined)
        if (stale && stale.revision < sent) await store.ack(key, stale.revision).catch(() => false)
      }
    }

    // await 뒤의 상태로 판단한다: ack 를 기다리는 동안 입력했을 수 있다.
    if (contentSeq !== seq) {
      // 저장 중에 새로 입력한 내용 — 새 version 기준으로 다시 기록해 두고(닫혀도 충돌로 오인되지 않게) 이어서 보낸다.
      if (snapshot.draft) await persist(snapshot.draft)
      update({ doc: saved, dirty: true, status: isOnline() ? 'saving' : 'offline', offlineCopy: false })
      if (gen === generation && active) saveQueued = true
      return
    }

    update({ doc: saved, dirty: false, status: 'saved', offlineCopy: false })
    if (gen === generation) scheduleAdopt({ refresh: false })
  }

  /**
   * 불러온 서버 상태(또는 사본)와 대기 기록을 합쳐 화면 상태를 정한다. t 이후 화면이 바뀌었으면 아무것도
   * 하지 않고 STALE. 확인부터 적용까지 동기 — 중간에 입력이 끼어들 수 없다.
   * 이 상태에 맞춰 내 키에 남겨야 할 기록을 돌려준다 (보낼 것이 없으면 null). 부른 쪽은 그 쓰기를 같은 동기 구간에서 요청한다.
   */
  function applyLoaded(t: Ticket, record: PendingEdit | null, server: DocumentRecord, offlineCopy: boolean): Applied {
    if (!stillCurrent(t)) return STALE
    docType = server.type
    const nothingToSend = !record || (record.conflict === null && sameDraft(record.draft, toDraft(server)))
    if (nothingToSend) {
      baseVersion = server.version
      update({
        phase: 'ready',
        doc: server,
        draft: toDraft(server),
        dirty: false,
        status: offlineCopy ? 'offline' : 'saved',
        conflict: null,
        errorMessage: null,
        offlineCopy,
        recoverSource: null,
      })
      return null
    }

    revision = Math.max(revision, record.revision)
    baseVersion = record.baseVersion
    // 사본만 보고는 서버가 바뀌었는지 알 수 없다 — 저장된 충돌 표시만 믿고, 나머지는 연결되면 서버가 판단한다.
    const conflicted = record.conflict !== null || (!offlineCopy && record.baseVersion !== server.version)
    update({
      phase: 'ready',
      doc: server,
      draft: record.draft,
      dirty: true,
      status: conflicted ? 'conflict' : offlineCopy || !isOnline() ? 'offline' : 'saving',
      conflict: conflicted ? { server } : null,
      errorMessage: null,
      offlineCopy,
      recoverSource: null,
    })
    return nextRecord(record.draft)
  }

  /**
   * 서버에서 삭제된 문서의 대기 편집을 복구 화면으로 보여 준다. t 이후 화면이 바뀌었으면 아무것도 하지 않고 STALE.
   * 내 키에 남길 기록(삭제됨 표시)을 돌려준다.
   */
  function applyDeleted(t: Ticket, record: PendingEdit, cached: DocumentRecord | null): Applied {
    if (!stillCurrent(t)) return STALE
    docType = cached?.type ?? record.docType ?? docType
    revision = Math.max(revision, record.revision)
    baseVersion = record.baseVersion
    update({
      phase: 'deleted',
      doc: cached,
      draft: record.draft,
      dirty: true,
      status: 'conflict',
      conflict: { server: null },
      errorMessage: null,
      offlineCopy: false,
      recoverSource: 'pending',
    })
    return nextRecord(record.draft)
  }

  /** 서버에서 삭제됐고 대기 편집도 없을 때: 이 기기의 마지막 사본을 복구 화면으로. t 이후 화면이 바뀌었으면 false */
  function showCachedCopy(t: Ticket, cached: DocumentRecord): boolean {
    if (!stillCurrent(t)) return false
    docType = cached.type
    update({
      phase: 'deleted',
      doc: cached,
      draft: toDraft(cached),
      dirty: false,
      status: 'saved',
      conflict: null,
      errorMessage: null,
      offlineCopy: false,
      recoverSource: 'cache',
    })
    return true
  }

  /** 보여 줄 것이 없음. t 이후 화면이 바뀌었으면 false */
  function showNotFound(t: Ticket): boolean {
    if (!stillCurrent(t)) return false
    update({ ...initialSnapshot, phase: 'notfound' })
    return true
  }

  /** 불러오지 못함(보여 줄 사본도 없음). t 이후 화면이 바뀌었으면 false */
  function showError(t: Ticket, message: string, network: boolean): boolean {
    if (!stillCurrent(t)) return false
    update({ phase: 'error', errorMessage: message, status: network ? 'offline' : 'error' })
    return true
  }

  /** 깨끗한 화면을 서버의 최신 내용으로. t 이후 화면이 바뀌었으면 false */
  function showServer(t: Ticket, server: DocumentRecord): boolean {
    if (!stillCurrent(t)) return false
    baseVersion = server.version
    update({ doc: server, draft: toDraft(server), status: 'saved', offlineCopy: false })
    return true
  }

  /**
   * 불러온 값으로 화면을 바꾸지 않기로 했을 때 — 화면이 보내지 않은 내용을 들고 있었거나, 불러오는 동안 바뀌었다
   * (불변식 2·3). 지금 화면(가장 최근 내용)을 그대로 두고, 확인한 서버 상태에 맞춰 이어 간다:
   * 삭제됐으면 지금 내용 그대로 복구 화면으로('삭제됨' 표시와 함께 기록), 있으면 이어서 저장, 연결하지 못했으면 상태만 알린다.
   * 깨끗한 화면이나 복구 화면은 지킬 것이 없다(이미 저장됐거나 기록돼 있다). 정리·재시작됐으면 새 세대가 맡는다.
   */
  function keepScreen(t: Ticket, server: ServerCheck, offlineCopy = false) {
    const { phase, dirty, status } = snapshot
    if (t.gen !== generation || phase !== 'ready' || !dirty) return
    if (server === 'deleted') enterConflict(null)
    else if (server === 'found') continueEditing(offlineCopy)
    else if (status !== 'conflict') {
      update({ status: server.network ? 'offline' : 'error', errorMessage: server.network ? null : server.message })
    }
  }

  /** 같은 문서에 대해 주인(살아 있는 편집기)이 없는 다른 인스턴스의 기록들, 최근 것부터 */
  async function listOrphanCandidates(): Promise<PendingEdit[]> {
    const records = await store.list(userId).catch((): PendingEdit[] => [])
    return records
      .filter((record) => record.docId === docId && keyOf(record) !== key)
      .sort((a, b) => b.savedAt - a.savedAt)
  }

  /**
   * 주인 없는 기록 하나를 넘겨받는다. 그 기록의 잠금을 바로 얻을 수 있을 때만(=주인 탭이 닫혔을 때만).
   *
   * 기록을 읽은 뒤 apply 가 t 를 확인하고 화면에 적용하면(동기), 곧바로 한 트랜잭션으로 옮긴다: 원래 기록 확인 →
   * 내 키에 쓰기 → 원래 기록 지우기. 옮기기가 실패하면 원래 기록이 그대로 남는다(유일한 사본을 먼저 지우는 일이 없다).
   * 확인·적용·옮기기 요청이 한 동기 구간이라, 이후 입력의 기록은 옮기기 트랜잭션 뒤에 적용된다 (불변식 4).
   * 그 사이 화면이 바뀌었으면 아무것도 건드리지 않고 'stale'.
   * 넘겨받지 못했는데 잠금을 얻지 못한 후보가 있었으면 'locked' (살아 있는 탭이나 백그라운드 동기화가 쥐고 있음).
   */
  async function adoptOrphan(
    t: Ticket,
    candidates: PendingEdit[],
    apply: (record: PendingEdit) => Applied,
  ): Promise<AdoptOutcome> {
    let sawLocked = false
    for (const candidate of candidates) {
      if (!stillCurrent(t)) return 'stale'
      const orphanKey = keyOf(candidate)
      const result = await locks.tryRequest(
        pendingLockName(orphanKey),
        async (): Promise<'adopted' | 'stale' | 'skipped'> => {
          const current = await store.get(orphanKey).catch(() => undefined)
          if (!current || current.userId !== userId) return 'skipped'
          const mine = apply(current)
          if (mine === STALE) return 'stale'
          // 실패하면(false/reject) 원래 기록이 남는다 — 화면의 내용은 그 기록에도 있으므로 잃지 않는다.
          await store.transfer(orphanKey, current.revision, mine).catch(() => false)
          return 'adopted'
        },
      )
      if (!result.acquired) sawLocked = true
      else if (result.value !== 'skipped') return result.value
    }
    if (!stillCurrent(t)) return 'stale'
    return sawLocked ? 'locked' : 'none'
  }

  /** 화면이 깨끗할 때: 주인 없는 기록을 넘겨받거나(refresh 면) 서버의 최신 내용으로 갱신한다 */
  async function adoptIfIdle(refresh: boolean): Promise<void> {
    if (!isIdle()) return
    // 깨끗한 화면에서 찍는다 — 그 뒤 입력하거나(dirty·draft) 다른 불러오기가 화면을 바꾸면 stillCurrent 가 거짓이 된다.
    const t = ticket()
    const candidates = await listOrphanCandidates()
    if (candidates.length === 0 && !refresh) return
    if (!stillCurrent(t)) return

    let server = snapshot.doc
    let fresh = false
    if (isOnline()) {
      try {
        const latest = await repo.get(docId)
        // 서버에서 삭제됐으면 여기서 넘겨받지 않는다 — 그 기록은 '삭제됨'으로 표시되어 복구 화면으로 이어진다.
        if (!latest) return
        server = latest
        fresh = true
        cacheDoc(latest)
      } catch {
        // 연결이 안 되면 알고 있는 상태로 판단한다.
      }
    }
    if (!server || !stillCurrent(t)) return
    const base = server
    const offlineCopy = !fresh && snapshot.offlineCopy

    if (candidates.length > 0) {
      const outcome = await adoptOrphan(t, candidates, (record) => applyLoaded(t, record, base, offlineCopy))
      if (outcome === 'adopted') {
        if (snapshot.status === 'saving') void save()
        return
      }
    }
    if (fresh && base.version !== baseVersion) showServer(t, base)
  }

  function scheduleAdopt(request: { refresh: boolean }) {
    if (!active) return
    if (adopting) {
      adoptAgain = { refresh: request.refresh || (adoptAgain?.refresh ?? false) }
      return
    }
    adopting = adoptIfIdle(request.refresh).finally(() => {
      adopting = null
      const again = adoptAgain
      adoptAgain = null
      if (again) scheduleAdopt(again)
    })
  }

  function onStoreChange(change: PendingChange) {
    // 다른 인스턴스(닫힌 탭의 기록, 백그라운드 동기화 결과)가 같은 문서의 기록을 바꿨다.
    if (change.userId !== userId || change.docId !== docId || change.key === key) return
    scheduleAdopt({ refresh: true })
  }

  /** 들고 있는 입력을 덮어쓰지 않고 이어서 보낸다 */
  function continueEditing(offlineCopy: boolean) {
    if (snapshot.status === 'conflict') return
    update({ offlineCopy })
    void save()
  }

  /**
   * 서버에 없는 문서. 이 기기에 남은 대기 편집(내 것 또는 닫힌 탭의 것)이 있으면 지우지 않고 복구 화면으로,
   * 대기 편집은 없지만 마지막 사본이 있으면 사본을 복구 화면으로, 둘 다 없으면 notfound.
   * 화면에 적용하는 것은 모두 t 가 그대로일 때뿐이다 — 그 사이 입력이 있었으면 지금 내용 그대로 복구 화면으로 간다.
   */
  async function loadDeleted(t: Ticket): Promise<void> {
    const cached = (await cache.get(userId, docId).catch(() => undefined)) ?? null
    const own = await store.get(key).catch(() => undefined)
    if (own) {
      const mine = applyDeleted(t, own, cached)
      if (mine === STALE) {
        keepScreen(t, 'deleted')
        return
      }
      // 읽은 revision 그대로일 때만 바꿔 쓴다 — 그 사이 더 새 기록이 생겼으면 덮어쓰지 않는다 (불변식 4).
      await store.transfer(key, own.revision, mine).catch(() => false)
      return
    }
    const show = (record: PendingEdit) => applyDeleted(t, record, cached)
    let outcome = await adoptOrphan(t, await listOrphanCandidates(), show)
    // 백그라운드 동기화(이 탭이나 다른 탭)가 그 기록을 '삭제됨'으로 표시하느라 잠깐 쥐고 있을 수 있다 — 조금 기다렸다 다시.
    // 기다리는 동안 입력하면 다음 시도가 'stale' 로 끝난다.
    for (let attempt = 0; outcome === 'locked' && attempt < LOCKED_RETRIES; attempt += 1) {
      await wait(LOCKED_RETRY_MS)
      outcome = await adoptOrphan(t, await listOrphanCandidates(), show)
    }
    if (outcome === 'adopted') return
    if (!(cached ? showCachedCopy(t, cached) : showNotFound(t))) keepScreen(t, 'deleted')
  }

  async function start(): Promise<void> {
    const gen = ++generation
    active = true
    clearTimers()
    saveQueued = false
    unsubscribeStore ??= store.subscribe(onStoreChange)
    // 같은 문서를 다시 시작하면(StrictMode, 사본을 보다가 다시 연결) 이미 불러온 상태를 유지한 채 새로 확인한다.
    if (snapshot.phase !== 'ready') update({ ...initialSnapshot })

    if (!(await acquireLock(gen))) return
    // 이 시점의 화면. 아래에서 불러온 값은 화면이 이대로일 때만 적용한다 (불변식 2).
    const t = ticket()
    // 보내지 않은 내용을 든 화면 — 이번 불러오기는 서버 상태를 확인할 뿐 화면을 바꾸지 않는다 (불변식 3).
    const held = snapshot.dirty

    let server: DocumentRecord | null
    let offlineCopy = false
    try {
      server = await repo.get(docId)
    } catch (error) {
      if (t.gen !== generation) return
      const message = errorMessageOf(error)
      const network = !isOnline() || NETWORK_ERROR.test(message)
      const cached = network ? await cache.get(userId, docId).catch(() => undefined) : undefined
      if (t.gen !== generation) return
      if (!cached) {
        // 들고 있던(또는 그 사이 입력한) 내용이 있으면 화면은 그대로 두고 상태만 알린다 — 연결되면 다시 보낸다.
        if (held || !showError(t, message, network)) keepScreen(t, { message, network })
        if (network) scheduleRetry()
        return
      }
      server = cached
      offlineCopy = true
    }
    if (t.gen !== generation) return
    if (server && !offlineCopy) cacheDoc(server)

    if (held || !stillCurrent(t)) {
      // 들고 있던 입력은 그 내용 그대로 — 삭제됐으면 복구 화면으로(대기 기록에 '삭제됨'으로 남긴다), 아니면 이어서 저장.
      keepScreen(t, server ? 'found' : 'deleted', offlineCopy)
      return
    }
    if (!server) {
      await loadDeleted(t)
      return
    }

    const base = server
    const own = await store.get(key).catch(() => undefined)
    if (own) {
      const mine = applyLoaded(t, own, base, offlineCopy)
      if (mine === STALE) {
        keepScreen(t, 'found', offlineCopy)
        return
      }
      // 읽은 revision 그대로일 때만 바꿔 쓴다(mine 이 null 이면 지운다) — 더 새 기록은 건드리지 않는다 (불변식 4).
      void store.transfer(key, own.revision, mine).catch(() => false)
    } else {
      const outcome = await adoptOrphan(t, await listOrphanCandidates(), (record) =>
        applyLoaded(t, record, base, offlineCopy),
      )
      // 넘겨받은 기록이 없으면 서버 상태 그대로 보여 준다.
      if (outcome !== 'adopted' && applyLoaded(t, null, base, offlineCopy) === STALE) {
        keepScreen(t, 'found', offlineCopy)
        return
      }
    }

    if (snapshot.offlineCopy) scheduleRetry()
    else if (snapshot.status === 'saving') await save()
  }

  function edit(patch: Partial<DocumentDraft>) {
    const { draft, phase, status } = snapshot
    if (phase !== 'ready' || !draft || baseVersion === null) return
    const next = { ...draft, ...patch }
    const inConflict = status === 'conflict'
    // draft 가 바뀌므로 update() 가 contentSeq 를 올린다 — 진행 중인 불러오기는 이 화면을 덮어쓰지 않는다.
    update({
      draft: next,
      dirty: true,
      status: inConflict ? 'conflict' : isOnline() ? 'saving' : 'offline',
      errorMessage: inConflict ? snapshot.errorMessage : null,
    })
    // 충돌 중이면 baseVersion 은 원래 값 그대로, 충돌 표시와 함께 기록된다.
    void persist(next)
    if (!inConflict) scheduleSave(debounceMs)
  }

  async function flush(): Promise<void> {
    if (!active) return
    clearTimeout(debounceTimer)
    debounceTimer = undefined
    const { phase, offlineCopy, dirty } = snapshot
    // 불러오지 못했거나 사본만 보고 있으면, 연결됐을 때 서버에서 다시 불러온다.
    if (isOnline() && (phase === 'error' || (offlineCopy && !dirty))) {
      await start()
      return
    }
    await save()
  }

  async function resolveConflict(choice: ConflictChoice): Promise<void> {
    const conflict = snapshot.conflict
    // 서버에서 삭제된 문서는 복구 화면(restoreAsNew / discardDeleted)에서 정한다 — 한 번의 클릭으로 버리지 않는다.
    if (!conflict || !conflict.server || snapshot.phase !== 'ready') return
    const server = conflict.server

    // 사용자의 선택은 누른 순간 동기적으로 적용한다 (await 전에 읽은 값을 뒤에 적용하는 일이 없다).
    if (choice === 'server') {
      clearTimers()
      baseVersion = server.version
      store.remove(key).catch(() => {})
      update({ doc: server, draft: toDraft(server), dirty: false, status: 'saved', conflict: null, errorMessage: null })
      scheduleAdopt({ refresh: false })
      return
    }

    // 'mine': 최신 서버 version 을 기준으로 내 draft 를 다시 보낸다.
    const draft = snapshot.draft ?? toDraft(server)
    baseVersion = server.version
    update({ doc: server, conflict: null, dirty: true, status: 'saving' })
    void persist(draft)
    await save()
  }

  async function restoreAsNew(): Promise<string> {
    // 두 번 눌러도 새 문서는 하나만 만든다.
    if (restoring) return restoring
    const { phase, draft, recoverSource } = snapshot
    if (phase !== 'deleted' || !draft) throw new Error('복구할 내용이 없어요.')
    const t = ticket()
    const sent = revision
    const type: DocumentType = docType && documentTypes.includes(docType) ? docType : 'handout'

    const run = (async () => {
      const created = await repo.create({ type, title: draft.title, content: draft.content })
      cacheDoc(created)
      // 새 문서가 서버에 만들어진 뒤에만 이 기기의 기록을 정리한다 (조건부 — 내가 본 revision 그대로일 때만).
      if (recoverSource === 'pending') await store.ack(key, sent).catch(() => false)
      await cache.remove(userId, docId).catch(() => {})
      // 그 사이 화면이 바뀌었으면(다른 기록을 넘겨받는 등) 그 화면을 그대로 둔다.
      showNotFound(t)
      return created.id
    })()
    restoring = run
    try {
      return await run
    } finally {
      if (restoring === run) restoring = null
    }
  }

  async function discardDeleted(): Promise<void> {
    // 두 번 불러도 한 번만 버린다 — 앞의 버리기가 이어서 보여 준 기록을 뒤의 버리기가 지우지 않게.
    if (discarding) return discarding
    const { phase, recoverSource, doc } = snapshot
    if (phase !== 'deleted') return
    const t = ticket()

    const run = (async () => {
      if (recoverSource === 'pending') {
        // 사용자가 내용을 확인하고 직접 버리기로 했다. 실패하면 reject — 화면에 알리고 기록은 남는다.
        await store.remove(key)
        // 닫힌 탭이 남긴 같은 문서의 기록이 더 있으면 이어서 보여 준다.
        const outcome = await adoptOrphan(t, await listOrphanCandidates(), (record) => applyDeleted(t, record, doc))
        if (outcome === 'adopted' || outcome === 'stale') return
      }
      await cache.remove(userId, docId).catch(() => {})
      showNotFound(t)
    })()
    discarding = run
    try {
      await run
    } finally {
      if (discarding === run) discarding = null
    }
  }

  /**
   * 정리 직전의 마무리. 판단은 기다린 뒤에 한다: 진행 중이던 저장·복구가 끝난 다음에도
   * 보내지 않은 입력이 남아 있으면 한 번 더 보낸다 (진행 중인 것이 없으면 save 는 동기적으로 바로 시작된다).
   */
  async function drain(gen: number): Promise<void> {
    for (;;) {
      const pending = inFlight ?? restoring
      if (!pending) break
      await pending.catch(() => {})
    }
    // 그 사이 다시 시작(StrictMode)됐으면 새 세대가 이어서 한다.
    if (gen === generation) await save()
  }

  function dispose() {
    clearTimers()
    active = false
    const gen = ++generation
    unsubscribeStore?.()
    unsubscribeStore = null
    // 마지막 저장이 끝난 뒤 잠금을 푼다 — 그 전에 다른 곳이 같은 기록을 보내지 않도록.
    const release = releaseLock
    releaseLock = null
    const drained = drain(gen).catch(() => {})
    if (release) void drained.finally(release)
  }

  return {
    instanceId,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    start,
    edit,
    flush,
    resolveConflict,
    restoreAsNew,
    discardDeleted,
    dispose,
  }
}
