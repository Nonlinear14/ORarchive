import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useOpenUpward } from './useOpenUpward'
import { revealSelected, SELECT_CSS, useClearOnOutside, useMessageDrag, type DropTarget } from './messageSelect'
import { Icon } from '../../../../components/Icon'
import { isEditable, resolveTypedSpeaker, type LogMessage, type Roll20LogContent } from '../model'
import { containerClass, displayName, logCss, messageClass, messageInnerHtml, messageStyle, textToHtml, visibleMessages } from '../render'
import { editableHtmlToText } from './inlineText'
import { detectColors, type DetectedColors } from '../detectColors'
import { lockInlineParts } from '../styledText'
import { ensureViewerFonts, VIEWER_FONT_CSS } from '../../../../lib/pretendard'

/**
 * 로그 미리보기. 불러온 Roll20·시트·확장 프로그램 CSS 가 앱 화면을 바꾸지 못하도록 그림자 DOM 안에 그린다.
 * (CSS 변수는 그림자 경계를 넘어 상속되므로 앱의 글꼴·색 토큰은 그대로 쓸 수 있다)
 * 메시지는 그 자리에서 바로 고친다 (contentEditable). Ctrl+B 굵게 · Ctrl+I 기울임 · Enter 적용 · Shift+Enter 줄바꿈 · Esc 취소.
 */

export type MessageAction = 'edit' | 'duplicate' | 'up' | 'down' | 'insert' | 'remove'

/** 화자 바꾸기 대상: 캐릭터 이름, 또는 desc 서술(null) */
export type SpeakerTarget = string | null

/** 미리보기 위 편집 표시 (코코포리아 로그 미리보기도 같이 쓴다) */
export const OVERLAY_CSS = `
:host{display:block}
::selection{background:#8a8a8a;color:currentColor}
.log-msg{position:relative;outline:none}
.log-msg>.message{transition:box-shadow .12s}
.log-msg.is-selected>.message{box-shadow:inset 0 0 0 2px var(--point)}
.log-msg:focus-visible>.message{box-shadow:inset 0 0 0 2px var(--point)}
.log-msg.is-editing>.message{cursor:text}
.log-msg.is-editing>.message{box-shadow:inset 0 0 0 2px var(--point)}
.log-msg.is-editing .avatar,.log-msg.is-editing .by{cursor:pointer}
.log-msg.is-editing .avatar:hover img,.log-msg.is-editing .by:hover{outline:2px dashed var(--point);outline-offset:2px}
.msg-inline{outline:none;white-space:pre-wrap;min-width:2em;display:inline}
.msg-inline:empty::before{content:'대사를 입력하세요';color:#999;font-style:italic}
.msg-hint{display:block;margin:4px 0 0;font:500 10.5px var(--font, sans-serif);color:var(--text-muted);font-style:normal;text-align:left}
.msg-actions{position:absolute;right:8px;top:-14px;display:flex;gap:2px;background:var(--text);border-radius:var(--radius);padding:3px;z-index:3;box-shadow:none}
.msg-act{display:inline-flex;align-items:center;justify-content:center;border:0;background:none;color:var(--bg);border-radius:var(--radius);padding:6px;cursor:pointer}
.msg-act:hover:not(:disabled){background:color-mix(in srgb, var(--bg) 22%, transparent)}
.msg-act:focus-visible{outline:2px solid var(--point)}
.msg-act:disabled{opacity:.35;cursor:not-allowed}
.msg-act.danger{color:var(--danger)}
.msg-act .ico{width:15px;height:15px}
.speaker-btn{position:absolute;left:4px;top:4px;z-index:4;display:none;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:var(--radius);background:var(--text);color:var(--bg);cursor:pointer}
.log-msg.is-editing.no-head:hover .speaker-btn,.speaker-btn:focus-visible,.speaker-btn[aria-expanded="true"]{display:inline-flex}
.speaker-btn .ico{width:15px;height:15px}
.speaker-menu{position:absolute;left:8px;top:32px;z-index:6;min-width:200px;max-height:260px;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:none;padding:5px;font:600 12.5px var(--font, sans-serif);text-align:left;font-style:normal}
.name-edit{position:absolute;left:8px;top:28px;z-index:6;display:flex;gap:6px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:none;padding:6px;font:600 12.5px var(--font, sans-serif);font-style:normal}
.name-edit input,.speaker-typed input{font:600 13px var(--font, sans-serif);border:1px solid var(--line-strong);border-radius:var(--radius);padding:6px 8px;min-width:0;width:180px;color:var(--text);background:var(--surface)}
.name-edit small{color:var(--text-muted);font-size:10.5px;font-weight:600;white-space:nowrap}
.speaker-typed{display:flex;gap:6px;padding:8px 6px 4px;border-top:1px solid var(--line);margin-top:4px}
.speaker-menu .speaker-typed input{flex:1;width:auto;min-width:0}
.speaker-menu .speaker-typed button{width:auto;flex:none;background:var(--text);color:var(--bg);justify-content:center;padding:7px 12px}
.speaker-menu .speaker-typed button:hover,.speaker-menu .speaker-typed button:focus-visible{background:var(--text-muted)}
.speaker-menu .speaker-typed button:disabled{opacity:.45;cursor:default}
.speaker-menu{max-width:calc(100% - 16px)}
.speaker-menu.open-up{top:auto;bottom:calc(100% - 6px)}
.speaker-menu .speaker-title{padding:6px 8px 5px;font-size:10.5px;color:var(--text-muted);font-weight:700}
.speaker-menu button{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;padding:7px 8px;border-radius:var(--radius);color:var(--text);font:inherit;cursor:pointer;text-align:left}
.speaker-menu button:hover,.speaker-menu button:focus-visible{background:var(--surface-3);outline:none}
.speaker-menu button[aria-current="true"]{color:var(--point)}
.speaker-menu .sp-fit{overflow:hidden;display:flex;justify-content:center}
.speaker-menu .sp-fit img{height:100%;width:auto;max-width:none;flex:none;display:block}
.speaker-menu img,.speaker-menu .sp-av{width:20px;height:20px;border-radius:4px;object-fit:contain;flex:none;background:var(--surface-3);display:grid;place-items:center;font-size:9px;color:var(--text-muted)}
.msg-flag{position:absolute;right:10px;top:9px;font:600 10px var(--font, sans-serif);color:var(--danger);background:var(--danger-weak);border:1px solid var(--danger-weak);border-radius:var(--radius);padding:3px 7px;font-style:normal}
.log-msg.is-hidden-kind>.message{opacity:.6}
.log-msg .message img{cursor:pointer}
.log-msg .message img:hover{outline:2px solid var(--point);outline-offset:2px}
.log-msg .avatar img{cursor:inherit}
.log-msg:not(.is-editing) .avatar img:hover{outline:none}
.log-empty{padding:40px 16px;text-align:center;color:var(--text-muted);font:13px var(--font, sans-serif)}
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
  typed,
  onPick,
  onType,
}: {
  current: SpeakerTarget
  options: SpeakerOption[]
  content: Roll20LogContent
  /** 휴대폰: 목록 아래에 이름 직접 입력 칸 */
  typed?: boolean
  onPick(target: SpeakerTarget): void
  onType(name: string): void
}) {
  const [name, setName] = useState('')
  // 메뉴를 눌러도 글자 칸의 포커스가 빠지지 않게 (빠지면 수정이 끝나 버린다). 이름 입력 칸은 예외
  const keep = (e: MouseEvent) => {
    if (!(e.target as Element).closest('input')) e.preventDefault()
  }
  const menuRef = useRef<HTMLDivElement>(null)
  const up = useOpenUpward(menuRef)
  return (
    <div ref={menuRef} className={up ? 'speaker-menu open-up' : 'speaker-menu'} role="menu" aria-label="캐릭터 바꾸기" onMouseDown={keep}>
      <div className="speaker-title">이 메시지의 캐릭터</div>
      <button type="button" role="menuitem" aria-current={current === null} onClick={() => onPick(null)}>
        <span className="sp-av">desc</span> desc 서술
      </button>
      {options.map((o) => {
        const avatar = content.characters[o.speaker]?.avatar || o.avatar
        return (
          <button key={o.speaker} type="button" role="menuitem" aria-current={current === o.speaker} onClick={() => onPick(o.speaker)}>
            {avatar ? (
              <span className="sp-av sp-fit">
                <img src={avatar} alt="" />
              </span>
            ) : (
              <span className="sp-av">{o.speaker.slice(0, 1)}</span>
            )}
            {displayName(content, o.speaker)}
          </button>
        )
      })}
      {typed && (
        <form
          className="speaker-typed"
          onSubmit={(e) => {
            e.preventDefault()
            onType(name)
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 직접 입력"
            aria-label="이름 직접 입력"
            maxLength={80}
            list="speaker-names"
            enterKeyHint="done"
          />
          <button type="submit" disabled={!name.trim()}>
            적용
          </button>
          <SpeakerNames options={options} />
        </form>
      )}
    </div>
  )
}

/** 이름 입력 칸의 자동 완성 목록 (기존 캐릭터 이름) */
export function SpeakerNames({ options }: { options: SpeakerOption[] }) {
  return (
    <datalist id="speaker-names">
      {options.map((o) => (
        <option key={o.speaker} value={o.speaker} />
      ))}
    </datalist>
  )
}

/** 이름을 더블 클릭했을 때: 이름을 글자로 직접 고친다 (Enter · 칸 밖 누르기 적용, Esc 취소) */
export function NameEditor({
  initial,
  options,
  onCommit,
  onCancel,
}: {
  initial: string
  options: SpeakerOption[]
  onCommit(name: string, next: Element | null): void
  onCancel(): void
}) {
  const [name, setName] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const closed = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <div className="name-edit" role="group" aria-label="이름 직접 고치기">
      <input
        ref={ref}
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="캐릭터 이름"
        maxLength={80}
        list="speaker-names"
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter') {
            e.preventDefault()
            closed.current = true
            onCommit(name, null)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            closed.current = true
            onCancel()
          }
        }}
        onBlur={(e) => {
          if (closed.current) return
          closed.current = true
          // 칸 밖을 눌러 나갔다 (포커스를 받지 않는 곳이면 body 로 본다)
          onCommit(name, (e.relatedTarget as Element | null) ?? document.body)
        }}
      />
      <small>Enter 적용 · Esc 취소</small>
      <SpeakerNames options={options} />
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
  touch,
  onSave,
  onCancel,
  onChangeSpeaker,
  onImage,
}: {
  content: Roll20LogContent
  message: LogMessage
  showHeader: boolean
  speakers: SpeakerOption[]
  /** 휴대폰: 캐릭터 바꾸기 목록에 이름 직접 입력 칸 */
  touch: boolean
  onSave(value: MessageEdit): void
  onCancel(): void
  onChangeSpeaker(target: SpeakerTarget): void
  onImage(index: number, src: string): void
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [naming, setNaming] = useState(false)
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
  /** 직접 입력한 이름: 기존 캐릭터(대소문자 무시)면 그 캐릭터로, 아니면 새 캐릭터로. 이 메시지만 바꾼다 */
  const typeName = (typed: string, next: Element | null = null) => {
    setNaming(false)
    setMenuOpen(false)
    const target = resolveTypedSpeaker(content, typed)
    if (target !== null && target !== current) onChangeSpeaker(target)
    // 이름 칸에서 다른 곳을 눌러 나갔으면 메시지 수정도 마친다
    if (next && next !== ref.current && !ref.current?.contains(next)) save()
    else ref.current?.focus()
  }
  /** 글자 칸에서 포커스가 이름 입력 칸으로 옮겨 갈 때는 수정을 끝내지 않는다 */
  const onTextBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Element | null
    if (next?.closest('.name-edit, .speaker-menu')) return
    save()
  }

  return (
    <>
      <div
        ref={styleRef}
        className={messageClass(content, message)}
        onMouseDown={(e) => {
          // 수정 중에 저널·이름을 누르면 캐릭터 바꾸기 (두 번째 누르기는 더블 클릭으로 이름 고치기)
          if ((e.target as Element).closest('.avatar, .by')) {
            e.preventDefault()
            if (e.detail >= 2) return
            setNaming(false)
            setMenuOpen((v) => !v)
          }
        }}
        onDoubleClick={(e) => {
          // 이름을 더블 클릭하면 이름을 글자로 직접 고친다
          if (!(e.target as Element).closest('.by')) return
          e.preventDefault()
          setMenuOpen(false)
          setNaming(true)
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
          onBlur={onTextBlur}
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
      {menuOpen && <SpeakerMenu current={current} options={speakers} content={content} typed={touch} onPick={pick} onType={(name) => typeName(name)} />}
      {naming && (
        <NameEditor
          initial={message.speaker ? displayName(content, message.speaker) : ''}
          options={speakers}
          onCommit={typeName}
          onCancel={() => {
            setNaming(false)
            ref.current?.focus()
          }}
        />
      )}
    </>
  )
}

/** 수정 칸에서 고친 결과: 글자 메시지는 text, 꾸민 글자 메시지는 html */
export type MessageEdit = { text: string } | { html: string }

interface RowProps {
  content: Roll20LogContent
  message: LogMessage
  showHeader: boolean
  /** 선택된 메시지 (PC: 편집 버튼 줄이 붙고 끌어서 옮길 수 있다) */
  selected: boolean
  editing: boolean
  speakers: SpeakerOption[]
  /** 휴대폰 (캐릭터 바꾸기 목록에 이름 직접 입력 칸) */
  touch: boolean
  /** 한 번 누르기: PC 는 선택, 휴대폰은 메뉴 */
  onPress(message: LogMessage): void
  /** 더블 클릭(PC): 수정 */
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
  touch,
  onPress,
  onOpen,
  onImage,
}: {
  content: Roll20LogContent
  message: LogMessage
  showHeader: boolean
  touch: boolean
  onPress(): void
  onOpen(): void
  onImage(index: number, src: string): void
}) {
  const styleRef = useImportantStyle(messageStyle(content, message))
  /** 로그 속 이미지(저널 제외)면 이미지 바꾸기 창을 열고 true */
  const openImage = (e: React.MouseEvent<HTMLDivElement>) => {
    const img = (e.target as Element).closest('img')
    if (!img || img.closest('.avatar')) return false
    const images = [...e.currentTarget.querySelectorAll('img')].filter((el) => !el.closest('.avatar'))
    onImage(images.indexOf(img), img.getAttribute('src') ?? '')
    return true
  }
  return (
    <div
      ref={styleRef}
      className={messageClass(content, message)}
      // PC: 한 번 누르면 선택, 더블 클릭하면 수정(이미지는 이미지 바꾸기). 휴대폰은 예전대로 (이미지는 바로 바꾸기, 그 밖은 메뉴)
      onClick={(e) => {
        if (touch && openImage(e)) return
        onPress()
      }}
      onDoubleClick={(e) => {
        if (touch) return
        e.preventDefault()
        if (openImage(e)) return
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
  selected,
  editing,
  speakers,
  touch,
  onPress,
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
    selected ? 'is-selected' : '',
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
      aria-selected={selected}
    >
      {editing ? (
        <EditingMessage
          content={content}
          message={message}
          showHeader={showHeader}
          speakers={speakers}
          touch={touch}
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
          touch={touch}
          onPress={() => onPress(message)}
          onOpen={() => onOpen(message)}
          onImage={(index, src) => onImage(message, index, src)}
        />
      )}
      {message.kind === 'hidden' && <span className="msg-flag">숨긴 메시지 · 전체 다듬기에서 지울 수 있어요</span>}
      {selected && !editing && (
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
  /** 선택한 메시지 (PC) */
  selectedId: string | null
  onSelect(id: string | null): void
  /** 끌어서 옮기기 (PC, 선택된 메시지) */
  onDragMove(id: string, drop: DropTarget): void
  /** 바뀔 때마다 선택한 메시지를 화면에 보이게 하고 포커스를 되돌린다 (옮긴 뒤) */
  revealKey: number
  onChangeSpeaker(message: LogMessage, target: SpeakerTarget): void
  /** 로그 속 이미지를 눌렀을 때 (이미지 바꾸기) */
  onImage(message: LogMessage, index: number, src: string): void
  /** 그려진 메시지에서 읽은 원래 색 (캐릭터 색 동그라미에 보여 준다) */
  onDetectColors?(colors: DetectedColors): void
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
  selectedId,
  onSelect,
  onDragMove,
  revealKey,
  onChangeSpeaker,
  onImage,
  onDetectColors,
}: LogPreviewProps) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null)
  const clear = useCallback(() => onSelect(null), [onSelect])
  useClearOnOutside(shadow, selectedId, clear)
  const { dropLine, onMouseDown } = useMessageDrag({ shadow, selectedId, enabled: !touchMenu && !editingId, onMove: onDragMove })
  useEffect(() => {
    if (revealKey) revealSelected(shadow, selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 옮긴 뒤(revealKey)에만
  }, [revealKey])
  const hostRef = useCallback((host: HTMLDivElement | null) => {
    if (host) setShadow(host.shadowRoot ?? host.attachShadow({ mode: 'open' }))
  }, [])
  useEffect(() => ensureViewerFonts(), [])

  // 그린 뒤 원래 색을 읽는다 (편집이 이어질 때 매번 읽지 않게 잠깐 기다린다)
  const detectRef = useRef(onDetectColors)
  useEffect(() => {
    detectRef.current = onDetectColors
  })
  useEffect(() => {
    if (!shadow) return
    const timer = window.setTimeout(() => detectRef.current?.(detectColors(shadow, content)), 120)
    return () => window.clearTimeout(timer)
  }, [shadow, content])

  const rows = visibleMessages(content)
  const onOpen = useCallback(
    (message: LogMessage) => {
      if (touchMenu) onOpenMenu(message)
      else if (isEditable(message)) onAction('edit', message)
    },
    [touchMenu, onOpenMenu, onAction],
  )
  const onPress = useCallback(
    (message: LogMessage) => {
      if (touchMenu) onOpenMenu(message)
      else onSelect(message.id)
    },
    [touchMenu, onOpenMenu, onSelect],
  )

  return (
    <div
      ref={hostRef}
      className="log-stage"
      data-testid="log-stage"
      onMouseDown={onMouseDown}
      onClick={(e) => {
        // 메시지가 아닌 빈 곳을 누르면 선택 풀기
        if (!e.nativeEvent.composedPath().some((el) => el instanceof HTMLElement && el.matches('.log-msg'))) onSelect(null)
      }}
    >
      {shadow &&
        createPortal(
          <>
            <style>{`${logCss(content)}\n${VIEWER_FONT_CSS}\n${OVERLAY_CSS}\n${SELECT_CSS}`}</style>
            {dropLine && <div className="drop-line" style={{ top: dropLine.top, left: dropLine.left, width: dropLine.width }} />}
            <div className={containerClass(content)}>
              <div className="content">
                {rows.length === 0 && <div className="log-empty">보여 줄 메시지가 없어요. 전체 다듬기 설정을 확인해 보세요.</div>}
                {rows.map(({ message, showHeader }) => (
                  <MessageRow
                    key={message.id}
                    content={content}
                    message={message}
                    showHeader={showHeader}
                    touch={touchMenu}
                    selected={!touchMenu && selectedId === message.id}
                    editing={editingId === message.id}
                    speakers={speakers}
                    onPress={onPress}
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
