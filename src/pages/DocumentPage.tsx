import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { LoadingState } from '../components/LoadingState'
import { SaveStatusChip } from '../components/SaveStatusChip'
import { contentText, documentTypeLabels, type DocumentDraft, type DocumentRecord } from '../lib/documents'
import { errorMessageOf, type ConflictChoice, type RecoverSource } from '../lib/documentSync'
import { formatRelativeTime } from '../lib/format'
import { useDocument } from '../lib/useDocument'
import { NotFoundPage } from './NotFoundPage'
import './DocumentPage.css'

interface ConflictBannerProps {
  server: DocumentRecord | null
  onResolve(choice: ConflictChoice): void
}

function ConflictBanner({ server, onResolve }: ConflictBannerProps) {
  return (
    <div className="callout danger conflict-banner" role="alert">
      <Icon name="alert" />
      <div>
        <b>다른 기기에서 이 문서가 먼저 수정되었어요.</b>
        <p>
          {server
            ? `서버 버전(${formatRelativeTime(server.updated_at)} 저장)과 지금 화면의 내용이 다릅니다. 어느 쪽을 남길지 골라 주세요.`
            : '다른 기기에서 이 문서를 삭제했어요.'}
        </p>
        <div className="conflict-actions">
          <button type="button" className="btn small" onClick={() => onResolve('server')}>
            서버 버전 불러오기
          </button>
          {server && (
            <button type="button" className="btn small danger solid" onClick={() => onResolve('mine')}>
              내 변경으로 덮어쓰기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface DeletedRecoveryProps {
  doc: DocumentRecord | null
  draft: DocumentDraft
  source: RecoverSource
  onRestore(): Promise<string>
  onDiscard(): Promise<void>
}

/**
 * 서버에서 삭제된 문서. 이 기기에 남아 있는 내용(서버에 반영되지 않은 변경, 또는 마지막 사본)을
 * 읽기 전용으로 보여 주고, 새 문서로 복구 · 내용 복사 · (확인 후) 버리기를 고르게 한다.
 */
function DeletedRecovery({ doc, draft, source, onRestore, onDiscard }: DeletedRecoveryProps) {
  const navigate = useNavigate()
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [confirming, setConfirming] = useState(false)
  const pending = source === 'pending'
  const text = contentText(draft.content)
  const typeLabel = doc ? documentTypeLabels[doc.type] : '문서'

  async function restore() {
    setRestoring(true)
    setRestoreError(null)
    try {
      const id = await onRestore()
      navigate(`/documents/${id}`, { replace: true })
    } catch (error) {
      setRestoreError(errorMessageOf(error))
      setRestoring(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text ? `${draft.title}\n\n${text}` : draft.title)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <article className="doc-editor doc-recover">
      <title>{`${draft.title || '제목 없음'} · FOLIO`}</title>
      <div className="callout danger recover-banner" role="alert">
        <Icon name="alert" />
        <div>
          <b>서버에서 삭제된 문서입니다</b>
          <p>
            {pending
              ? '다른 곳에서 이 문서를 삭제했어요. 아래는 이 기기에만 남아 있는, 서버에 반영되지 않은 변경이에요. 새 문서로 복구하거나 내용을 복사해 두세요.'
              : '아래는 이 기기에 마지막으로 저장해 둔 사본이에요. 필요하면 새 문서로 복구하거나 내용을 복사해 두세요.'}
          </p>
          <div className="conflict-actions">
            <button type="button" className="btn small primary" onClick={() => void restore()} disabled={restoring}>
              {restoring ? '복구하는 중…' : '새 문서로 복구'}
            </button>
            <button type="button" className="btn small" onClick={() => void copy()}>
              내용 복사
            </button>
            <button
              type="button"
              className="btn small danger"
              onClick={() => setConfirming(true)}
              disabled={restoring}
            >
              {pending ? '변경 버리기' : '사본 지우기'}
            </button>
          </div>
        </div>
      </div>
      {restoreError && (
        <p className="field-error" role="alert">
          새 문서로 복구하지 못했어요: {restoreError} 내용은 이 기기에 그대로 남아 있어요.
        </p>
      )}
      {copyState !== 'idle' && (
        <p className={copyState === 'copied' ? 'field-help' : 'field-error'} role="status">
          {copyState === 'copied'
            ? '제목과 본문을 클립보드에 복사했어요.'
            : '복사하지 못했어요. 아래 내용을 직접 선택해 복사해 주세요.'}
        </p>
      )}

      <div className="editor-header">
        <div className="doc-title-wrap">
          <div className="eyebrow">DOCUMENT / {typeLabel} · 삭제됨</div>
          <label className="sr-only" htmlFor="doc-title">
            문서 제목
          </label>
          <input id="doc-title" className="doc-title" value={draft.title} placeholder="제목 없음" readOnly />
          <p>{pending ? '서버에 반영되지 않은 변경 · 읽기 전용' : '이 기기에 저장해 둔 사본 · 읽기 전용'}</p>
        </div>
      </div>
      <section className="doc-body">
        <label className="field-label" htmlFor="doc-text">
          본문
        </label>
        <textarea id="doc-text" className="field-textarea doc-text" value={text} readOnly />
      </section>

      {confirming && (
        <ConfirmDialog
          title={pending ? '변경을 버릴까요?' : '사본을 지울까요?'}
          message={
            pending
              ? '이 기기에만 남아 있는 변경이 영구히 사라져요. 서버에도 없는 내용이라 되돌릴 수 없어요.'
              : '이 기기에 저장해 둔 사본을 지워요. 되돌릴 수 없어요.'
          }
          confirmLabel={pending ? '버리기' : '지우기'}
          danger
          onConfirm={async () => {
            await onDiscard()
            setConfirming(false)
            setCopyState('idle')
            setRestoreError(null)
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </article>
  )
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

  const typeLabel = documentTypeLabels[doc.type]

  return (
    <article className="doc-editor">
      <title>{`${draft.title || '제목 없음'} · FOLIO`}</title>
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
          <Link to="/library" className="btn small">
            보관함으로
          </Link>
        </div>
      </div>

      {conflict && <ConflictBanner server={conflict.server} onResolve={(choice) => void resolveConflict(choice)} />}
      {status === 'error' && errorMessage && (
        <p className="field-error" role="alert">
          저장하지 못했어요: {errorMessage}
        </p>
      )}
      {offlineCopy && (
        <p className="field-help">
          서버에 연결하지 못해 이 기기에 마지막으로 저장해 둔 사본을 보여 주고 있어요. 연결되면 서버 버전을 다시 확인합니다.
        </p>
      )}
      {status === 'offline' && (
        <p className="field-help">오프라인 상태예요. 변경 내용은 이 기기에 보관했다가 연결되면 자동으로 저장합니다.</p>
      )}

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
        <p className="field-help">
          {typeLabel} 전용 편집 화면은 다음 단계에서 열립니다. 지금은 기기 간 동기화 확인용 기본 편집기예요.
        </p>
      </section>
    </article>
  )
}

export function DocumentPage() {
  const { id = '' } = useParams()
  // 문서가 바뀌면 편집 상태를 통째로 새로 만든다.
  return (
    <>
      <h1 className="sr-only">문서 편집</h1>
      <DocumentEditor key={id} docId={id} />
    </>
  )
}
