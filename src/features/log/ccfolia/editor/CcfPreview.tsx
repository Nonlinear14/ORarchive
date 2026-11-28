import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../../components/Icon'
import { ensureViewerFonts, VIEWER_FONT_CSS } from '../../../../lib/pretendard'
import { NameEditor, OVERLAY_CSS, SpeakerNames, type MessageAction, type SpeakerOption } from '../../roll20/editor/LogPreview'
import { useOpenUpward } from '../../roll20/editor/useOpenUpward'
import { isCcfEditable, plainEditableToText } from './editing'
import { resolveCcfTypedSpeaker, type CcfMessage, type CcfoliaLogContent } from '../model'
import {
  CCF_LOG_CSS,
  ccfAvatarHtml,
  ccfBodyHtml,
  ccfContainerClass,
  ccfRowClass,
  ccfRowStyle,
  plainHtml,
  type CcfRow,
} from '../render'

/**
 * 코코포리아 로그 미리보기 (Roll20 로그 미리보기와 같은 방식: 그림자 DOM 안에 그리고, 메시지를 그 자리에서 고친다).
 * 코코포리아 글에는 꾸밈이 없어서 글자만 고친다 (굵게 · 기울임 없음). Enter 적용 · Shift+Enter 줄바꿈 · Esc 취소.
 * system · 주사위 · 표 결과 메시지는 내용을 고칠 수 없다 (복제 · 이동 · 삭제는 된다).
 */

const CCF_OVERLAY_CSS = `
.log-msg>.ccf-msg{transition:box-shadow .12s}
.log-msg.is-active>.ccf-msg,.log-msg:focus-visible>.ccf-msg,.log-msg.is-editing>.ccf-msg{box-shadow:inset 0 0 0 2px var(--point)}
.log-msg.is-editable>.ccf-msg{cursor:text}
.log-msg.is-editing .ccf-name{cursor:pointer}
.log-msg.is-editing .ccf-name:hover{outline:2px dashed var(--point);outline-offset:2px}
.msg-inline{display:inline}
.ccf-narr .msg-hint{text-align:center}
`

/** 화자 바꾸기 목록 (코코포리아에는 desc 서술이 없다 — 캐릭터만) */
function CcfSpeakerMenu({
  current,
  options,
  typed,
  onPick,
  onType,
}: {
  current: string
  options: SpeakerOption[]
  typed?: boolean
  onPick(speaker: string): void
  onType(name: string): void
}) {
  const [name, setName] = useState('')
  const keep = (e: MouseEvent) => {
    if (!(e.target as Element).closest('input')) e.preventDefault()
  }
  const menuRef = useRef<HTMLDivElement>(null)
  const up = useOpenUpward(menuRef)
  return (
    <div ref={menuRef} className={up ? 'speaker-menu open-up' : 'speaker-menu'} role="menu" aria-label="캐릭터 바꾸기" onMouseDown={keep}>
      <div className="speaker-title">이 메시지의 캐릭터</div>
      {options.map((o) => (
        <button key={o.speaker} type="button" role="menuitem" aria-current={current === o.speaker} onClick={() => onPick(o.speaker)}>
          {o.avatar ? (
            <span className="sp-av sp-fit">
              <img src={o.avatar} alt="" />
            </span>
          ) : (
            <span className="sp-av">{o.speaker.slice(0, 1)}</span>
          )}
          {o.speaker}
        </button>
      ))}
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

function EditingBody({
  content,
  row,
  speakers,
  touch,
  onSave,
  onCancel,
  onChangeSpeaker,
}: {
  content: CcfoliaLogContent
  row: CcfRow
  speakers: SpeakerOption[]
  touch: boolean
  onSave(text: string): void
  onCancel(): void
  onChangeSpeaker(speaker: string): void
}) {
  const { message } = row
  const ref = useRef<HTMLSpanElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = plainHtml(message.text)
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
    onSave(plainEditableToText(ref.current))
  }
  const cancel = () => {
    done.current = true
    onCancel()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      save()
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      document.execCommand('insertLineBreak')
    } else if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault() // 코코포리아 글에는 꾸밈이 없다
    }
  }
  const pick = (speaker: string) => {
    setMenuOpen(false)
    if (speaker !== message.speaker) onChangeSpeaker(speaker)
    ref.current?.focus()
  }
  const typeName = (typed: string, next: Element | null = null) => {
    setNaming(false)
    setMenuOpen(false)
    const target = resolveCcfTypedSpeaker(content, typed)
    if (target !== null && target !== message.speaker) onChangeSpeaker(target)
    if (next && next !== ref.current && !ref.current?.contains(next)) save()
    else ref.current?.focus()
  }
  const onTextBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Element | null
    if (next?.closest('.name-edit, .speaker-menu')) return
    save()
  }
  // 이름 줄은 그대로 두고 글만 고친다
  const head = ccfBodyHtml(content, { ...row, message: { ...message, text: '' } }).replace(/<span class="ccf-text">.*<\/span>$/, '')

  return (
    <div
      className="ccf-body"
      onMouseDown={(e) => {
        if ((e.target as Element).closest('.ccf-name')) {
          e.preventDefault()
          if (e.detail >= 2) return
          setNaming(false)
          setMenuOpen((v) => !v)
        }
      }}
      onDoubleClick={(e) => {
        if (!(e.target as Element).closest('.ccf-name')) return
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
        onPaste={(e) => {
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
        }}
      />
      <small className="msg-hint">Enter 적용 · Shift+Enter 줄바꿈 · Esc 취소</small>
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
      {menuOpen && <CcfSpeakerMenu current={message.speaker} options={speakers} typed={touch} onPick={pick} onType={(name) => typeName(name)} />}
      {naming && (
        <NameEditor
          initial={message.speaker}
          options={speakers}
          onCommit={typeName}
          onCancel={() => {
            setNaming(false)
            ref.current?.focus()
          }}
        />
      )}
    </div>
  )
}

interface RowProps {
  content: CcfoliaLogContent
  row: CcfRow
  first: boolean
  last: boolean
  active: boolean
  editing: boolean
  speakers: SpeakerOption[]
  touch: boolean
  onHover(id: string): void
  onOpen(row: CcfRow): void
  onAction(action: MessageAction, message: CcfMessage): void
  onSaveText(message: CcfMessage, text: string): void
  onCancelEdit(): void
  onChangeSpeaker(message: CcfMessage, speaker: string): void
}

const CcfMessageRow = memo(function CcfMessageRow({
  content,
  row,
  first,
  last,
  active,
  editing,
  speakers,
  touch,
  onHover,
  onOpen,
  onAction,
  onSaveText,
  onCancelEdit,
  onChangeSpeaker,
}: RowProps) {
  const { message } = row
  const editable = isCcfEditable(row)
  const hasHead = row.showHeader && !!message.speaker && !row.narrator && row.kind.kind !== 'system'
  const cls = ['log-msg', active ? 'is-active' : '', editing ? 'is-editing' : '', editable ? 'is-editable' : '', hasHead ? '' : 'no-head']
    .filter(Boolean)
    .join(' ')
  return (
    <div
      className={cls}
      data-mid={message.id}
      tabIndex={editing ? -1 : 0}
      aria-label={`${message.speaker || '이름 없음'} 메시지`}
      onMouseEnter={() => onHover(message.id)}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onHover(message.id)
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === 'Enter') onOpen(row)
      }}
    >
      <div className={ccfRowClass(content, row, first)} style={styleObject(ccfRowStyle(content, row))} onClick={editing ? undefined : () => onOpen(row)}>
        <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: ccfAvatarHtml(content, row) }} />
        {editing ? (
          <EditingBody
            content={content}
            row={row}
            speakers={speakers}
            touch={touch}
            onSave={(text) => onSaveText(message, text)}
            onCancel={onCancelEdit}
            onChangeSpeaker={(speaker) => onChangeSpeaker(message, speaker)}
          />
        ) : (
          <div className="ccf-body" dangerouslySetInnerHTML={{ __html: ccfBodyHtml(content, row) }} />
        )}
      </div>
      {active && !editing && (
        <div className="msg-actions" role="toolbar" aria-label="메시지 편집">
          <button
            type="button"
            className="msg-act"
            disabled={!editable}
            title={editable ? '수정' : 'system · 주사위 · 표 결과 메시지는 내용을 고칠 수 없어요'}
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

/** "background:#fff;color:#000;" → React style 객체 */
function styleObject(css: string): React.CSSProperties {
  const out: Record<string, string> = {}
  for (const decl of css.split(';').filter(Boolean)) {
    const i = decl.indexOf(':')
    const prop = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    out[prop] = decl.slice(i + 1).trim()
  }
  return out
}

export interface CcfPreviewProps {
  content: CcfoliaLogContent
  rows: CcfRow[]
  editingId: string | null
  touchMenu: boolean
  speakers: SpeakerOption[]
  onAction(action: MessageAction, message: CcfMessage): void
  onSaveText(message: CcfMessage, text: string): void
  onCancelEdit(): void
  onOpenMenu(message: CcfMessage): void
  onChangeSpeaker(message: CcfMessage, speaker: string): void
}

export function CcfPreview({
  content,
  rows,
  editingId,
  touchMenu,
  speakers,
  onAction,
  onSaveText,
  onCancelEdit,
  onOpenMenu,
  onChangeSpeaker,
}: CcfPreviewProps) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const hostRef = useCallback((host: HTMLDivElement | null) => {
    if (host) setShadow(host.shadowRoot ?? host.attachShadow({ mode: 'open' }))
  }, [])
  useEffect(() => ensureViewerFonts(), [])

  const onOpen = useCallback(
    (row: CcfRow) => {
      if (touchMenu) onOpenMenu(row.message)
      else if (isCcfEditable(row)) onAction('edit', row.message)
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
            <style>{`${CCF_LOG_CSS}\n${VIEWER_FONT_CSS}\n${OVERLAY_CSS}\n${CCF_OVERLAY_CSS}`}</style>
            <div className={ccfContainerClass(content)}>
              {rows.length === 0 && <div className="log-empty">보여 줄 메시지가 없어요. 전체 다듬기 · 탭 설정을 확인해 보세요.</div>}
              {rows.map((row, index) => (
                <CcfMessageRow
                  key={row.message.id}
                  content={content}
                  row={row}
                  first={index === 0}
                  last={index === rows.length - 1}
                  touch={touchMenu}
                  active={!touchMenu && hoverId === row.message.id && editingId !== row.message.id}
                  editing={editingId === row.message.id}
                  speakers={speakers}
                  onHover={onHover}
                  onOpen={onOpen}
                  onAction={onAction}
                  onSaveText={onSaveText}
                  onCancelEdit={onCancelEdit}
                  onChangeSpeaker={onChangeSpeaker}
                />
              ))}
            </div>
          </>,
          shadow,
        )}
    </div>
  )
}
