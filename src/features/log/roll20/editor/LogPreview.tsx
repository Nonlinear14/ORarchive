import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../../components/Icon'
import { isEditable, type LogMessage, type Roll20LogContent } from '../model'
import { containerClass, displayName, logCss, messageClass, messageInnerHtml, messageStyle, textToHtml, visibleMessages } from '../render'
import { editableHtmlToText } from './inlineText'
import { lockInlineParts } from '../styledText'
import { ensureViewerFonts, VIEWER_FONT_CSS } from './viewerFonts'

/**
 * 로그 미리보기. 불러온 Roll20·시트·확장 프로그램 CSS 가 앱 화면을 바꾸지 못하도록 그림자 DOM 안에 그린다.
 * (CSS 변수는 그림자 경계를 넘어 상속되므로 앱의 글꼴·색 토큰은 그대로 쓸 수 있다)
 * 메시지는 그 자리에서 바로 고친다 (contentEditable). Ctrl+B 굵게 · Ctrl+I 기울임 · Enter 적용 · Shift+Enter 줄바꿈 · Esc 취소.
 */

export type MessageAction = 'edit' | 'duplicate' | 'up' | 'down' | 'insert' | 'remove'

/** 화자 바꾸기 대상: 캐릭터 이름, 또는 desc 서술(null) */
export type SpeakerTarget = string | null

const OVERLAY_CSS = `
:host{display:block}
.log-msg{position:relative;outline:none}
.log-msg>.message{transition:box-shadow .12s}
.log-msg.is-active>.message{box-shadow:inset 0 0 0 2px #caa574}
.log-msg:focus-visible>.message{box-shadow:inset 0 0 0 2px #d9ac72}
.log-msg.is-editable>.message{cursor:text}
.log-msg.is-editing>.message{box-shadow:inset 0 0 0 2px #427a67}
.log-msg.is-editing .avatar,.log-msg.is-editing .by{cursor:pointer}
.log-msg.is-editing .avatar:hover img,.log-msg.is-editing .by:hover{outline:2px dashed #427a67;outline-offset:2px}
.msg-inline{outline:none;white-space:pre-wrap;min-width:2em;display:inline}
.msg-inline:empty::before{content:'대사를 입력하세요';color:#999;font-style:italic}
.msg-hint{display:block;margin:4px 0 0;font:500 10.5px var(--font, sans-serif);color:#5f6b66;font-style:normal;text-align:left}
.msg-actions{position:absolute;right:8px;top:-14px;display:flex;gap:2px;background:#142128;border-radius:9px;padding:3px;z-index:3;box-shadow:0 6px 16px rgba(23,36,42,.25)}
.msg-act{display:inline-flex;align-items:center;justify-content:center;border:0;background:none;color:#e9e2d4;border-radius:6px;padding:6px;cursor:pointer}
.msg-act:hover:not(:disabled){background:#2b4146}
.msg-act:focus-visible{outline:2px solid #d9ac72}
.msg-act:disabled{opacity:.35;cursor:not-allowed}
.msg-act.danger{color:#e8aaa3}
.msg-act .ico{width:15px;height:15px}
.speaker-btn{position:absolute;left:4px;top:4px;z-index:4;display:none;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:7px;background:#142128;color:#e9e2d4;cursor:pointer}
.log-msg.is-editing.no-head:hover .speaker-btn,.speaker-btn:focus-visible,.speaker-btn[aria-expanded="true"]{display:inline-flex}
.speaker-btn .ico{width:15px;height:15px}
.speaker-menu{position:absolute;left:8px;top:32px;z-index:6;min-width:200px;max-height:260px;overflow:auto;background:#fffdfa;border:1px solid #e1ded6;border-radius:10px;box-shadow:0 12px 28px rgba(23,36,42,.22);padding:5px;font:600 12.5px var(--font, sans-serif);text-align:left;font-style:normal}
.speaker-menu .speaker-title{padding:6px 8px 5px;font-size:10.5px;color:#7d8987;font-weight:700}
.speaker-menu button{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;padding:7px 8px;border-radius:7px;color:#26332f;font:inherit;cursor:pointer;text-align:left}
.speaker-menu button:hover,.speaker-menu button:focus-visible{background:#f1ede4;outline:none}
.speaker-menu button[aria-current="true"]{color:#427a67}
.speaker-menu img,.speaker-menu .sp-av{width:20px;height:20px;border-radius:4px;object-fit:cover;flex:none;background:#e6dfd2;display:grid;place-items:center;font-size:9px;color:#6b5a48}
.msg-flag{position:absolute;right:10px;top:9px;font:600 10px var(--font, sans-serif);color:#93524d;background:#f8ecea;border:1px solid #efd5d0;border-radius:6px;padding:3px 7px;font-style:normal}
.log-msg.is-hidden-kind>.message{opacity:.6}
.log-msg .message img{cursor:pointer}
.log-msg .message img:hover{outline:2px solid #caa574;outline-offset:2px}
.log-msg .avatar img{cursor:inherit}
.log-msg:not(.is-editing) .avatar img:hover{outline:none}
.log-empty{padding:40px 16px;text-align:center;color:#666;font:13px var(--font, sans-serif)}
`

export interface SpeakerOption {
  speaker: string
  avatar?: string
}

/** 화자 바꾸기 드롭다운 */
function SpeakerMenu({
  current,
  options,
  content,
  onPick,
}: {
  current: SpeakerTarget
  options: SpeakerOption[]
  content: Roll20LogContent
  onPick(target: SpeakerTarget): void
}) {
  // 메뉴를 눌러도 글자 칸의 포커스가 빠지지 않게 (빠지면 수정이 끝나 버린다)
  const keep = (e: MouseEvent) => e.preventDefault()
  return (
    <div className="speaker-menu" role="menu" aria-label="캐릭터 바꾸기" onMouseDown={keep}>
      <div className="speaker-title">이 메시지의 캐릭터</div>
      <button type="button" role="menuitem" aria-current={current === null} onClick={() => onPick(null)}>
        <span className="sp-av">desc</span> desc 서술
      </button>
      {options.map((o) => {
        const avatar = content.characters[o.speaker]?.avatar || o.avatar
        return (
          <button key={o.speaker} type="button" role="menuitem" aria-current={current === o.speaker} onClick={() => onPick(o.speaker)}>
            {avatar ? <img src={avatar} alt="" /> : <span className="sp-av">{o.speaker.slice(0, 1)}</span>}
            {displayName(content, o.speaker)}
          </button>
        )
      })}
    </div>
  )
}

/** 메시지 div 에 캐릭터 색을 !important 로 (확장 프로그램 꾸밈의 !important 보다 우선) */
function useImportantStyle(css: string) {
  return useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return
      el.removeAttribute('style')
      for (const decl of css.split(';').filter(Boolean)) {
        const i = decl.indexOf(':')
        el.style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).replace('!important', '').trim(), 'important')
      }
    },
    [css],
  )
}

/** 수정 중인 메시지: 머리(저널·이름)는 그대로, 본문은 그 자리에서 고친다 */
function EditingMessage({
  content,
  message,
  showHeader,
  speakers,
  onSave,
  onCancel,
  onChangeSpeaker,
  onImage,
}: {
  content: Roll20LogContent
  message: LogMessage
  showHeader: boolean
  speakers: SpeakerOption[]
  onSave(value: MessageEdit): void
  onCancel(): void
  onChangeSpeaker(target: SpeakerTarget): void
  onImage(index: number, src: string): void
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const done = useRef(false)
  // 꾸민 글자 메시지는 HTML 그대로 고친다 (꾸밈은 두고 글자만)
  const styled = message.text === undefined
  const initial = useRef(styled ? (message.html ?? '') : (message.text ?? ''))
  const styleRef = useImportantStyle(messageStyle(content, message))

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (styled) {
      el.innerHTML = initial.current
      lockInlineParts(el)
    } else el.innerHTML = textToHtml(initial.current)
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 열 때 한 번만 채운다
  }, [])

  const save = () => {
    if (done.current || !ref.current) return
    done.current = true
    if (styled) {
      // 잠근 표시(contenteditable)와 브라우저가 붙인 빈 style 은 걷어 낸다 — 글자를 안 고쳤으면 저장 값도 그대로
      const tidy = (html: string) => {
        const holder = document.createElement('div')
        holder.innerHTML = html
        for (const el of holder.querySelectorAll('[contenteditable]')) el.removeAttribute('contenteditable')
        for (const el of holder.querySelectorAll('[style=""]')) el.removeAttribute('style')
        return holder.innerHTML
      }
      const edited = tidy(ref.current.innerHTML)
      onSave({ html: edited === tidy(initial.current) ? initial.current : edited })
    } else onSave({ text: editableHtmlToText(ref.current) })
  }
  const cancel = () => {
    done.current = true
    onCancel()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return // 한글 조합 중
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      save()
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      document.execCommand('insertLineBreak')
    } else if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      document.execCommand('bold')
    } else if (mod && e.key.toLowerCase() === 'i') {
      e.preventDefault()
      document.execCommand('italic')
    }
  }

  const head = messageInnerHtml(content, { ...message, text: '' }, showHeader)
  const current: SpeakerTarget = message.kind === 'desc' || message.kind === 'emote' ? null : (message.speaker ?? null)
  const pick = (target: SpeakerTarget) => {
    setMenuOpen(false)
    if (target !== current) onChangeSpeaker(target)
    ref.current?.focus()
  }

  return (
    <>
      <div
        ref={styleRef}
        className={messageClass(content, message)}
        onMouseDown={(e) => {
          // 수정 중에 저널·이름을 누르면 캐릭터 바꾸기
          if ((e.target as Element).closest('.avatar, .by')) {
            e.preventDefault()
            setMenuOpen((v) => !v)
          }
        }}
      >
        <span dangerouslySetInnerHTML={{ __html: head }} />
        <span
          ref={ref}
          className="msg-inline"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="메시지 내용"
          spellCheck={false}
          onKeyDown={onKeyDown}
          onBlur={save}
          onClick={(e) => {
            // 글자와 함께 있는 이미지: 고친 글자를 먼저 저장하고 이미지 바꾸기
            const img = (e.target as Element).closest('img')
            if (!img) return
            const images = [...e.currentTarget.querySelectorAll('img')]
            save()
            onImage(images.indexOf(img), img.getAttribute('src') ?? '')
          }}
          onPaste={(e) => {
            e.preventDefault()
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
          }}
        />
        <small className="msg-hint">Enter 적용 · Shift+Enter 줄바꿈 · Ctrl+B 굵게 · Ctrl+I 기울임 · Esc 취소</small>
      </div>
      <button
        type="button"
        className="speaker-btn"
        title="캐릭터 바꾸기"
        aria-label="캐릭터 바꾸기"
        aria-expanded={menuOpen}
        onMouseDown={(e) => {
          e.preventDefault()
          setMenuOpen((v) => !v)
        }}
      >
        <Icon name="characters" />
      </button>
      {menuOpen && <SpeakerMenu current={current} options={speakers} content={content} onPick={pick} />}
    </>
  )
}

/** 수정 칸에서 고친 결과: 글자 메시지는 text, 꾸민 글자 메시지는 html */
export type MessageEdit = { text: string } | { html: string }

interface RowProps {
  content: Roll20LogContent
  message: LogMessage
  showHeader: boolean
  active: boolean
  editing: boolean
  first: boolean
  last: boolean
  speakers: SpeakerOption[]
  onHover(id: string): void
  onOpen(message: LogMessage): void
  onAction(action: MessageAction, message: LogMessage): void
  onSaveText(message: LogMessage, value: MessageEdit): void
  onCancelEdit(): void
  onChangeSpeaker(message: LogMessage, target: SpeakerTarget): void
  onImage(message: LogMessage, index: number, src: string): void
}

function ViewMessage({
  content,
  message,
  showHeader,
  onOpen,
  onImage,
}: {
  content: Roll20LogContent
  message: LogMessage
  showHeader: boolean
  onOpen(): void
  onImage(index: number, src: string): void
}) {
  const styleRef = useImportantStyle(messageStyle(content, message))
  return (
    <div
      ref={styleRef}
      className={messageClass(content, message)}
      onClick={(e) => {
        // 로그 속 이미지(저널 제외)를 누르면 이미지 바꾸기
        const img = (e.target as Element).closest('img')
        if (img && !img.closest('.avatar')) {
          const images = [...e.currentTarget.querySelectorAll('img')].filter((el) => !el.closest('.avatar'))
          onImage(images.indexOf(img), img.getAttribute('src') ?? '')
          return
        }
        onOpen()
      }}
      dangerouslySetInnerHTML={{ __html: messageInnerHtml(content, message, showHeader) }}
    />
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
  speakers,
  onHover,
  onOpen,
  onAction,
  onSaveText,
  onCancelEdit,
  onChangeSpeaker,
  onImage,
}: RowProps) {
  const editable = isEditable(message)
  const hasHead = showHeader && !!message.speaker && message.kind !== 'desc' && message.kind !== 'emote'
  const cls = [
    'log-msg',
    active ? 'is-active' : '',
    editing ? 'is-editing' : '',
    editable ? 'is-editable' : '',
    hasHead ? '' : 'no-head',
    message.kind === 'hidden' ? 'is-hidden-kind' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const label = `${message.speaker ?? '서술'} 메시지`
  return (
    <div
      className={cls}
      data-mid={message.id}
      tabIndex={editing ? -1 : 0}
      aria-label={label}
      onMouseEnter={() => onHover(message.id)}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onHover(message.id)
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === 'Enter') onOpen(message)
      }}
    >
      {editing ? (
        <EditingMessage
          content={content}
          message={message}
          showHeader={showHeader}
          speakers={speakers}
          onSave={(value) => onSaveText(message, value)}
          onImage={(index, src) => onImage(message, index, src)}
          onCancel={onCancelEdit}
          onChangeSpeaker={(target) => onChangeSpeaker(message, target)}
        />
      ) : (
        <ViewMessage
          content={content}
          message={message}
          showHeader={showHeader}
          onOpen={() => onOpen(message)}
          onImage={(index, src) => onImage(message, index, src)}
        />
      )}
      {message.kind === 'hidden' && <span className="msg-flag">숨긴 메시지 · 전체 다듬기에서 지울 수 있어요</span>}
      {active && !editing && (
        <div className="msg-actions" role="toolbar" aria-label="메시지 편집">
          <button
            type="button"
            className="msg-act"
            disabled={!editable}
            title={editable ? '수정' : '판정·주사위·이미지만 있는 메시지는 내용을 고칠 수 없어요'}
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
  speakers: SpeakerOption[]
  onAction(action: MessageAction, message: LogMessage): void
  onSaveText(message: LogMessage, value: MessageEdit): void
  onCancelEdit(): void
  onOpenMenu(message: LogMessage): void
  onChangeSpeaker(message: LogMessage, target: SpeakerTarget): void
  /** 로그 속 이미지를 눌렀을 때 (이미지 바꾸기) */
  onImage(message: LogMessage, index: number, src: string): void
}

export function LogPreview({
  content,
  editingId,
  touchMenu,
  speakers,
  onAction,
  onSaveText,
  onCancelEdit,
  onOpenMenu,
  onChangeSpeaker,
  onImage,
}: LogPreviewProps) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const hostRef = useCallback((host: HTMLDivElement | null) => {
    if (host) setShadow(host.shadowRoot ?? host.attachShadow({ mode: 'open' }))
  }, [])
  useEffect(() => ensureViewerFonts(), [])

  const rows = visibleMessages(content)
  const onOpen = useCallback(
    (message: LogMessage) => {
      if (touchMenu) onOpenMenu(message)
      else if (isEditable(message)) onAction('edit', message)
    },
    [touchMenu, onOpenMenu, onAction],
  )
  const onHover = useCallback(
    (id: string) => {
      if (!touchMenu) setHoverId(id)
    },
    [touchMenu],
  )

  return (
    <div ref={hostRef} className="log-stage" data-testid="log-stage" onMouseLeave={() => setHoverId(null)}>
      {shadow &&
        createPortal(
          <>
            <style>{`${logCss(content)}\n${VIEWER_FONT_CSS}\n${OVERLAY_CSS}`}</style>
            <div className={containerClass(content)}>
              <div className="content">
                {rows.length === 0 && <div className="log-empty">보여 줄 메시지가 없어요. 전체 다듬기 설정을 확인해 보세요.</div>}
                {rows.map(({ message, showHeader }, index) => (
                  <MessageRow
                    key={message.id}
                    content={content}
                    message={message}
                    showHeader={showHeader}
                    active={!touchMenu && hoverId === message.id && editingId !== message.id}
                    editing={editingId === message.id}
                    first={index === 0}
                    last={index === rows.length - 1}
                    speakers={speakers}
                    onHover={onHover}
                    onOpen={onOpen}
                    onAction={onAction}
                    onSaveText={onSaveText}
                    onCancelEdit={onCancelEdit}
                    onChangeSpeaker={onChangeSpeaker}
                    onImage={onImage}
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
