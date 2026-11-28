import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { DeletedRecovery } from '../components/document/DeletedRecovery'
import '../components/document/DocumentEditor.css'
import { SyncNotices } from '../components/document/SyncNotices'
import { Icon } from '../components/Icon'
import { LoadingState } from '../components/LoadingState'
import { SaveStatusChip } from '../components/SaveStatusChip'
import { isStructuredHandout } from '../features/handout/model'
import { isRoll20Log } from '../features/log/roll20/model'
import { CCFOLIA_LOG_FORMAT, isCcfoliaLog } from '../features/log/ccfolia/model'
import { blockRoll20Text } from '../features/handout/blockRoll20'
import { resolveLayout } from '../features/handout/layout'
import { contentText, documentPath, documentTypeLabels, type DocumentContent } from '../lib/documents'
import { formatRelativeTime } from '../lib/format'
import { useAuth } from '../lib/auth/context'
import { useDocument } from '../lib/useDocument'
import { useRepository } from '../lib/useRepository'
import { useSyncServices } from '../lib/sync/context'
import type { DocumentType } from '../lib/database.types'
import { NotFoundPage } from './NotFoundPage'

/** 복구 화면에 보여 주고 복사할 본문 (핸드아웃 형식이면 그 글, 이전 단계의 `{ text }` 면 text) */
function recoveryText(content: DocumentContent): string {
  return isStructuredHandout(content) ? blockRoll20Text(resolveLayout(content)) : contentText(content)
}

function DocumentEditor({ docId }: { docId: string }) {
  const {
    phase,
    doc,
    draft,
    status,
    conflict,
    errorMessage,
    offlineCopy,
    recoverSource,
    edit,
    flush,
    resolveConflict,
    restoreAsNew,
    discardDeleted,
  } = useDocument(docId)

  if (phase === 'loading') return <LoadingState label="문서를 불러오는 중…" />
  if (phase === 'notfound') return <NotFoundPage />
  // 삭제된 문서는 절대 편집 화면으로 넘어가지 않는다 (읽기 전용 복구 화면)
  if (phase === 'deleted')
    return draft ? (
      <DeletedRecovery
        doc={doc}
        draft={draft}
        source={recoverSource ?? 'pending'}
        bodyText={recoveryText(draft.content)}
        restorePath={(id) => `/documents/${id}`}
        onRestore={restoreAsNew}
        onDiscard={discardDeleted}
      />
    ) : (
      <NotFoundPage />
    )
  if (phase === 'error' || !doc || !draft)
    return (
      <div className="callout danger" role="alert">
        <Icon name="alert" />
        <span>문서를 불러오지 못했어요. 네트워크 연결을 확인한 뒤 새로고침해 주세요. {errorMessage}</span>
      </div>
    )

  // 스튜디오 형식으로 저장된 핸드아웃은 스튜디오에서 연다 (동기화되지 않은 변경 목록 등에서 온 링크)
  if (doc.type === 'handout' && isStructuredHandout(draft.content))
    return <Navigate to={documentPath('handout', doc.id)} replace />
  if (doc.type === 'log' && isRoll20Log(draft.content)) return <Navigate to={documentPath('log', doc.id)} replace />
  if (doc.type === 'log' && isCcfoliaLog(draft.content)) return <Navigate to={documentPath('log', doc.id, CCFOLIA_LOG_FORMAT)} replace />

  const typeLabel = documentTypeLabels[doc.type]

  return (
    <article className="doc-editor">
      <title>{`${draft.title || '제목 없음'} · ORarchive`}</title>
      <div className="editor-header">
        <div className="doc-title-wrap">
          <div className="eyebrow">DOCUMENT / {typeLabel}</div>
          <label className="sr-only" htmlFor="doc-title">
            문서 제목
          </label>
          <input
            id="doc-title"
            className="doc-title"
            value={draft.title}
            maxLength={200}
            placeholder="제목 없음"
            onChange={(event) => edit({ title: event.target.value })}
          />
          <p>
            {typeLabel} · v{doc.version} ·{' '}
            {offlineCopy ? '이 기기에 저장해 둔 사본' : `${formatRelativeTime(doc.updated_at)} 서버에 저장`}
          </p>
        </div>
        <div className="editor-toolbar">
          <SaveStatusChip status={status} />
          {status === 'error' && (
            <button type="button" className="btn small" onClick={() => void flush()}>
              다시 시도
            </button>
          )}
          <Link to="/" className="btn small">
            홈으로
          </Link>
        </div>
      </div>

      <SyncNotices
        conflict={conflict}
        status={status}
        errorMessage={errorMessage}
        offlineCopy={offlineCopy}
        onResolve={(choice) => void resolveConflict(choice)}
      />
      <section className="doc-body">
        <label className="field-label" htmlFor="doc-text">
          본문
        </label>
        <textarea
          id="doc-text"
          className="field-textarea doc-text"
          value={contentText(draft.content)}
          placeholder="여기에 내용을 적어 보세요. 입력을 멈추면 자동으로 저장됩니다."
          onChange={(event) => edit({ content: { ...draft.content, text: event.target.value } })}
        />
        {doc.type !== 'handout' && (
          <p className="field-help">
            {typeLabel} 전용 편집 화면은 다음 단계에서 열립니다. 지금은 기기 간 동기화 확인용 기본 편집기예요.
          </p>
        )}
      </section>
    </article>
  )
}

/**
 * 이 문서를 열 편집기를 정한다 — 문서를 열기(동기화 시작) 전에.
 * 기본 편집기는 자동 저장이라, 수동 저장 문서(핸드아웃 · 롤꾸코드)를 열면 저장하지 않은 변경을 보내 버린다.
 * 그래서 종류는 이 기기의 대기 기록 → 마지막으로 본 사본 → 서버 순으로 읽기만 해서 알아낸다.
 * - handout · roll20code: 항상 그 편집기로 (삭제된 문서 복구도 그 편집기가 맡는다)
 * - log: Roll20 · 코코포리아 로그면 그 로그 편집기로, 아니면(아주 예전 `{ text }` 로그) 기본 편집기
 * - 그 밖: 기본 편집기
 */
type Route = { to: string } | { basic: true } | { notFound: true } | { error: true }

function editorFor(type: DocumentType | undefined, content: DocumentContent | undefined, id: string): Route {
  if (type === 'handout' || type === 'roll20code') return { to: documentPath(type, id) }
  if (type === 'log' && content && isRoll20Log(content)) return { to: documentPath('log', id) }
  if (type === 'log' && content && isCcfoliaLog(content)) return { to: documentPath('log', id, CCFOLIA_LOG_FORMAT) }
  return { basic: true }
}

function useEditorRoute(docId: string): Route | null {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const repo = useRepository()
  const { store, cache } = useSyncServices()
  const [route, setRoute] = useState<{ docId: string; route: Route } | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      const pending = (await store.list(userId).catch(() => [])).find((record) => record.docId === docId)
      const cached = await cache.get(userId, docId).catch(() => undefined)
      let server: Awaited<ReturnType<typeof repo.get>> | undefined
      let failed = false
      try {
        server = await repo.get(docId)
      } catch {
        failed = true
      }
      if (!alive) return
      const known = server ?? cached
      let next: Route
      if (known) next = editorFor(known.type, pending?.draft.content ?? known.content, docId)
      else if (pending) next = editorFor(pending.docType ?? 'handout', pending.draft.content, docId)
      else next = failed ? { error: true } : { notFound: true }
      setRoute({ docId, route: next })
    })()
    return () => {
      alive = false
    }
  }, [docId, userId, repo, store, cache])
  return route?.docId === docId ? route.route : null
}

export function DocumentPage() {
  const { id = '' } = useParams()
  const route = useEditorRoute(id)
  if (!route) return <LoadingState label="문서를 불러오는 중…" />
  if ('to' in route) return <Navigate to={route.to} replace />
  if ('notFound' in route) return <NotFoundPage />
  if ('error' in route)
    return (
      <div className="callout danger" role="alert">
        <Icon name="alert" />
        <span>문서를 불러오지 못했어요. 네트워크 연결을 확인한 뒤 새로고침해 주세요.</span>
      </div>
    )
  // 문서가 바뀌면 편집 상태를 통째로 새로 만든다.
  return (
    <>
      <h1 className="sr-only">문서 편집</h1>
      <DocumentEditor key={id} docId={id} />
    </>
  )
}
