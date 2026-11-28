import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { DeletedRecovery } from '../../../components/document/DeletedRecovery'
import { RestoredNotice, SaveActions, type SavingProps } from '../../../components/document/ManualSave'
import { useManualSave, usePendingDraft } from '../../../components/document/useManualSave'
import '../../../components/document/DocumentEditor.css'
import { SyncNotices } from '../../../components/document/SyncNotices'
import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { LoadingState } from '../../../components/LoadingState'
import { SaveStatusChip } from '../../../components/SaveStatusChip'
import { Toast } from '../../../components/Toast'
import { documentPath, type DocumentDraft, type DocumentRecord } from '../../../lib/documents'
import type { SaveStatus } from '../../../lib/documentSync'
import { useAuth } from '../../../lib/auth/context'
import { formatRelativeTime } from '../../../lib/format'
import { recordRecentView } from '../../../lib/recentViews'
import { useDocument } from '../../../lib/useDocument'
import { useEditHistory } from '../../../lib/useEditHistory'
import { useRepository } from '../../../lib/useRepository'
import { useToast } from '../../../lib/useToast'
import { NotFoundPage } from '../../../pages/NotFoundPage'
import { blockRoll20Text } from '../blockRoll20'
import { BlockCanvas } from '../canvas/BlockCanvas'
import { blockKind, DEFAULT_SPACE, findBlock, resolveLayout, type HandoutLayout, type ImageBlock, type LayoutBlock, type TextBlock } from '../layout'
import { addBlock, moveBlock, newBlockId, resetToTemplate, upgradeLegacy, setBlockContent, setBlockStyle, setRowSplit, type TextStylePatch } from '../layoutEdits'
import { applyToRange, baseValue, normalizeRuns, rangeAllOn, rangeValue, TOGGLE_KEYS, type ToggleKey } from '../richText'
import { caretOffsets, rangeAt } from '../canvas/richDom'
import { isStructuredHandout, RECOMMENDED_FIELD_LENGTH, type HandoutContent } from '../model'
import { resolveHandout, resolveLook } from '../templates'
import { newHandoutTemplate } from '../templates/newHandout'
import { copyTitle } from '../useCopyHandout'
import { DesignPanel, type TextOps } from './DesignPanel'
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
        텍스트 블록이 {longest.toLocaleString('ko-KR')}자로 권장 한도({limit}
        자)를 넘습니다. 내용은 자르지 않고 그대로 저장하지만, Roll20 에 붙여 넣을 때 느려지거나 제대로 붙지 않을 수 있어요.
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
  /** 수동 저장 (2026-11-28) */
  saving: SavingProps
  /** 서버에 예전 형식(`{}` · `{ text }`)으로 저장된 핸드아웃: 업데이트해 저장하기 전까지 편집을 막는다 */
  legacy?: boolean
}


/** 불러온 핸드아웃의 편집 화면: 머리(제목·저장 상태) · 캔버스 · 디자인 패널 */
function StudioEditor({ doc, draft, content, layout, status, offlineCopy, edit, flush, children, saving, legacy = false }: StudioEditorProps) {
  const { toast, show } = useToast()
  const [busy, setBusy] = useState(false)
  const runSave = async (copy: boolean) => {
    if (busy) return
    setBusy(true)
    const ok = await (copy ? saving.saveCopy() : saving.save()).catch(() => false)
    setBusy(false)
    if (ok) show(copy ? '사본을 만들었어요. 사본을 편집하고 있어요.' : '저장했어요.')
    // 저장된 문서의 저장 실패 · 충돌은 머리 아래 안내(SyncNotices)가 알린다
    else if (copy || saving.isNew) show(copy ? '사본을 만들지 못했어요. 고친 내용은 그대로 있어요.' : '저장하지 못했어요. 고친 내용은 이 화면에 그대로 있어요.', 'error')
  }
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
      if (legacy || !(e.ctrlKey || e.metaKey) || e.altKey) return
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
  }, [undo, redo, legacy])
  // 예전 형식 업데이트: 보이던 모양 그대로 지금 형식으로 바꿔 곧바로 저장한다 (되돌리기 기록에는 남기지 않는다)
  const upgrade = async () => {
    edit({ content: upgradeLegacy(draft.content) })
    await runSave(false)
  }
  // 고른 블록들: Ctrl(Cmd)+누르기로 같은 종류를 여러 개 고를 수 있다 (PC). 다른 종류는 더하지 않는다
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const setSelectedId = (id: string | null) => setSelectedIds(id ? [id] : [])
  const [confirmReset, setConfirmReset] = useState(false)
  const selection = selectedIds.map((id) => findBlock(layout, id)).filter((b): b is LayoutBlock => b !== null)
  const selected = selection.at(-1) ?? null
  // 드래그한 글자 범위 (글상자 하나만 골랐을 때): 꾸밈을 그 글자에만. 패널 칸으로 포커스가 옮겨가도 남긴다
  const [textRange, setTextRange] = useState<{ id: string; start: number; end: number } | null>(null)
  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const node = sel.anchorNode
      const el = (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('.hb-canvas.editable [data-block-id] [data-hfield]')
      if (!el) return // 패널 등 다른 곳: 범위를 그대로 둔다
      const id = el.closest<HTMLElement>('[data-block-id]')!.dataset.blockId!
      const off = caretOffsets(el)
      if (!off || off.start === off.end) setTextRange((r) => (r ? null : r))
      else setTextRange({ id, start: Math.min(off.start, off.end), end: Math.max(off.start, off.end) })
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [])
  const textBlocks = selection.filter((b): b is TextBlock => b.type === 'text')
  const rangeBlock =
    textRange && selection.length === 1 && textBlocks[0]?.id === textRange.id && textRange.end <= textBlocks[0].text.length ? textBlocks[0] : null
  const textOps: TextOps = {
    ranged: rangeBlock !== null,
    value: (key) =>
      rangeBlock && textRange
        ? rangeValue(rangeBlock.text, rangeBlock.runs, rangeBlock.style, textRange.start, textRange.end, key)
        : textBlocks[0]
          ? baseValue(textBlocks[0].style, key)
          : undefined,
    allOn: (key) =>
      rangeBlock && textRange
        ? rangeAllOn(rangeBlock.text, rangeBlock.runs, rangeBlock.style, textRange.start, textRange.end, key)
        : textBlocks.length > 0 && textBlocks.every((b) => !!b.style[key] && !(b.runs ?? []).some((r) => r.s?.[key] === false)),
    set: (patch) => {
      if (rangeBlock && textRange) {
        const runs = normalizeRuns(applyToRange(rangeBlock.text, rangeBlock.runs, textRange.start, textRange.end, patch), rangeBlock.style)
        apply(setBlockContent(rangeBlock.id, rangeBlock.text, runs))
        return
      }
      const whole: TextStylePatch = { ...patch }
      for (const k of TOGGLE_KEYS) if (k in patch) whole[k] = patch[k] ? true : undefined
      apply((stored) => textBlocks.reduce((acc, b) => setBlockStyle(b.id, whole)(acc), stored))
    },
    toggle: (key) => textOps.set({ [key]: !textOps.allOn(key) }),
  }
  const textOpsRef = useRef(textOps)
  useEffect(() => {
    textOpsRef.current = textOps
  })
  // 꾸밈 단축키: 글상자를 골랐을 때만 (Ctrl+B 굵게 · I 기울임 · U 밑줄 · D 취소선, Mac 은 Cmd). 입력칸에서는 브라우저 기본
  const hasText = textBlocks.length > 0
  useEffect(() => {
    if (!hasText) return
    const KEYS: Record<string, ToggleKey> = { b: 'bold', i: 'italic', u: 'underline', d: 'strike' }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const key = KEYS[e.key.toLowerCase()]
      if (!key) return
      const target = e.target as HTMLElement | null
      if (target?.matches('input, textarea, select')) return
      e.preventDefault()
      textOpsRef.current.toggle(key)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hasText])
  // 드래그한 범위 표시: 글상자 밖(패널)으로 포커스가 옮겨가도 그 글자를 칠해 둔다 (CSS Custom Highlight)
  useLayoutEffect(() => {
    const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const HighlightCtor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
    if (!highlights || !HighlightCtor) return
    highlights.delete('hb-range')
    if (!rangeBlock || !textRange) return
    const el = stage.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(rangeBlock.id)}"] [data-hfield]`)
    const r = el ? rangeAt(el, textRange.start, textRange.end) : null
    if (r) highlights.set('hb-range', new HighlightCtor(r))
  })
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
  const addNew = (type: 'text' | 'image' | 'rule' | 'space') => {
    const id = newBlockId()
    // 새 구분선 색: 템플릿에 있던 구분선 색, 없으면 본문 글자 색
    const ruleColor = layout.rows.flatMap((r) => r.blocks).find((b): b is ImageBlock => b.type === 'image' && !!b.rule)?.rule?.color ?? layout.bodyStyle.color
    const block: LayoutBlock =
      type === 'text'
        ? { id, type: 'text', text: '', style: { ...layout.bodyStyle } }
        : type === 'space'
          ? { id, type: 'space', height: DEFAULT_SPACE }
          : type === 'image'
            ? { id, type: 'image', maxWidth: Math.min(380, layout.width - 40) }
            : {
                id,
                type: 'image',
                maxWidth: 1000,
                marginTop: 10,
                marginBottom: 10,
                rule: { widthPercent: 100, color: ruleColor },
              }
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
            readOnly={legacy}
            onChange={(event) => edit({ title: event.target.value })}
          />
          <p>
            {saving.isNew
              ? '핸드아웃 · 아직 저장 전 · 저장을 누르면 템플릿 목록에 저장돼요'
              : `핸드아웃 · v${doc.version} · ${offlineCopy ? '이 기기에 저장해 둔 사본' : `${formatRelativeTime(doc.updated_at)} 서버에 저장`}`}
          </p>
        </div>
        <div className="editor-toolbar">
          {saving.isNew ? saving.dirty && <SaveStatusChip status="unsaved" /> : <SaveStatusChip status={status} />}
          {status === 'error' && (
            <button type="button" className="btn small" onClick={() => void flush()}>
              다시 시도
            </button>
          )}
          <Link to="/templates" className="btn small">
            템플릿 목록
          </Link>
        </div>
      </div>

      {children}
      {legacy && (
        <div className="callout legacy-notice" role="alert">
          <Icon name="alert" />
          <div className="legacy-body">
            <span>예전 형식으로 저장된 핸드아웃입니다. 현재 편집기에 맞추어 업데이트해야 합니다.</span>
            <button type="button" className="btn small legacy-update" disabled={busy} onClick={() => void upgrade()}>
              {busy ? '업데이트 중…' : '업데이트'}
            </button>
          </div>
        </div>
      )}
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
              editing={legacy ? undefined : {
                selectedIds,
                onSelect: (id, additive) => {
                  if (!id || id !== textRange?.id) setTextRange(null)
                  if (!additive || !id) {
                    if (id === null || selectedIds.length !== 1 || selectedIds[0] !== id) breakGroup()
                    setSelectedId(id)
                    return
                  }
                  const block = findBlock(layout, id)
                  const first = selection[0]
                  if (!block) return
                  if (!first) return setSelectedIds([id])
                  // 다른 종류는 고르지 않고 지금 선택을 그대로 둔다
                  if (blockKind(block) !== blockKind(first)) return
                  breakGroup()
                  setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
                },
                onText: (id, text, runs) => apply(setBlockContent(id, text, runs), `text:${id}`),
                onMove: (id, target) => apply(moveBlock(id, target)),
                onSplit: (rowId, split) => apply(setRowSplit(rowId, split)),
              }}
            />
          </div>
          <div className="canvas-footer">
            <span>✧ ORarchive Template Engine</span>
            <span>Enter 줄바꿈 · Ctrl+누르기로 같은 종류 여러 개 고르기</span>
          </div>
          <ExportBar layout={layout} title={draft.title} snapshot={snapshot} notify={show} />
          {/* 이미지 파일 저장용: 화면 밖에 그린 읽기 전용 캔버스 */}
          <div className="jpg-snapshot" ref={snapshot} aria-hidden="true">
            <BlockCanvas layout={layout} />
          </div>
        </section>
        <aside className={`panel right-panel${legacy ? ' is-locked' : ''}`} aria-label="디자인 설정" inert={legacy}>
          <div className="panel-top">
            <h2>디자인 설정</h2>
            <Icon name="templates" />
          </div>
          <SaveActions isNew={saving.isNew} dirty={saving.dirty} saving={busy} onSave={() => void runSave(false)} onSaveCopy={() => void runSave(true)} />
          <DesignPanel
            layout={layout}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onReset={() => setConfirmReset(true)}
            selection={selection}
            textOps={textOps}
            onEdit={apply}
            onAddText={() => addNew('text')}
            onAddImage={() => addNew('image')}
            onAddRule={() => addNew('rule')}
            onAddSpace={() => addNew('space')}
            onRemoved={() => setSelectedId(null)}
          />
        </aside>
      </div>
      {confirmReset && (
        <Modal title="템플릿 처음 모양으로 초기화할까요?" eyebrow="초기화" onClose={() => setConfirmReset(false)}>
          <p>
            지금까지 고친 글 · 블록 · 색 · 테두리를 모두 지우고 「{look.template.name}」 템플릿의 처음 모양으로 돌아가요. 문서 제목은 그대로예요. 이 화면을 닫기
            전까지는 되돌리기로 다시 살릴 수 있어요.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
              취소
            </button>
            <button
              type="button"
              className="btn primary danger"
              onClick={() => {
                apply(resetToTemplate)
                setSelectedId(null)
                setConfirmReset(false)
                show('템플릿 처음 모양으로 초기화했어요. 되돌리기로 다시 살릴 수 있어요.')
              }}
            >
              초기화
            </button>
          </div>
        </Modal>
      )}
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
    dirty,
    conflict,
    errorMessage,
    offlineCopy,
    recoverSource,
    edit,
    flush,
    saveNow,
    discardChanges,
    resolveConflict,
    restoreAsNew,
    discardDeleted,
  } = useDocument(docId, { manual: true })
  // 저장된 content(draft.content)가 기준이다. 보기는 그것을 검사·정규화해 그릴 때만 쓴다
  const stored = draft?.content
  const content = useMemo(() => (stored ? resolveHandout(stored) : null), [stored])
  const layout = useMemo(() => (stored ? resolveLayout(stored) : null), [stored])
  const { user } = useAuth()
  const repo = useRepository()
  const navigate = useNavigate()
  const location = useLocation()
  const openedId = phase === 'ready' && doc?.type === 'handout' ? doc.id : null
  // 홈 화면 "최근 조회한 템플릿" 기록 (이 기기에만)
  useEffect(() => {
    if (user && openedId) recordRecentView(user.id, openedId, 'handout')
  }, [user, openedId])
  usePendingDraft(phase === 'ready' ? draft : null, edit)
  // 처음 열었을 때 이 기기에 저장하지 않은 변경이 남아 있었는지 (이어서 보여 줌)
  const [restored, setRestored] = useState<boolean | null>(null)
  // (새 문서를 저장하는 동안 고친 내용을 넘겨받은 경우는 '남아 있던 변경' 이 아니다)
  if (restored === null && phase === 'ready') setRestored((location.state as { pendingDraft?: unknown } | null)?.pendingDraft ? false : dirty)
  const manualSave = useManualSave({
    dirty,
    isNew: false,
    save: saveNow,
    discard: discardChanges,
  })
  const saveCopy = async () => {
    if (!draft) return false
    const copy = await repo.create({ type: 'handout', title: copyTitle(draft.title), content: draft.content })
    // 원본은 마지막으로 저장한 그대로 — 저장하지 않았던 변경은 사본에만 (사용자가 사본으로 저장을 고름)
    discardChanges()
    manualSave.allowNext()
    navigate(documentPath('handout', copy.id))
    return true
  }

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
        restoreOnly
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
          <Link to={documentPath(doc.type, doc.id)} className="text-link">
            맞는 편집기에서 열기 <Icon name="arrow" />
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
      saving={{ isNew: false, dirty, save: saveNow, saveCopy }}
      legacy={!isStructuredHandout(doc.content)}
    >
      <SyncNotices
        conflict={conflict}
        status={status}
        errorMessage={errorMessage}
        offlineCopy={offlineCopy}
        onResolve={(choice) => void resolveConflict(choice)}
        manual
      />
      {restored && dirty && (
        <RestoredNotice
          onSave={() => void saveNow()}
          onDiscard={() => {
            discardChanges()
            setRestored(false)
          }}
        />
      )}
      {manualSave.dialog}
    </StudioEditor>
  )
}

/**
 * /studio/handout/new — "새 핸드아웃" 양식의 빈 편집기. 저장을 누를 때 문서를 만든다 (아무것도 하지 않고 나가면 남지 않는다).
 * 만들어지면 그 문서의 편집기로 넘어가며, 만드는 동안 더 고친 내용은 넘겨받아 '저장하지 않음' 으로 이어 간다.
 */
function NewHandout() {
  const repo = useRepository()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [draft, setDraft] = useState<DocumentDraft>(newHandoutTemplate)
  const [touched, setTouched] = useState(false)
  const latest = useRef(draft)
  const content = useMemo(() => resolveHandout(draft.content), [draft.content])
  const layout = useMemo(() => resolveLayout(draft.content), [draft.content])
  const now = useMemo(() => new Date().toISOString(), [])
  const doc = useMemo(
    () =>
      ({
        id: 'new',
        owner_id: user?.id ?? '',
        project_id: null,
        type: 'handout',
        title: draft.title,
        content: draft.content,
        visibility: 'private',
        version: 0,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }) as DocumentRecord,
    [user?.id, draft, now],
  )
  const edit = useCallback((patch: Partial<DocumentDraft>) => {
    latest.current = { ...latest.current, ...patch }
    setDraft(latest.current)
    setTouched(true)
  }, [])
  const create = async (open: boolean) => {
    const sent = latest.current
    const created = await repo.create({ type: 'handout', title: sent.title, content: sent.content })
    setTouched(false)
    manualSave.allowNext()
    if (open) navigate(documentPath('handout', created.id), { replace: true, state: latest.current !== sent ? { pendingDraft: latest.current } : null })
    return true
  }
  const manualSave = useManualSave({
    dirty: touched,
    isNew: true,
    save: () => create(true),
    saveBeforeLeave: () => create(false),
    discard: () => setTouched(false),
  })

  return (
    <StudioEditor
      doc={doc}
      draft={draft}
      content={content}
      layout={layout}
      status="saved"
      offlineCopy={false}
      edit={edit}
      flush={() => Promise.resolve()}
      saving={{ isNew: true, dirty: touched, save: () => create(true), saveCopy: () => Promise.resolve(false) }}
    >
      {manualSave.dialog}
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
      {id === 'new' ? <NewHandout /> : <HandoutStudio key={id} docId={id} />}
    </>
  )
}
