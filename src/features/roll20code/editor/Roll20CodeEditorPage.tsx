import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { DeletedRecovery } from '../../../components/document/DeletedRecovery'
import '../../../components/document/DocumentEditor.css'
import { SyncNotices } from '../../../components/document/SyncNotices'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { SaveStatusChip } from '../../../components/SaveStatusChip'
import { Toast } from '../../../components/Toast'
import { useAuth } from '../../../lib/auth/context'
import { copyText } from '../../../lib/clipboard'
import type { DocumentContent, DocumentDraft, DocumentRecord } from '../../../lib/documents'
import type { SaveStatus } from '../../../lib/documentSync'
import { formatRelativeTime } from '../../../lib/format'
import { recordRecentView } from '../../../lib/recentViews'
import { useDocument } from '../../../lib/useDocument'
import { useEditHistory } from '../../../lib/useEditHistory'
import { useToast } from '../../../lib/useToast'
import { NotFoundPage } from '../../../pages/NotFoundPage'
import { ColorField } from '../../handout/studio/DesignPanel'
import '../../handout/studio/HandoutStudio.css'
import { isRoll20Code, resolveRoll20Code, type Roll20CodeContent } from '../model'
import {
  allDesc,
  colorGroups,
  colorUsageLabel,
  defaultAnswer,
  fillQueries,
  findQueries,
  italicRemoved,
  setColor,
  setDesc,
  setItalicRemoved,
  setSlotText,
  slotAsQuery,
  textSlots,
  uniqueQueries,
} from '../parse'
import '../roll20Code.css'
import { ChatPreview } from './ChatPreview'

/** 저장된 content 의 code 만 바꾼다 (다른 키는 그대로) */
const withCode = (code: string) => (stored: DocumentContent) => {
  const obj = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  if (obj.code === code) return stored
  return { ...obj, code } as DocumentContent
}

interface EditorProps {
  doc: DocumentRecord
  draft: DocumentDraft
  content: Roll20CodeContent
  status: SaveStatus
  offlineCopy: boolean
  edit(patch: Partial<DocumentDraft>): void
  flush(): Promise<void>
  children: ReactNode
}

function CodeEditor({ doc, draft, content, status, offlineCopy, edit, flush, children }: EditorProps) {
  const { toast, show } = useToast()
  const { apply, undo, redo, canUndo, canRedo } = useEditHistory(draft.content, edit)
  const code = content.code
  // 질문 예시 답: 미리보기 · 롤꾸 복사에만 쓰고 저장하지 않는다
  // 코드 직접 고치기: 넓은 화면에서는 처음부터 펼침, 휴대폰은 접어 둠
  const [rawOpen, setRawOpen] = useState(() => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 1051px)').matches)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const slots = useMemo(() => textSlots(code), [code])
  const colors = useMemo(() => colorGroups(code), [code])
  const queries = useMemo(() => uniqueQueries(code), [code])
  const desc = allDesc(code)
  const noItalic = italicRemoved(code)

  // Ctrl+Z / Ctrl+Shift+Z · Ctrl+Y (글자 칸에서는 그 칸의 되돌리기)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return
      e.preventDefault()
      if (key === 'y' || e.shiftKey) redo()
      else undo()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const copy = (text: string, ok: string) =>
    copyText(text).then(
      () => show(ok),
      () => show('클립보드 접근을 차단했습니다. 브라우저의 클립보드 권한을 확인해 주세요.', 'error'),
    )

  return (
    <article className="doc-editor handout-studio roll20code-studio">
      <title>{`${draft.title || '제목 없음'} · 롤꾸코드 편집 · ORarchive`}</title>
      <div className="editor-header">
        <div className="doc-title-wrap">
          <div className="eyebrow">TEMPLATE ARCHIVE / ROLL20 CODE EDITOR</div>
          <label className="sr-only" htmlFor="doc-title">
            롤꾸코드 이름
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
            롤꾸코드 · v{doc.version} · {offlineCopy ? '이 기기에 저장해 둔 사본' : `${formatRelativeTime(doc.updated_at)} 서버에 저장`}
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
            템플릿 목록
          </Link>
        </div>
      </div>

      {children}

      {/* PC: 왼쪽 = 미리보기 · 꾸미기 카드 · 복사 / 오른쪽 = 되돌리기 · 코드
          휴대폰(1050px 이하): 미리보기 · 복사 → 되돌리기 · 코드 → 옵션 · 내용 · 질문 예시 · 색 (CSS order) */}
      <div className="studio-shell r20-shell">
        <section className="preview-workspace r20-workspace" aria-label="미리보기">
          <div className="canvas-tools">
            <span className="edit-hint">
              <Icon name="edit" /> 편집 패널에서 글자와 색을 고치면 바로 보여요
            </span>
            <span className="canvas-meta">Roll20 채팅창</span>
          </div>
          <div className="canvas-stage r20-stage">
            <ChatPreview code={code} answers={answers} />
          </div>
          <section className="r20-edit" aria-label="꾸미기">
            <div className="r20-col r20-options">
              <span className="field-label">옵션</span>
              <label className="mini-toggle">
                <input type="checkbox" role="switch" className="opt-switch" checked={desc} onChange={(e) => apply(withCode(setDesc(code, e.target.checked)))} />
                <span>/desc 서술로 보내기</span>
              </label>
              <label className="mini-toggle">
                <input
                  type="checkbox"
                  role="switch"
                  className="opt-switch"
                  checked={noItalic}
                  disabled={slots.every((s) => s.style === undefined)}
                  onChange={(e) => apply(withCode(setItalicRemoved(code, e.target.checked)))}
                />
                <span>기울임 없애기</span>
              </label>
            </div>
            <div className="r20-col r20-col-content">
              <span className="field-label">내용</span>
              {slots.length === 0 ? (
                <p className="field-help">꾸밀 글자([글자](#" style="…"))가 없어요. 아래 코드에서 직접 넣을 수 있어요.</p>
              ) : (
                slots.map((slot, i) => {
                  const id = `slot-${i}`
                  const asked = /\?\{[^{}]*\}/.test(slot.text)
                  return (
                    <div className="r20-slot" key={`${i}-${slot.textSpan.start}`}>
                      <label className="field-label sub" htmlFor={id}>
                        글자 {i + 1}
                      </label>
                      <div className="r20-slot-row">
                        <input
                          id={id}
                          className="field-input"
                          value={slot.text}
                          onChange={(e) => apply(withCode(setSlotText(code, slot, e.target.value)), `slot:${i}`)}
                        />
                        {!asked && (
                          <button
                            type="button"
                            className="btn small"
                            title="Roll20 매크로를 실행할 때 이 글자를 물어보게 해요"
                            onClick={() => apply(withCode(setSlotText(code, slot, slotAsQuery(slot.text, i))))}
                          >
                            질문으로
                          </button>
                        )}
                      </div>
                      {asked && <small className="r20-slot-note">?{'{…}'} 질문은 매크로를 실행할 때 물어봐요. 미리보기는 아래 "질문 예시"로 채워요.</small>}
                    </div>
                  )
                })
              )}
              {queries.length > 0 && (
                <div className="r20-queries" role="group" aria-label="질문 예시">
                  <span className="field-label">질문 예시</span>
                  <p className="field-help">
                    Roll20 이 매크로를 실행할 때 묻는 질문이에요. 여기 넣은 답으로 미리보기 · 롤꾸 복사를 만들어요 (저장되지 않아요).
                  </p>
                  {queries.map((q) => {
                    const id = `q-${q.label}`
                    return (
                      <div className="r20-query" key={q.label}>
                        <label htmlFor={id}>{q.label || '(이름 없는 질문)'}</label>
                        {q.options.length > 1 ? (
                          <select
                            id={id}
                            className="field-input"
                            value={answers[q.label] ?? defaultAnswer(q)}
                            onChange={(e) =>
                              setAnswers({
                                ...answers,
                                [q.label]: e.target.value,
                              })
                            }
                          >
                            {q.options.map((o, i) => (
                              <option key={`${o.value}-${i}`} value={o.value}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={id}
                            className="field-input"
                            value={answers[q.label] ?? ''}
                            placeholder={defaultAnswer(q)}
                            onChange={(e) =>
                              setAnswers({
                                ...answers,
                                [q.label]: e.target.value,
                              })
                            }
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="r20-col r20-col-colors">
              <span className="field-label">색</span>
              {colors.length === 0 ? (
                <p className="field-help">코드에서 바꿀 수 있는 색을 찾지 못했어요.</p>
              ) : (
                colors.map((group, i) => (
                  <div className="r20-color" key={`${group.hex}-${i}`}>
                    <span className="field-label sub">
                      색 {i + 1} · {colorUsageLabel(group)}
                      {group.uses.length > 1 && <em className="opt-count"> {group.uses.length}곳</em>}
                    </span>
                    <ColorField label={`색 ${i + 1}`} value={group.hex} onChange={(hex) => apply(withCode(setColor(code, group, hex)))} />
                  </div>
                ))
              )}
            </div>
          </section>
          <div className="export-bar" role="group" aria-label="내보내기">
            <button
              type="button"
              className="btn primary"
              onClick={() => void copy(fillQueries(code, answers), '롤꾸를 복사했습니다. Roll20 채팅창에 붙여 넣어 보내세요.')}
            >
              <Icon name="copy" /> 롤꾸 복사
            </button>
            <button
              type="button"
              className="btn"
              disabled={findQueries(code).length === 0}
              title={findQueries(code).length === 0 ? '질문(?{…})이 없는 롤꾸는 롤꾸 복사와 같아요' : undefined}
              onClick={() => void copy(code, '매크로를 복사했습니다. Roll20 매크로(Collection › Macros)에 붙여 넣으세요.')}
            >
              <Icon name="code" /> 매크로 복사
            </button>
          </div>
        </section>

        <aside className="panel right-panel r20-side" aria-label="롤꾸 편집">
          <div className="panel-top">
            <h2>롤꾸 편집</h2>
            <Icon name="code" />
          </div>
          <div className="panel-section history-tools" role="group" aria-label="되돌리기 · 다시 실행">
            <button type="button" className="btn small" disabled={!canUndo} onClick={undo} title="되돌리기 (Ctrl+Z)">
              <Icon name="undo" /> 되돌리기
            </button>
            <button type="button" className="btn small" disabled={!canRedo} onClick={redo} title="다시 실행 (Ctrl+Shift+Z · Ctrl+Y)">
              <Icon name="redo" /> 다시 실행
            </button>
          </div>

          <details className="panel-section r20-raw" open={rawOpen} onToggle={(e) => setRawOpen(e.currentTarget.open)}>
            <summary className="field-label">코드 직접 고치기</summary>
            <label className="sr-only" htmlFor="r20-code">
              롤꾸 코드
            </label>
            <textarea
              id="r20-code"
              className="field-input r20-code"
              spellCheck={false}
              value={code}
              onChange={(e) => apply(withCode(e.target.value.replace(/[“”]/g, '"')), 'raw')}
            />
            <small className="field-help">한 줄이 메시지 하나예요. 붙여 넣을 때 섞여 들어온 “ ” 둥근 따옴표는 " 로 바꿔요.</small>
          </details>
        </aside>
      </div>
      <Toast toast={toast} />
    </article>
  )
}

function Roll20CodeStudio({ docId }: { docId: string }) {
  const { phase, doc, draft, status, conflict, errorMessage, offlineCopy, recoverSource, edit, flush, resolveConflict, restoreAsNew, discardDeleted } =
    useDocument(docId)
  const stored = draft?.content
  const content = useMemo(() => (stored && isRoll20Code(stored) ? resolveRoll20Code(stored) : null), [stored])
  const { user } = useAuth()
  const openedId = phase === 'ready' && doc?.type === 'roll20code' ? doc.id : null
  useEffect(() => {
    if (user && openedId) recordRecentView(user.id, openedId, 'roll20code')
  }, [user, openedId])

  if (phase === 'loading') return <LoadingState label="롤꾸코드를 불러오는 중…" />
  if (phase === 'notfound') return <NotFoundPage />
  if (phase === 'deleted')
    return draft ? (
      <DeletedRecovery
        doc={doc}
        draft={draft}
        source={recoverSource ?? 'pending'}
        bodyText={content?.code ?? ''}
        restorePath={(id) => `/studio/roll20code/${id}`}
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
        <span>롤꾸코드를 불러오지 못했어요. 네트워크 연결을 확인한 뒤 새로고침해 주세요. {errorMessage}</span>
      </div>
    )
  if (doc.type !== 'roll20code' || !content)
    return (
      <div className="callout" role="note">
        <Icon name="alert" />
        <span>롤꾸코드가 아닌 문서예요.</span>
      </div>
    )
  return (
    <CodeEditor doc={doc} draft={draft} content={content} status={status} offlineCopy={offlineCopy} edit={edit} flush={flush}>
      <SyncNotices conflict={conflict} status={status} errorMessage={errorMessage} offlineCopy={offlineCopy} onResolve={(c) => void resolveConflict(c)} />
    </CodeEditor>
  )
}

/** /studio/roll20code/:id — 롤꾸코드 편집 */
export default function Roll20CodeEditorPage() {
  const { id = '' } = useParams()
  return (
    <>
      <h1 className="sr-only">롤꾸코드 편집</h1>
      <Roll20CodeStudio key={id} docId={id} />
    </>
  )
}
