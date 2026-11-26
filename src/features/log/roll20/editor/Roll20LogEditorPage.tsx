import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { DeletedRecovery } from '../../../../components/document/DeletedRecovery'
import '../../../../components/document/DocumentEditor.css'
import { SyncNotices } from '../../../../components/document/SyncNotices'
import { Icon } from '../../../../components/Icon'
import { LoadingState } from '../../../../components/LoadingState'
import { SaveStatusChip } from '../../../../components/SaveStatusChip'
import { Toast } from '../../../../components/Toast'
import { copyText } from '../../../../lib/clipboard'
import { downloadTextFile } from '../../../../lib/download'
import type { DocumentContent, DocumentDraft, DocumentRecord } from '../../../../lib/documents'
import type { SaveStatus } from '../../../../lib/documentSync'
import { formatRelativeTime } from '../../../../lib/format'
import { useDocument } from '../../../../lib/useDocument'
import { useToast } from '../../../../lib/useToast'
import { NotFoundPage } from '../../../../pages/NotFoundPage'
import {
  duplicateMessage,
  insertMessageAfter,
  moveMessageBeside,
  newMessageId,
  removeMessage,
  setMessageSpeaker,
  setMessageText,
  setRule,
  type LogEdit,
} from '../edits'
import { logBlogCode, logFileName, logHtmlFile } from '../export'
import { isEditable, isRoll20Log, resolveLog, RULE_SUGGESTIONS, speakersOf, type LogMessage, type Roll20LogContent } from '../model'
import { visibleMessages } from '../render'
import '../../../handout/studio/HandoutStudio.css'
import '../roll20Log.css'
import { LogPanel } from './LogPanel'
import { LogPreview, type MessageAction, type SpeakerTarget } from './LogPreview'

const HISTORY_LIMIT = 50
const TOUCH_QUERY = '(max-width: 750px), (hover: none)'

/** 휴대폰처럼 마우스를 올릴 수 없는 화면인가 */
function useTouchMenu() {
  const [touch, setTouch] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(TOUCH_QUERY).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(TOUCH_QUERY)
    const onChange = () => setTouch(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return touch
}

/**
 * 되돌리기 기록 (이 화면을 연 동안만). 편집 전의 저장 값(content)을 쌓아 두었다가 그대로 다시 저장한다.
 * 모든 변경은 useDocument 의 edit 로 보낸다 — 자동 저장·오프라인 보관·충돌 처리는 동기화 계층이 맡는다.
 */
function useLogHistory(stored: DocumentContent, edit: (patch: Partial<DocumentDraft>) => void) {
  const past = useRef<DocumentContent[]>([])
  const future = useRef<DocumentContent[]>([])
  const [depth, setDepth] = useState({ undo: 0, redo: 0 })
  const sync = () => setDepth({ undo: past.current.length, redo: future.current.length })
  const current = useRef(stored)
  useEffect(() => {
    current.current = stored
  })

  const apply = useCallback(
    (op: LogEdit) => {
      const before = current.current
      const after = op(before)
      if (after === before) return
      past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), before]
      future.current = []
      current.current = after
      edit({ content: after })
      sync()
    },
    [edit],
  )
  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (prev === undefined) return
    future.current.push(current.current)
    current.current = prev
    edit({ content: prev })
    sync()
  }, [edit])
  const redo = useCallback(() => {
    const next = future.current.pop()
    if (next === undefined) return
    past.current.push(current.current)
    current.current = next
    edit({ content: next })
    sync()
  }, [edit])
  return { apply, undo, redo, canUndo: depth.undo > 0, canRedo: depth.redo > 0 }
}

/** 휴대폰: 메시지를 누르면 아래에서 올라오는 메뉴 */
function MessageSheet({
  message,
  first,
  last,
  onAction,
  onClose,
}: {
  message: LogMessage
  first: boolean
  last: boolean
  onAction(action: MessageAction): void
  onClose(): void
}) {
  const preview = (message.text ?? message.html?.replace(/<[^>]+>/g, ' ') ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const item = (action: MessageAction, icon: Parameters<typeof Icon>[0]['name'], label: string, disabled = false, danger = false) => (
    <button type="button" className={danger ? 'danger' : ''} disabled={disabled} onClick={() => onAction(action)}>
      <Icon name={icon} /> {label}
    </button>
  )
  return (
    <>
      <div className="msg-sheet-backdrop" onClick={onClose} />
      <div className="msg-sheet" role="dialog" aria-modal="true" aria-label="메시지 편집 메뉴">
        <div className="msg-sheet-head">
          <b>{message.speaker ?? '서술'}</b>
          <small>{preview || ' '}</small>
        </div>
        {item('edit', 'edit', isEditable(message) ? '수정' : '수정 (판정·꾸민 메시지는 고칠 수 없어요)', !isEditable(message))}
        {item('duplicate', 'copy', '복제')}
        {item('up', 'up', '위로 옮기기', first)}
        {item('down', 'down', '아래로 옮기기', last)}
        {item('insert', 'plus', '아래에 새 메시지')}
        {item('remove', 'trash', '삭제', false, true)}
        <button type="button" className="msg-sheet-close" onClick={onClose}>
          닫기
        </button>
      </div>
    </>
  )
}

/** 룰 칸: 입력을 마치면(포커스가 빠지거나 Enter) 반영 */
function RuleField({ rule, onCommit }: { rule: string; onCommit(rule: string): void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft.trim() !== rule) onCommit(draft.trim())
    setDraft(null)
  }
  return (
    <div className="rule-field">
      <label htmlFor="log-rule">룰</label>
      <input
        id="log-rule"
        className="field-input"
        list="log-rule-suggestions"
        maxLength={60}
        placeholder="기타"
        value={draft ?? rule}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(null)
        }}
      />
      <datalist id="log-rule-suggestions">
        {RULE_SUGGESTIONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  )
}

interface EditorProps {
  doc: DocumentRecord
  draft: DocumentDraft
  content: Roll20LogContent
  status: SaveStatus
  offlineCopy: boolean
  edit(patch: Partial<DocumentDraft>): void
  flush(): Promise<void>
  children: ReactNode
}

function LogEditor({ doc, draft, content, status, offlineCopy, edit, flush, children }: EditorProps) {
  const { toast, show } = useToast()
  const { apply, undo, redo, canUndo, canRedo } = useLogHistory(draft.content, edit)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const touchMenu = useTouchMenu()
  const rows = useMemo(() => visibleMessages(content), [content])

  // Ctrl+Z / Ctrl+Shift+Z (글자 칸에서 입력 중일 때는 브라우저 기본 동작)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const path = e.composedPath()
      if (path.some((el) => el instanceof HTMLElement && (el.matches('input, textarea') || el.isContentEditable))) return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const onAction = useCallback(
    (action: MessageAction, message: LogMessage) => {
      const index = rows.findIndex((r) => r.message.id === message.id)
      setMenuId(null)
      switch (action) {
        case 'edit':
          if (isEditable(message)) setEditingId(message.id)
          break
        case 'duplicate':
          apply(duplicateMessage(message.id))
          break
        case 'up':
          if (index > 0) apply(moveMessageBeside(message.id, rows[index - 1].message.id, 'before'))
          break
        case 'down':
          if (index >= 0 && index < rows.length - 1) apply(moveMessageBeside(message.id, rows[index + 1].message.id, 'after'))
          break
        case 'insert': {
          const id = newMessageId()
          apply(insertMessageAfter(message.id, id))
          setEditingId(id)
          break
        }
        case 'remove':
          apply(removeMessage(message.id))
          show('메시지를 지웠어요. 되돌리기로 다시 살릴 수 있어요.')
          break
      }
    },
    [rows, apply, show],
  )

  const onSaveText = useCallback(
    (message: LogMessage, text: string) => {
      apply(setMessageText(message.id, text))
      setEditingId(null)
    },
    [apply],
  )
  const onCancelEdit = useCallback(() => setEditingId(null), [])
  const speakers = useMemo(() => speakersOf(content), [content])
  const onChangeSpeaker = useCallback(
    (message: LogMessage, target: SpeakerTarget) => apply(setMessageSpeaker(message.id, target)),
    [apply],
  )
  const onOpenMenu = useCallback((message: LogMessage) => setMenuId(message.id), [])
  const menuIndex = menuId ? rows.findIndex((r) => r.message.id === menuId) : -1

  return (
    <article className="doc-editor handout-studio log-editor">
      <title>{`${draft.title || '제목 없음'} · Roll20 로그 편집 · FOLIO`}</title>
      <div className="editor-header">
        <div className="doc-title-wrap">
          <div className="eyebrow">STUDIO / LOG EDITOR · ROLL20</div>
          <label className="sr-only" htmlFor="doc-title">
            로그 제목
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
            Roll20 로그 · 메시지 {content.messages.length.toLocaleString('ko-KR')}개 · v{doc.version} ·{' '}
            {offlineCopy ? '이 기기에 저장해 둔 사본' : `${formatRelativeTime(doc.updated_at)} 서버에 저장`}
          </p>
          <RuleField rule={content.rule} onCommit={(rule) => apply(setRule(rule))} />
        </div>
        <div className="editor-toolbar">
          <SaveStatusChip status={status} />
          {status === 'error' && (
            <button type="button" className="btn small" onClick={() => void flush()}>
              다시 시도
            </button>
          )}
          <button type="button" className="btn small icon-only" title="되돌리기 (Ctrl+Z)" aria-label="되돌리기" disabled={!canUndo} onClick={undo}>
            <Icon name="undo" />
          </button>
          <button
            type="button"
            className="btn small icon-only"
            title="다시하기 (Ctrl+Shift+Z)"
            aria-label="다시하기"
            disabled={!canRedo}
            onClick={redo}
          >
            <Icon name="redo" />
          </button>
          <Link to="/studio/log/roll20" className="btn small">
            로그 목록
          </Link>
        </div>
      </div>

      {children}

      <div className="studio-shell">
        <section className="preview-workspace" aria-label="로그 미리보기">
          <div className="canvas-tools">
            <span className="edit-hint">
              <Icon name="edit" /> {touchMenu ? '메시지를 누르면 편집 메뉴가 열려요' : '메시지를 클릭해서 바로 수정하세요'}
            </span>
            <span className="canvas-meta">
              {content.sheetCss ? '시트 판정 디자인 포함 · ' : ''}보이는 메시지 {rows.length.toLocaleString('ko-KR')}개
            </span>
          </div>
          <div className="callout log-notice">
            <Icon name="lock" />
            <span>
              원본 파일은 서버에 올리지 않아요. 편집본만 내 계정에 비공개로 저장돼요.
              <br />
              현재 화면의 글꼴은 뷰어에만 적용됩니다. 로그 백업 시 적용되지 않습니다.
            </span>
          </div>
          <LogPreview
            content={content}
            editingId={editingId}
            touchMenu={touchMenu}
            onAction={onAction}
            onSaveText={onSaveText}
            onCancelEdit={onCancelEdit}
            onOpenMenu={onOpenMenu}
            speakers={speakers}
            onChangeSpeaker={onChangeSpeaker}
          />
          <div className="log-export-bar" role="group" aria-label="내보내기">
            <button type="button" className="btn primary" onClick={() => downloadTextFile(logFileName(draft.title), logHtmlFile(content, draft.title))}>
              <Icon name="download" /> HTML 파일 저장
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                copyText(logBlogCode(content)).then(
                  () => show('블로그용 코드를 복사했어요. 블로그 글쓰기의 HTML 편집 모드에 붙여 넣으세요.'),
                  () => show('클립보드 접근을 차단했어요. 브라우저의 클립보드 권한을 확인해 주세요.', 'error'),
                )
              }}
            >
              <Icon name="code" /> 블로그용 코드 복사
            </button>
            <p className="field-help">
              HTML 파일은 바로 열어 볼 수 있는 완성된 페이지예요. 블로그용 코드는 티스토리 등의 HTML 편집 모드에 붙여 넣어요. 지금 보이는 모양 그대로(숨긴 메시지 제외) 내보내요.
            </p>
          </div>
          <div className="canvas-footer">
            <span>✧ FOLIO Log Engine</span>
            <span>{touchMenu ? '누르면 복제 · 이동 · 삭제' : '마우스를 올리면 복제 · 이동 · 삭제'}</span>
          </div>
        </section>
        <LogPanel content={content} apply={apply} notify={show} />
      </div>
      {menuId && menuIndex >= 0 && (
        <MessageSheet
          message={rows[menuIndex].message}
          first={menuIndex === 0}
          last={menuIndex === rows.length - 1}
          onAction={(action) => onAction(action, rows[menuIndex].message)}
          onClose={() => setMenuId(null)}
        />
      )}
      <Toast toast={toast} />
    </article>
  )
}

/** 삭제 복구 화면에 보여 줄 글자 */
function logPlainText(content: Roll20LogContent): string {
  return content.messages
    .map((m) => {
      const body = m.text ?? (m.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      return m.speaker ? `${m.speaker}: ${body}` : body
    })
    .join('\n')
}

function Roll20LogEditor({ docId }: { docId: string }) {
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
  const stored = draft?.content
  const content = useMemo(() => (stored && isRoll20Log(stored) ? resolveLog(stored) : null), [stored])

  if (phase === 'loading') return <LoadingState label="로그를 불러오는 중…" />
  if (phase === 'notfound') return <NotFoundPage />
  if (phase === 'deleted')
    return draft ? (
      <DeletedRecovery
        doc={doc}
        draft={draft}
        source={recoverSource ?? 'pending'}
        bodyText={content ? logPlainText(content) : ''}
        restorePath={(id) => `/studio/log/roll20/${id}`}
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
        <span>로그를 불러오지 못했어요. 네트워크 연결을 확인한 뒤 새로고침해 주세요. {errorMessage}</span>
      </div>
    )
  if (doc.type !== 'log' || !content)
    return (
      <div className="callout" role="note">
        <Icon name="alert" />
        <span>
          Roll20 로그 형식이 아닌 문서예요.{' '}
          <Link to={`/documents/${doc.id}`} className="text-link">
            기본 편집기에서 열기 <Icon name="arrow" />
          </Link>
        </span>
      </div>
    )

  return (
    <LogEditor doc={doc} draft={draft} content={content} status={status} offlineCopy={offlineCopy} edit={edit} flush={flush}>
      <SyncNotices
        conflict={conflict}
        status={status}
        errorMessage={errorMessage}
        offlineCopy={offlineCopy}
        onResolve={(choice) => void resolveConflict(choice)}
      />
    </LogEditor>
  )
}

/** /studio/log/roll20/:id — Roll20 로그 편집 화면 */
export default function Roll20LogEditorPage() {
  const { id = '' } = useParams()
  return (
    <>
      <h1 className="sr-only">Roll20 로그 편집</h1>
      <Roll20LogEditor key={id} docId={id} />
    </>
  )
}
