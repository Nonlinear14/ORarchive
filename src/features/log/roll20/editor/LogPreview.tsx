import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../../components/Icon'
import { isEditable, type LogMessage, type Roll20LogContent } from '../model'
import { containerClass, messageClass, messageInnerHtml, messageStyle, ROLL20_CHAT_CSS, visibleMessages } from '../render'

/**
 * 로그 미리보기. 불러온 Roll20·시트 CSS 가 앱 화면을 바꾸지 못하도록 그림자 DOM 안에 그린다.
 * (CSS 변수는 그림자 경계를 넘어 상속되므로 앱의 글꼴·색 토큰은 그대로 쓸 수 있다)
 */

export type MessageAction = 'edit' | 'duplicate' | 'up' | 'down' | 'insert' | 'remove'

const OVERLAY_CSS = `
:host{display:block}
.log-msg{position:relative;outline:none}
.log-msg>.message{transition:box-shadow .12s}
.log-msg.is-active>.message{box-shadow:inset 0 0 0 2px #caa574}
.log-msg:focus-visible>.message{box-shadow:inset 0 0 0 2px #d9ac72}
.log-msg.is-editable>.message{cursor:text}
.log-msg.is-editing>.message{box-shadow:inset 0 0 0 2px #427a67;background:#fff}
.msg-actions{position:absolute;right:8px;top:-14px;display:flex;gap:2px;background:#142128;border-radius:9px;padding:3px;z-index:3;box-shadow:0 6px 16px rgba(23,36,42,.25)}
.msg-act{display:inline-flex;align-items:center;justify-content:center;border:0;background:none;color:#e9e2d4;border-radius:6px;padding:6px;font:600 11px var(--font, sans-serif);cursor:pointer}
.msg-act:hover:not(:disabled){background:#2b4146}
.msg-act:focus-visible{outline:2px solid #d9ac72}
.msg-act:disabled{opacity:.35;cursor:not-allowed}
.msg-act.danger{color:#e8aaa3}
.msg-act .ico{width:15px;height:15px}
.msg-edit{margin-top:4px;font-family:var(--font, sans-serif)}
.msg-edit textarea{display:block;box-sizing:border-box;width:100%;min-height:64px;resize:vertical;font:13px/1.6 var(--font, sans-serif);color:#000;background:#fff;border:1px solid #cfcabd;border-radius:8px;padding:8px 10px}
.msg-edit textarea:focus{outline:2px solid #ccb18b;outline-offset:1px}
.msg-edit-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap}
.msg-edit-foot small{font-size:10.5px;color:#7d8987;font-style:normal;font-weight:normal}
.msg-edit-foot button{border:1px solid #dad9d1;background:#fffdfa;color:#33433e;border-radius:8px;padding:6px 11px;font:700 11px var(--font, sans-serif);cursor:pointer}
.msg-edit-foot button.primary{background:#203b38;border-color:#203b38;color:#fff9ee}
.msg-flag{position:absolute;right:10px;top:9px;font:600 10px var(--font, sans-serif);color:#93524d;background:#f8ecea;border:1px solid #efd5d0;border-radius:6px;padding:3px 7px;font-style:normal}
.log-msg.is-hidden-kind>.message{opacity:.6}
.log-empty{padding:40px 16px;text-align:center;color:#666;font:13px var(--font, sans-serif)}
`

interface RowProps {
  content: Roll20LogContent
  message: LogMessage
  showHeader: boolean
  active: boolean
  editing: boolean
  first: boolean
  last: boolean
  onHover(id: string): void
  onOpen(message: LogMessage): void
  onAction(action: MessageAction, message: LogMessage): void
  onSaveText(message: LogMessage, text: string): void
  onCancelEdit(): void
}

function MessageEditor({ message, onSave, onCancel }: { message: LogMessage; onSave(text: string): void; onCancel(): void }) {
  const [value, setValue] = useState(message.text ?? '')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onSave(value)
    }
  }
  return (
    <div className="msg-edit">
      <textarea ref={ref} aria-label="메시지 내용" value={value} rows={3} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} />
      <div className="msg-edit-foot">
        <small>*기울임* · **굵게** · Ctrl+Enter 적용 · Esc 취소</small>
        <span>
          <button type="button" onClick={onCancel}>
            취소
          </button>{' '}
          <button type="button" className="primary" onClick={() => onSave(value)}>
            적용
          </button>
        </span>
      </div>
    </div>
  )
}

const MessageRow = memo(function MessageRow({
  content,
  message,
  showHeader,
  active,
  editing,
  first,
  last,
  onHover,
  onOpen,
  onAction,
  onSaveText,
  onCancelEdit,
}: RowProps) {
  const editable = isEditable(message)
  const cls = ['log-msg', active ? 'is-active' : '', editing ? 'is-editing' : '', editable ? 'is-editable' : '', message.kind === 'hidden' ? 'is-hidden-kind' : '']
    .filter(Boolean)
    .join(' ')
  const inner = messageInnerHtml(content, editing ? { ...message, text: '' } : message, showHeader)
  const label = `${message.speaker ?? '서술'} 메시지`
  const style = Object.fromEntries(
    messageStyle(content, message)
      .split(';')
      .filter(Boolean)
      .map((decl) => {
        const [prop, value] = decl.split(':')
        return [prop === 'background-color' ? 'backgroundColor' : prop, value]
      }),
  )
  return (
    <div
      className={cls}
      data-mid={message.id}
      tabIndex={0}
      aria-label={label}
      onMouseEnter={() => onHover(message.id)}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onHover(message.id)
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === 'Enter') onOpen(message)
      }}
    >
      <div
        className={messageClass(content, message)}
        style={style}
        onClick={() => !editing && onOpen(message)}
        dangerouslySetInnerHTML={{ __html: inner }}
      />
      {editing && <MessageEditor message={message} onSave={(text) => onSaveText(message, text)} onCancel={onCancelEdit} />}
      {message.kind === 'hidden' && <span className="msg-flag">숨긴 메시지 · 일괄 정리에서 지울 수 있어요</span>}
      {active && !editing && (
        <div className="msg-actions" role="toolbar" aria-label="메시지 편집">
          <button
            type="button"
            className="msg-act"
            disabled={!editable}
            title={editable ? '수정' : '판정·주사위·꾸민 메시지는 내용을 고칠 수 없어요'}
            aria-label="수정"
            onClick={() => onAction('edit', message)}
          >
            <Icon name="edit" />
          </button>
          <button type="button" className="msg-act" title="복제" aria-label="복제" onClick={() => onAction('duplicate', message)}>
            <Icon name="copy" />
          </button>
          <button type="button" className="msg-act" title="위로" aria-label="위로" disabled={first} onClick={() => onAction('up', message)}>
            <Icon name="up" />
          </button>
          <button type="button" className="msg-act" title="아래로" aria-label="아래로" disabled={last} onClick={() => onAction('down', message)}>
            <Icon name="down" />
          </button>
          <button type="button" className="msg-act" title="아래에 새 메시지" aria-label="아래에 새 메시지" onClick={() => onAction('insert', message)}>
            <Icon name="plus" />
          </button>
          <button type="button" className="msg-act danger" title="삭제" aria-label="삭제" onClick={() => onAction('remove', message)}>
            <Icon name="trash" />
          </button>
        </div>
      )}
    </div>
  )
})

interface LogPreviewProps {
  content: Roll20LogContent
  editingId: string | null
  /** 휴대폰처럼 마우스를 올릴 수 없는 화면: 메시지를 누르면 메뉴를 연다 */
  touchMenu: boolean
  onAction(action: MessageAction, message: LogMessage): void
  onSaveText(message: LogMessage, text: string): void
  onCancelEdit(): void
  onOpenMenu(message: LogMessage): void
}

export function LogPreview({ content, editingId, touchMenu, onAction, onSaveText, onCancelEdit, onOpenMenu }: LogPreviewProps) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const hostRef = useCallback((host: HTMLDivElement | null) => {
    if (host) setShadow(host.shadowRoot ?? host.attachShadow({ mode: 'open' }))
  }, [])

  const rows = visibleMessages(content)
  const onOpen = useCallback(
    (message: LogMessage) => {
      if (touchMenu) onOpenMenu(message)
      else if (isEditable(message)) onAction('edit', message)
    },
    [touchMenu, onOpenMenu, onAction],
  )
  const onHover = useCallback((id: string) => {
    if (!touchMenu) setHoverId(id)
  }, [touchMenu])

  return (
    <div ref={hostRef} className="log-stage" data-testid="log-stage" onMouseLeave={() => setHoverId(null)}>
      {shadow &&
        createPortal(
          <>
            <style>{`${ROLL20_CHAT_CSS}\n${content.sheetCss}\n${OVERLAY_CSS}`}</style>
            <div className={containerClass(content)}>
              <div className="content">
                {rows.length === 0 && <div className="log-empty">보여 줄 메시지가 없어요. 일괄 정리 설정을 확인해 보세요.</div>}
                {rows.map(({ message, showHeader }, index) => (
                  <MessageRow
                    key={message.id}
                    content={content}
                    message={message}
                    showHeader={showHeader}
                    active={!touchMenu && hoverId === message.id}
                    editing={editingId === message.id}
                    first={index === 0}
                    last={index === rows.length - 1}
                    onHover={onHover}
                    onOpen={onOpen}
                    onAction={onAction}
                    onSaveText={onSaveText}
                    onCancelEdit={onCancelEdit}
                  />
                ))}
              </div>
            </div>
          </>,
          shadow,
        )}
    </div>
  )
}
