import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { useEditHistory } from '../../../lib/useEditHistory'
import { useToast } from '../../../lib/useToast'
import { NotFoundPage } from '../../../pages/NotFoundPage'
import { blockRoll20Text } from '../blockRoll20'
import { BlockCanvas } from '../canvas/BlockCanvas'
import { findBlock, resolveLayout, type HandoutLayout, type ImageBlock, type LayoutBlock } from '../layout'
import { addBlock, moveBlock, newBlockId, setBlockText, setRowSplit, swapRow } from '../layoutEdits'
import { RECOMMENDED_FIELD_LENGTH, type HandoutContent } from '../model'
import { resolveHandout, resolveLook } from '../templates'
import { DesignPanel } from './DesignPanel'
import { ExportBar } from './ExportPanel'
import './HandoutStudio.css'

/**
 * 권장 글자 수를 넘는 텍스트 블록이 있으면 알린다. 글은 자르지 않고 그대로 저장한다 (경고만).
 */
function LengthWarning({ layout }: { layout: HandoutLayout }) {
  const over = layout.rows.flatMap((r) => r.blocks).filter((b) => b.type === 'text' && b.text.length > RECOMMENDED_FIELD_LENGTH)
  if (over.length === 0) return null
  const limit = RECOMMENDED_FIELD_LENGTH.toLocaleString('ko-KR')
  const longest = Math.max(...over.map((b) => (b.type === 'text' ? b.text.length : 0)))
  return (
    <div className="callout length-warning" role="status">
      <Icon name="alert" />
      <span>
        텍스트 블록이 {longest.toLocaleString('ko-KR')}자로 권장 한도({limit}자)를 넘습니다. 내용은 자르지 않고 그대로 저장하지만, Roll20 에 붙여
        넣을 때 느려지거나 제대로 붙지 않을 수 있어요.
      </span>
    </div>
  )
}

interface StudioEditorProps {
  doc: DocumentRecord
  draft: DocumentDraft
  /** 보기: draft.content 를 검사·정규화한 값 (화면·출력용 — 저장하지 않는다) */
  content: HandoutContent
  layout: HandoutLayout
  status: SaveStatus
  offlineCopy: boolean
  edit(patch: Partial<DocumentDraft>): void
  flush(): Promise<void>
  children: ReactNode
}

/** 불러온 핸드아웃의 편집 화면: 머리(제목·저장 상태) · 캔버스 · 디자인 패널 */
function StudioEditor({ doc, draft, content, layout, status, offlineCopy, edit, flush, children }: StudioEditorProps) {
  const { toast, show } = useToast()
  const look = resolveLook(content)
  // 편집은 저장된 content(draft.content)에 연산을 적용해, 고친 경로만 바뀐 content 를 저장한다.
  // 보기(content)는 정규화한 값이라 저장하지 않는다 — 고치지 않은 저장 값은 한 글자도 바뀌지 않는다.
  // 모든 변경은 useDocument 의 edit 로 — 자동 저장 · 오프라인 보관 · 충돌 처리는 동기화 계층이 맡는다
  // 되돌리기 · 다시 실행: 모든 편집이 이 기록을 거친다 (이 화면을 연 동안만)
  const { apply, undo, redo, breakGroup, canUndo, canRedo } = useEditHistory(draft.content, edit)
  // Ctrl+Z 되돌리기 · Ctrl+Shift+Z / Ctrl+Y 다시 실행 (Mac 은 Cmd). 글상자에서 입력 중에도 에디터 기록을 쓴다.
  // 제목 · HEX 같은 입력칸은 그 칸의 되돌리기를 쓴다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      const target = e.target as HTMLElement | null
      if (target?.matches('input, textarea, select')) return
      e.preventDefault()
      if (key === 'y' || e.shiftKey) redo()
      else undo()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [undo, redo])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = findBlock(layout, selectedId)
  const snapshot = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  // 새로 넣은 텍스트 블록에 바로 입력할 수 있게 커서를 둔다
  const focusId = useRef<string | null>(null)
  useEffect(() => {
    const id = focusId.current
    if (!id) return
    const box = stage.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"] [role="textbox"]`)
    if (box) {
      box.focus()
      focusId.current = null
    }
  }, [layout])
  const addNew = (type: 'text' | 'image' | 'rule') => {
    const id = newBlockId()
    // 새 구분선 색: 템플릿에 있던 구분선 색, 없으면 본문 글자 색
    const ruleColor =
      layout.rows.flatMap((r) => r.blocks).find((b): b is ImageBlock => b.type === 'image' && !!b.rule)?.rule?.color ??
      layout.bodyStyle.color
    const block: LayoutBlock =
      type === 'text'
        ? { id, type: 'text', text: '', style: { ...layout.bodyStyle } }
        : type === 'image'
          ? { id, type: 'image', maxWidth: Math.min(380, layout.width - 40) }
          : { id, type: 'image', maxWidth: 1000, marginTop: 10, marginBottom: 10, rule: { widthPercent: 100, color: ruleColor } }
    apply(addBlock(block, selected?.id ?? null))
    setSelectedId(id)
    if (type === 'text') focusId.current = id
  }

  return (
    <article className="doc-editor handout-studio">
      <title>{`${draft.title || '제목 없음'} · 핸드아웃 스튜디오 · ORarchive`}</title>
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
      <LengthWarning layout={layout} />

      <div className="studio-shell">
        <section className="preview-workspace" aria-label="캔버스">
          <div className="callout privacy-note">
            <Icon name="lock" /> <span>문서는 기본적으로 비공개로 내 계정에만 저장돼요.</span>
          </div>
          <div className="canvas-tools">
            <span className="edit-hint">
              <Icon name="edit" /> 글자를 클릭해서 바로 수정하고, 블록을 골라 손잡이로 옮기세요
            </span>
            <span className="canvas-meta">{look.template.name}</span>
          </div>
          <div
            className="canvas-stage"
            ref={stage}
            onPointerDown={(event) => {
              // 블록 바깥(빈 곳)을 누르면 선택을 푼다
              if (!(event.target as Element).closest('[data-block-id]')) setSelectedId(null)
            }}
          >
            <BlockCanvas
              layout={layout}
              label="핸드아웃 캔버스"
              editing={{
                selectedId,
                onSelect: (id) => {
                  if (id !== selectedId) breakGroup()
                  setSelectedId(id)
                },
                onText: (id, text) => apply(setBlockText(id, text), `text:${id}`),
                onMove: (id, target) => apply(moveBlock(id, target)),
                onSplit: (rowId, split) => apply(setRowSplit(rowId, split)),
                onSwap: (rowId) => apply(swapRow(rowId)),
              }}
            />
          </div>
          <div className="canvas-footer">
            <span>✧ ORarchive Template Engine</span>
            <span>Enter 줄바꿈 · 손잡이에서 ↑ ↓ 로도 옮겨요</span>
          </div>
          <ExportBar layout={layout} title={draft.title} snapshot={snapshot} notify={show} />
          {/* 이미지 파일 저장용: 화면 밖에 그린 읽기 전용 캔버스 */}
          <div className="jpg-snapshot" ref={snapshot} aria-hidden="true">
            <BlockCanvas layout={layout} />
          </div>
        </section>
        <aside className="panel right-panel" aria-label="디자인 설정">
          <div className="panel-top">
            <h2>디자인 설정</h2>
            <Icon name="templates" />
          </div>
          <DesignPanel
            layout={layout}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            selected={selected}
            onEdit={apply}
            onAddText={() => addNew('text')}
            onAddImage={() => addNew('image')}
            onAddRule={() => addNew('rule')}
            onRemoved={() => setSelectedId(null)}
          />
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
  const layout = useMemo(() => (stored ? resolveLayout(stored) : null), [stored])
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
        bodyText={layout ? blockRoll20Text(layout) : ''}
        restorePath={(id) => `/studio/handout/${id}`}
        onRestore={restoreAsNew}
        onDiscard={discardDeleted}
      />
    ) : (
      <NotFoundPage />
    )
  if (phase === 'error' || !doc || !draft || !content || !layout)
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
      layout={layout}
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
