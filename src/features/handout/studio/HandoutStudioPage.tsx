import { useEffect, useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { DeletedRecovery } from '../../../components/document/DeletedRecovery'
import '../../../components/document/DocumentEditor.css'
import { SyncNotices } from '../../../components/document/SyncNotices'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { SaveStatusChip } from '../../../components/SaveStatusChip'
import { Toast } from '../../../components/Toast'
import type { DocumentDraft, DocumentRecord } from '../../../lib/documents'
import type { SaveStatus } from '../../../lib/documentSync'
import { useAuth } from '../../../lib/auth/context'
import { formatRelativeTime } from '../../../lib/format'
import { recordRecentView } from '../../../lib/recentViews'
import { useDocument } from '../../../lib/useDocument'
import { useToast } from '../../../lib/useToast'
import { NotFoundPage } from '../../../pages/NotFoundPage'
import { HandoutCanvas } from '../canvas/HandoutCanvas'
import { setField, type HandoutEdit } from '../edits'
import { oversizedFields, RECOMMENDED_FIELD_LENGTH, type HandoutContent } from '../model'
import { roll20Text } from '../roll20'
import { resolveHandout, resolveLook } from '../templates'
import { DesignPanel } from './DesignPanel'
import { ExportPanel } from './ExportPanel'
import './HandoutStudio.css'

/**
 * 권장 글자 수를 넘는 칸이 있으면 알린다. 글은 자르지 않고 그대로 저장한다 (경고만).
 * (예전 { text } 핸드아웃처럼 긴 글을 불러온 경우 · 긴 글을 붙여 넣은 경우)
 */
function LengthWarning({ content }: { content: HandoutContent }) {
  const over = oversizedFields(content)
  if (over.length === 0) return null
  const fields = resolveLook(content).template.fields
  const limit = RECOMMENDED_FIELD_LENGTH.toLocaleString('ko-KR')
  return (
    <div className="callout length-warning" role="status">
      <Icon name="alert" />
      <span>
        {over.map(({ key, length }) => {
          const label = fields.find((f) => f.key === key)?.label ?? key
          const subject = key === 'body' ? '본문이' : `「${label}」 칸이`
          return (
            <span key={key} className="length-warning-line">
              {subject} {length.toLocaleString('ko-KR')}자로 권장 한도({limit}자)를 넘습니다.{' '}
            </span>
          )
        })}
        내용은 자르지 않고 그대로 저장하지만, Roll20 에 붙여 넣을 때 느려지거나 제대로 붙지 않을 수 있어요.
      </span>
    </div>
  )
}

interface StudioEditorProps {
  doc: DocumentRecord
  draft: DocumentDraft
  /** 보기: draft.content 를 검사·정규화한 값 (화면·출력용 — 저장하지 않는다) */
  content: HandoutContent
  status: SaveStatus
  offlineCopy: boolean
  edit(patch: Partial<DocumentDraft>): void
  flush(): Promise<void>
  children: ReactNode
}

/** 불러온 핸드아웃의 편집 화면: 머리(제목·저장 상태) · 캔버스 · 디자인 패널 */
function StudioEditor({ doc, draft, content, status, offlineCopy, edit, flush, children }: StudioEditorProps) {
  const { toast, show } = useToast()
  const look = resolveLook(content)
  // 편집은 저장된 content(draft.content)에 연산을 적용해, 고친 경로만 바뀐 content 를 저장한다.
  // 보기(content)는 정규화한 값이라 저장하지 않는다 — 고치지 않은 저장 값은 한 글자도 바뀌지 않는다.
  // 모든 변경은 useDocument 의 edit 로 — 자동 저장 · 오프라인 보관 · 충돌 처리는 동기화 계층이 맡는다
  const apply = (op: HandoutEdit) => edit({ content: op(draft.content) })
  const changeField = (key: string, value: string) => apply((stored) => setField(stored, key, value))

  return (
    <article className="doc-editor handout-studio">
      <title>{`${draft.title || '제목 없음'} · 핸드아웃 스튜디오 · FOLIO`}</title>
      <div className="editor-header">
        <div className="doc-title-wrap">
          <div className="eyebrow">STUDIO / TEMPLATE EDITOR</div>
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
            핸드아웃 · v{doc.version} ·{' '}
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
          <Link to="/templates" className="btn small">
            템플릿 아카이브
          </Link>
        </div>
      </div>

      {children}
      <LengthWarning content={content} />

      <div className="studio-shell">
        <section className="preview-workspace" aria-label="캔버스">
          <div className="canvas-tools">
            <span className="edit-hint">
              <Icon name="edit" /> 글자를 클릭해서 바로 수정하세요
            </span>
            <span className="canvas-meta">
              {look.template.name} · {look.theme.label}
            </span>
          </div>
          <div className="canvas-stage">
            <HandoutCanvas content={content} onFieldChange={changeField} label="핸드아웃 캔버스" />
          </div>
          <div className="canvas-footer">
            <span>✧ FOLIO Template Engine</span>
            <span>Enter 로 다음 칸 · 본문은 줄바꿈</span>
          </div>
        </section>
        <aside className="panel right-panel" aria-label="디자인 설정">
          <div className="panel-top">
            <h2>디자인 설정</h2>
            <Icon name="templates" />
          </div>
          <DesignPanel content={content} onEdit={apply} />
          <ExportPanel content={content} title={draft.title} notify={show} />
          <div className="panel-section">
            <div className="callout">
              <Icon name="lock" /> <span>문서는 기본적으로 비공개로 내 계정에만 저장돼요.</span>
            </div>
          </div>
        </aside>
      </div>
      <Toast toast={toast} />
    </article>
  )
}

function HandoutStudio({ docId }: { docId: string }) {
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
  // 저장된 content(draft.content)가 기준이다. 보기는 그것을 검사·정규화해 그릴 때만 쓴다
  const stored = draft?.content
  const content = useMemo(() => (stored ? resolveHandout(stored) : null), [stored])
  const { user } = useAuth()
  const openedId = phase === 'ready' && doc?.type === 'handout' ? doc.id : null
  // 홈 화면 "최근 조회한 템플릿" 기록 (이 기기에만)
  useEffect(() => {
    if (user && openedId) recordRecentView(user.id, openedId, 'handout')
  }, [user, openedId])

  if (phase === 'loading') return <LoadingState label="핸드아웃을 불러오는 중…" />
  if (phase === 'notfound') return <NotFoundPage />
  // 삭제된 문서는 편집 화면으로 넘어가지 않는다 (읽기 전용 복구 화면)
  if (phase === 'deleted')
    return draft && content ? (
      <DeletedRecovery
        doc={doc}
        draft={draft}
        source={recoverSource ?? 'pending'}
        bodyText={roll20Text(content)}
        restorePath={(id) => `/studio/handout/${id}`}
        onRestore={restoreAsNew}
        onDiscard={discardDeleted}
      />
    ) : (
      <NotFoundPage />
    )
  if (phase === 'error' || !doc || !draft || !content)
    return (
      <div className="callout danger" role="alert">
        <Icon name="alert" />
        <span>핸드아웃을 불러오지 못했어요. 네트워크 연결을 확인한 뒤 새로고침해 주세요. {errorMessage}</span>
      </div>
    )
  if (doc.type !== 'handout')
    return (
      <div className="callout" role="note">
        <Icon name="alert" />
        <span>
          핸드아웃이 아닌 문서예요.{' '}
          <Link to={`/documents/${doc.id}`} className="text-link">
            기본 편집기에서 열기 <Icon name="arrow" />
          </Link>
        </span>
      </div>
    )

  return (
    <StudioEditor
      doc={doc}
      draft={draft}
      content={content}
      status={status}
      offlineCopy={offlineCopy}
      edit={edit}
      flush={flush}
    >
      <SyncNotices
        conflict={conflict}
        status={status}
        errorMessage={errorMessage}
        offlineCopy={offlineCopy}
        onResolve={(choice) => void resolveConflict(choice)}
      />
    </StudioEditor>
  )
}

/** /studio/handout/:id — 핸드아웃 스튜디오 */
export default function HandoutStudioPage() {
  const { id = '' } = useParams()
  // 문서가 바뀌면 편집 상태를 통째로 새로 만든다.
  return (
    <>
      <h1 className="sr-only">핸드아웃 스튜디오</h1>
      <HandoutStudio key={id} docId={id} />
    </>
  )
}
