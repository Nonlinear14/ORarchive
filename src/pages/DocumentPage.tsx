import { Link, Navigate, useParams } from 'react-router'
import { DeletedRecovery } from '../components/document/DeletedRecovery'
import '../components/document/DocumentEditor.css'
import { SyncNotices } from '../components/document/SyncNotices'
import { Icon } from '../components/Icon'
import { LoadingState } from '../components/LoadingState'
import { SaveStatusChip } from '../components/SaveStatusChip'
import { isStructuredHandout } from '../features/handout/model'
import { isRoll20Log } from '../features/log/roll20/model'
import { roll20Text } from '../features/handout/roll20'
import { resolveHandout } from '../features/handout/templates'
import { contentText, documentPath, documentTypeLabels, type DocumentContent } from '../lib/documents'
import { formatRelativeTime } from '../lib/format'
import { useDocument } from '../lib/useDocument'
import { NotFoundPage } from './NotFoundPage'

/** 복구 화면에 보여 주고 복사할 본문 (핸드아웃 형식이면 그 글, 이전 단계의 `{ text }` 면 text) */
function recoveryText(content: DocumentContent): string {
  return isStructuredHandout(content) ? roll20Text(resolveHandout(content)) : contentText(content)
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
      {doc.type === 'handout' && (
        <div className="callout handout-moved">
          <Icon name="handout" />
          <span>
            핸드아웃은 이제 스튜디오에서 디자인과 함께 편집해요.{' '}
            <Link to={documentPath('handout', doc.id)} className="text-link">
              핸드아웃 스튜디오에서 열기 <Icon name="arrow" />
            </Link>
          </span>
        </div>
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
        {doc.type !== 'handout' && (
          <p className="field-help">
            {typeLabel} 전용 편집 화면은 다음 단계에서 열립니다. 지금은 기기 간 동기화 확인용 기본 편집기예요.
          </p>
        )}
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
