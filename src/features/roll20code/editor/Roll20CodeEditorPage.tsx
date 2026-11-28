import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { DeletedRecovery } from '../../../components/document/DeletedRecovery'
import '../../../components/document/DocumentEditor.css'
import { SyncNotices } from '../../../components/document/SyncNotices'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { SaveStatusChip } from '../../../components/SaveStatusChip'
import { Toast } from '../../../components/Toast'
import { useAuth } from '../../../lib/auth/context'
import { copyText } from '../../../lib/clipboard'
import { documentPath, type DocumentContent, type DocumentDraft, type DocumentRecord } from '../../../lib/documents'
import { errorMessageOf, type SaveStatus } from '../../../lib/documentSync'
import { formatRelativeTime } from '../../../lib/format'
import { recordRecentView } from '../../../lib/recentViews'
import { useDocument } from '../../../lib/useDocument'
import { useEditHistory } from '../../../lib/useEditHistory'
import { useRepository } from '../../../lib/useRepository'
import { useToast } from '../../../lib/useToast'
import { NotFoundPage } from '../../../pages/NotFoundPage'
import { ColorField } from '../../handout/studio/DesignPanel'
import '../../handout/studio/HandoutStudio.css'
import { isRoll20Code, NEW_ROLL20_CODE_TITLE, resolveRoll20Code, roll20CodeContent, type Roll20CodeContent } from '../model'
import {
  allDesc,
  colorGroups,
  colorUsageLabel,
  defaultAnswer,
  fillQueries,
  findQueries,
  fontProps,
  imageMessages,
  inMessage,
  italicRemoved,
  messageSlots,
  messageSpans,
  setColor,
  setDesc,
  setFontValue,
  setImageUrl,
  setItalicRemoved,
  setSlotText,
  slotAsQuery,
  type FontProp,
  type LinkPart,
} from '../parse'
import '../roll20Code.css'
import { ChatPreview } from './ChatPreview'

/** 저장된 content 의 code 만 바꾼다 (다른 키는 그대로) */
const withCode = (code: string) => (stored: DocumentContent) => {
  const obj = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  if (obj.code === code) return stored
  return { ...obj, code } as DocumentContent
}

const FONT_LABEL: Record<FontProp['property'], string> = {
  'font-size': '크기',
  'font-weight': '굵기',
  'letter-spacing': '자간',
  'line-height': '행간',
  'font-style': '기울임',
}
const WEIGHTS = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']
const FONT_STYLES = ['normal', 'italic']

/** 글자 칸 아래 글꼴 칸: 코드에 이미 있는 속성만 (크기 · 굵기 · 자간 · 행간 · 기울임). 고치면 그 값 자리만 바뀐다 */
function FontFields({
  code,
  slot,
  idBase,
  label,
  apply,
}: {
  code: string
  slot: LinkPart
  idBase: string
  label: string
  apply(op: (stored: DocumentContent) => DocumentContent, group?: string): void
}) {
  const props = fontProps(slot)
  if (props.length === 0) return null
  return (
    <div className="r20-font" role="group" aria-label={`${label} 글꼴`}>
      {props.map((prop) => {
        const id = `${idBase}-${prop.property}`
        const set = (value: string) => apply(withCode(setFontValue(code, prop, value)), `${id}:${slot.styleSpan?.start}`)
        const num = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(prop.value)
        let control: ReactNode
        if (prop.property === 'font-weight' || prop.property === 'font-style') {
          const list = prop.property === 'font-weight' ? WEIGHTS : FONT_STYLES
          const choices = list.includes(prop.value.toLowerCase()) ? list : [prop.value, ...list]
          control = (
            <select
              id={id}
              className="field-input"
              value={list.includes(prop.value.toLowerCase()) ? prop.value.toLowerCase() : prop.value}
              onChange={(e) => set(e.target.value)}
            >
              {choices.map((c) => (
                <option key={c} value={c}>
                  {c === 'normal'
                    ? prop.property === 'font-style'
                      ? '없음 (normal)'
                      : '보통 (normal)'
                    : c === 'bold'
                      ? '굵게 (bold)'
                      : c === 'italic'
                        ? '기울임 (italic)'
                        : c}
                </option>
              ))}
            </select>
          )
        } else if (num) {
          control = (
            <span className="r20-font-num">
              <input
                id={id}
                className="field-input"
                type="number"
                step={num[2] === 'px' || num[2] === '' ? 1 : 0.1}
                value={num[1]}
                onChange={(e) => e.target.value !== '' && set(`${e.target.value}${num[2]}`)}
              />
              {num[2] && <em>{num[2]}</em>}
            </span>
          )
        } else {
          control = <input id={id} className="field-input" value={prop.value} onChange={(e) => set(e.target.value)} />
        }
        return (
          <div key={prop.property} className="r20-font-field">
            <label htmlFor={id}>{FONT_LABEL[prop.property]}</label>
            {control}
          </div>
        )
      })}
    </div>
  )
}

interface EditorProps {
  doc: DocumentRecord
  draft: DocumentDraft
  content: Roll20CodeContent
  status: SaveStatus
  offlineCopy: boolean
  edit(patch: Partial<DocumentDraft>): void
  flush(): Promise<void>
  children?: ReactNode
  /** 아직 서버에 없는 새 롤꾸코드 (코드나 이름을 처음 넣을 때 만든다) */
  isNew?: boolean
}

function CodeEditor({ doc, draft, content, status, offlineCopy, edit, flush, children, isNew = false }: EditorProps) {
  const { toast, show } = useToast()
  const { apply, undo, redo, canUndo, canRedo } = useEditHistory(draft.content, edit)
  const code = content.code
  // 질문 예시 답: 미리보기 · 롤꾸 복사에만 쓰고 저장하지 않는다
  // 코드 직접 고치기: 넓은 화면에서는 처음부터 펼침, 휴대폰은 접어 둠
  // 코드가 비어 있으면(새 롤꾸코드) 휴대폰에서도 펼친다
  const [rawOpen, setRawOpen] = useState(
    () => !content.code.trim() || typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 1051px)').matches,
  )
  const [answers, setAnswers] = useState<Record<string, string>>({})
  // 여러 메시지: 미리보기에서 누른 메시지만 고친다 (null = 전체)
  const [selected, setSelected] = useState<number | null>(null)
  const editCard = useRef<HTMLElement>(null)
  const messages = useMemo(() => messageSpans(code), [code])
  const multi = messages.length > 1
  const sel = multi && selected !== null && selected < messages.length ? selected : null
  const toggleMessage = useCallback((i: number) => setSelected((cur) => (cur === i ? null : i)), [])
  // 여러 메시지인데 아무것도 고르지 않았으면 내용 칸은 비우고 안내만 (색은 문서 전체)
  const picking = multi && sel === null
  const slotRefs = useMemo(() => messageSlots(code), [code])
  const slots = useMemo(() => slotRefs.map((r) => r.slot), [slotRefs])
  // 글자 번호: 한 메시지면 문서 전체 순서, 여러 메시지면 메시지 안 순서
  const shownSlots = useMemo(() => {
    const counts = new Map<number, number>()
    return slotRefs
      .map((r, global) => {
        const n = (counts.get(r.message) ?? 0) + 1
        counts.set(r.message, n)
        return { ...r, global, n: multi ? n : global + 1 }
      })
      .filter((r) => sel === null || r.message === sel)
  }, [slotRefs, multi, sel])
  const shownImages = useMemo(() => imageMessages(code).filter((img) => sel === null || img.message === sel), [code, sel])
  const colors = useMemo(() => colorGroups(code, sel), [code, sel])
  const shownQueries = useMemo(() => {
    const inside = inMessage(code, sel)
    const seen = new Set<string>()
    return findQueries(code).filter((q) => {
      if (!inside(q) || seen.has(q.label)) return false
      seen.add(q.label)
      return true
    })
  }, [code, sel])
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

  const renderImage = (img: (typeof shownImages)[number]) => {
    const id = `img-${img.message}`
    return (
      <div className="r20-slot" key={id}>
        <label className="field-label sub" htmlFor={img.asked ? undefined : id}>
          이미지 주소
        </label>
        {img.asked ? (
          <small className="r20-slot-note">주소 안에 질문(?{'{…}'})이 있어요. 아래 "질문 예시"에서 고르면 그 이미지가 보여요.</small>
        ) : (
          <input
            id={id}
            className="field-input"
            value={img.url}
            spellCheck={false}
            onChange={(e) => apply(withCode(setImageUrl(code, img, e.target.value)), `img:${img.message}`)}
          />
        )}
      </div>
    )
  }
  const renderSlot = ({ slot, n, global }: (typeof shownSlots)[number]) => {
    const id = `slot-${global}`
    const asked = /\?\{[^{}]*\}/.test(slot.text)
    return (
      <div className="r20-slot" key={`${global}-${slot.textSpan.start}`}>
        <label className="field-label sub" htmlFor={id}>
          글자 {n}
        </label>
        <div className="r20-slot-row">
          <input
            id={id}
            className="field-input"
            value={slot.text}
            onChange={(e) => apply(withCode(setSlotText(code, slot, e.target.value)), `slot:${global}`)}
          />
          {!asked && (
            <button
              type="button"
              className="btn small"
              title="Roll20 매크로를 실행할 때 이 글자를 물어보게 해요"
              onClick={() => apply(withCode(setSlotText(code, slot, slotAsQuery(slot.text, global))))}
            >
              질문으로
            </button>
          )}
        </div>
        <FontFields code={code} slot={slot} idBase={id} label={`글자 ${n}`} apply={apply} />
        {asked && !multi && <small className="r20-slot-note">?{'{…}'} 질문은 매크로를 실행할 때 물어봐요. 미리보기는 아래 "질문 예시"로 채워요.</small>}
      </div>
    )
  }
  // 메시지 순서대로: 이미지 주소 · 글자 칸
  const contentItems = [
    ...shownImages.map((img) => ({ at: img.message, node: renderImage(img) })),
    ...shownSlots.map((r) => ({ at: r.message, node: renderSlot(r) })),
  ].sort((x, y) => x.at - y.at)

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
            {isNew
              ? '롤꾸코드 · 아직 저장 전 · 코드를 붙여 넣거나 이름을 바꾸면 저장돼요'
              : `롤꾸코드 · v${doc.version} · ${offlineCopy ? '이 기기에 저장해 둔 사본' : `${formatRelativeTime(doc.updated_at)} 서버에 저장`}`}
          </p>
        </div>
        <div className="editor-toolbar">
          {!isNew && <SaveStatusChip status={status} />}
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

      {/* PC: 왼쪽 = 미리보기 · 꾸미기 카드(내용 + 질문 예시 | 색) · 복사 / 오른쪽 = 되돌리기 · 옵션 · 코드
          휴대폰(1050px 이하): 미리보기 · 복사 → 되돌리기 · 옵션 · 코드 → 내용 · 질문 예시 · 색 (CSS order) */}
      <div className="studio-shell r20-shell">
        <section className="preview-workspace r20-workspace" aria-label="미리보기">
          <div className="canvas-tools">
            <span className="edit-hint">
              <Icon name="edit" /> 편집 패널에서 글자와 색을 고치면 바로 보여요
            </span>
            <span className="canvas-meta">Roll20 채팅창</span>
          </div>
          <div className="canvas-stage r20-stage">
            {code.trim() ? (
              <ChatPreview code={code} answers={answers} selected={multi ? sel : null} onSelect={multi ? toggleMessage : undefined} />
            ) : (
              <p className="r20-empty" role="note">
                편집 패널의 "코드 직접 고치기"에 롤꾸 코드를 붙여 넣으세요.
                <br />
                붙여 넣으면 이곳에 Roll20 채팅 모양으로 보이고, 내 템플릿에 저장돼요.
              </p>
            )}
          </div>
          {sel !== null && (
            <div className="r20-jump" role="status">
              <span>메시지 {sel + 1} 선택됨</span>
              <button type="button" className="btn small" onClick={() => editCard.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                편집하러 가기 ↓
              </button>
            </div>
          )}
          <section className="r20-edit" aria-label="꾸미기" ref={editCard}>
            {multi && (
              <div className={`r20-edit-head${sel !== null ? ' is-picked' : ''}`}>
                {sel !== null ? (
                  <>
                    <strong>메시지 {sel + 1} 편집 중</strong>
                    <span>이 메시지 안의 글자 · 색 · 질문만 보여요</span>
                    <button type="button" className="btn small" onClick={() => setSelected(null)}>
                      전체 보기
                    </button>
                  </>
                ) : (
                  <>
                    <strong>전체 메시지 {messages.length}개</strong>
                    <span>미리보기에서 메시지를 누르면 그 메시지만 고칠 수 있어요</span>
                  </>
                )}
              </div>
            )}
            <div className="r20-col r20-col-content">
              <span className="field-label">내용</span>
              {picking ? (
                <p className="r20-pick-hint" role="note">
                  수정할 열을 선택해 주세요
                  <small>미리보기에서 메시지를 누르면 그 메시지의 내용 · 질문 예시 · 색이 보여요.</small>
                </p>
              ) : (
                <>
                  {shownSlots.length === 0 && shownImages.length === 0 && (
                    <p className="field-help">꾸밀 글자([글자](#" style="…"))가 없어요. "코드 직접 고치기"에서 넣을 수 있어요.</p>
                  )}
                  {contentItems.map((item) => item.node)}
                  {shownQueries.length > 0 && (
                    <div className="r20-queries" role="group" aria-label="질문 예시">
                      <span className="field-label">질문 예시</span>
                      <p className="field-help">
                        Roll20 이 매크로를 실행할 때 묻는 질문이에요. 여기 넣은 답으로 미리보기 · 롤꾸 복사를 만들어요 (저장되지 않아요).
                      </p>
                      {shownQueries.map((q) => {
                        const id = `q-${q.label}`
                        const set = (value: string) => setAnswers({ ...answers, [q.label]: value })
                        return (
                          <div className="r20-query" key={q.label}>
                            <label htmlFor={id}>{q.label || '(이름 없는 질문)'}</label>
                            {q.options.length > 1 ? (
                              <select id={id} className="field-input" value={answers[q.label] ?? defaultAnswer(q)} onChange={(e) => set(e.target.value)}>
                                {q.options.map((o, i) =>
                                  o.separator ? (
                                    <option key={`sep-${i}`} disabled value={`\u0000sep-${i}`}>
                                      {o.name}
                                    </option>
                                  ) : (
                                    <option key={`${o.value}-${i}`} value={o.value}>
                                      {o.name}
                                    </option>
                                  ),
                                )}
                              </select>
                            ) : (
                              <input
                                id={id}
                                className="field-input"
                                value={answers[q.label] ?? ''}
                                placeholder={defaultAnswer(q)}
                                onChange={(e) => set(e.target.value)}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="r20-col r20-col-colors">
              <span className="field-label">색</span>
              {colors.length === 0 ? (
                <p className="field-help">{sel !== null ? '이 메시지에는 바꿀 수 있는 색이 없어요.' : '코드에서 바꿀 수 있는 색을 찾지 못했어요.'}</p>
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
              disabled={!code.trim()}
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

          <div className="panel-section r20-options">
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
  const location = useLocation()
  const navigate = useNavigate()
  // 새 롤꾸코드: 문서를 만드는 동안 더 입력한 내용을 넘겨받아 한 번 반영하고, 기록에서 지운다 (새로고침 때 다시 덮지 않게)
  const pending = (location.state as { r20Pending?: DocumentDraft } | null)?.r20Pending
  useEffect(() => {
    if (!pending || phase !== 'ready' || !draft) return
    const code = (draft.content as { code?: unknown }).code
    const pendingCode = (pending.content as { code?: unknown }).code
    if (pending.title !== draft.title || pendingCode !== code)
      edit({ title: pending.title, content: { ...(draft.content as object), code: pendingCode } as DocumentContent })
    navigate(location.pathname, { replace: true, state: null })
  }, [pending, phase, draft, edit, navigate, location.pathname])
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

/**
 * /studio/roll20code/new — 빈 롤꾸코드 편집기. 아무것도 넣지 않고 나가면 문서가 생기지 않는다.
 * 코드나 이름을 처음 바꾸는 순간 문서를 만들고(그 사이 입력은 이 화면에 쌓아 둠), 만들어지면 그 문서의 편집기로 넘어가며
 * 마지막 입력을 넘겨 준다 — 입력한 글은 잃지 않는다. 만들기에 실패하면 글은 화면에 남고, 다음 입력 때 다시 시도한다.
 */
function NewRoll20Code() {
  const repo = useRepository()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [draft, setDraft] = useState<DocumentDraft>(() => ({ title: NEW_ROLL20_CODE_TITLE, content: roll20CodeContent('') }))
  const latest = useRef(draft)
  const creating = useRef(false)
  const [failed, setFailed] = useState<string | null>(null)
  const content = useMemo(() => resolveRoll20Code(draft.content), [draft.content])
  const now = useMemo(() => new Date().toISOString(), [])
  const doc: DocumentRecord = useMemo(
    () =>
      ({
        id: 'new',
        owner_id: user?.id ?? '',
        project_id: null,
        type: 'roll20code',
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

  const edit = useCallback(
    (patch: Partial<DocumentDraft>) => {
      const next = { ...latest.current, ...patch }
      latest.current = next
      setDraft(next)
      if (creating.current) return
      creating.current = true
      setFailed(null)
      repo.create({ type: 'roll20code', title: next.title, content: next.content }).then(
        (created) => navigate(documentPath('roll20code', created.id), { replace: true, state: { r20Pending: latest.current } }),
        (err: unknown) => {
          creating.current = false
          setFailed(errorMessageOf(err))
        },
      )
    },
    [repo, navigate],
  )

  return (
    <CodeEditor doc={doc} draft={draft} content={content} status="saved" offlineCopy={false} edit={edit} flush={() => Promise.resolve()} isNew>
      {failed && (
        <div className="callout danger" role="alert">
          <Icon name="alert" />
          <span>롤꾸코드를 저장하지 못했어요: {failed} 입력한 내용은 이 화면에 남아 있고, 다시 입력하면 다시 저장해요.</span>
        </div>
      )}
    </CodeEditor>
  )
}

/** /studio/roll20code/:id — 롤꾸코드 편집 */
export default function Roll20CodeEditorPage() {
  const { id = '' } = useParams()
  return (
    <>
      <h1 className="sr-only">롤꾸코드 편집</h1>
      {id === 'new' ? <NewRoll20Code /> : <Roll20CodeStudio key={id} docId={id} />}
    </>
  )
}
