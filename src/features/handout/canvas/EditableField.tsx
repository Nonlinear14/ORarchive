import { useLayoutEffect, useRef, type ClipboardEvent, type CSSProperties, type KeyboardEvent } from 'react'
import type { FieldDef } from '../templates'
import { readValue, singleLineInput, withoutLineBreaks, writeValue } from './editableText'

type EditableMode = 'plaintext-only' | 'true'

let detectedMode: EditableMode | null = null

/** plaintext-only 를 지원하는 브라우저면 그것을, 아니면 'true' (붙여넣기는 아래에서 평문으로 바꾼다) */
function editableMode(): EditableMode {
  if (detectedMode) return detectedMode
  try {
    const probe = document.createElement('div')
    probe.contentEditable = 'plaintext-only'
    detectedMode = probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'
  } catch {
    detectedMode = 'true'
  }
  return detectedMode
}

function focusEnd(el: HTMLElement) {
  el.focus()
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

/** 글자 offset 자리에 커서를 둔다 (writeValue 로 다시 그린 칸: 글자 노드 하나뿐) */
function placeCaret(el: HTMLElement, offset: number) {
  const selection = window.getSelection()
  const text = el.firstChild
  if (!selection || !(text instanceof Text)) return
  const range = document.createRange()
  range.setStart(text, Math.min(offset, text.length))
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

/** execCommand('insertText') 를 못 쓰는 환경에서 커서 위치에 평문을 넣는다 */
function insertAtCaret(el: HTMLElement, text: string) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !el.contains(selection.anchorNode)) {
    el.append(text)
    return
  }
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

interface EditableFieldProps {
  def: FieldDef
  value: string
  style: CSSProperties
  onChange(value: string): void
}

/**
 * 캔버스에서 바로 고치는 글자 칸.
 *
 * React 는 이 요소의 자식을 그리지 않는다(children 없음). 입력할 때마다 다시 그리면 커서가 사라지기 때문이다.
 * 글자는 처음 그릴 때와, 바깥에서 값이 바뀌었을 때(충돌 해결로 서버 버전을 불러옴 등)만 직접 넣는다.
 * 사용자가 입력한 값은 onChange → 같은 값으로 돌아오므로 화면을 건드리지 않는다.
 */
export function EditableField({ def, value, style, onChange }: EditableFieldProps) {
  const ref = useRef<HTMLDivElement>(null)
  /** 지금 화면이 보여 주는 값 (마지막으로 그렸거나 읽은 값) — 한 줄 칸에서 이번 입력으로 새로 들어온 글을 가려내는 기준 */
  const shown = useRef(value)
  const multiline = def.multiline === true

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // 화면이 이미 이 값을 보여 주고 있으면 건드리지 않는다 (입력 중 커서 유지 · 줄바꿈만 있는 값도 그대로 둔다)
    if (readValue(el) !== value) writeValue(el, value)
    // 값이 정말 '' 일 때만 남은 자리 표시(<br> 등)까지 비워 placeholder(:empty) 를 보여 준다
    else if (value === '' && el.firstChild) el.textContent = ''
    shown.current = value
  }, [value])

  function handleInput() {
    const el = ref.current
    if (!el) return
    const read = readValue(el)
    // 한 줄 칸: 이번 입력으로 새로 들어온 글의 줄바꿈만 뺀다. 원래 있던 글자는 줄바꿈까지 그대로 (화면에 보이던 그대로 저장)
    const single = multiline ? null : singleLineInput(shown.current, read)
    const next = single ? single.value : read
    // 다 지웠으면 남은 자리 표시(<br> · \n · <div><br></div>)까지 비워 placeholder(:empty) 가 보이게 한다.
    // Enter 로 만든 빈 줄은 빈 값이 아니다 — next 가 '' 인 것은 글자도 빈 줄도 없는 칸뿐이다
    if (next === '' && el.firstChild) el.textContent = ''
    // 한 줄 칸에 새 줄바꿈이 들어왔으면(끌어다 놓기 · IME 등) 화면도 저장할 값으로 맞춘다 — 화면 = 저장 값.
    // 커서는 끝이 아니라 넣은 글 바로 뒤에 둔다
    else if (single && next !== read) {
      writeValue(el, next)
      if (document.activeElement === el) placeCaret(el, single.caret)
    }
    shown.current = next
    onChange(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' || multiline || event.nativeEvent.isComposing) return
    // 한 줄 칸: Enter 는 줄바꿈 대신 다음 칸으로
    event.preventDefault()
    const root = event.currentTarget.closest('.hc-canvas')
    if (!root) return
    const all = Array.from(root.querySelectorAll<HTMLElement>('[data-hfield]'))
    const next = all[all.indexOf(event.currentTarget) + 1]
    if (next) focusEnd(next)
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    // 서식 없이 평문만 넣는다. 한 줄 칸은 붙여 넣는 글의 줄바꿈만 뺀다 (칸에 원래 있던 글자는 그대로)
    event.preventDefault()
    let text = event.clipboardData.getData('text/plain')
    if (!multiline) text = withoutLineBreaks(text)
    if (!text) return
    let inserted: boolean
    try {
      inserted = document.execCommand('insertText', false, text)
    } catch {
      inserted = false
    }
    if (!inserted) {
      insertAtCaret(event.currentTarget, text)
      handleInput()
    }
  }

  return (
    <div
      ref={ref}
      className="hc-field"
      style={style}
      contentEditable={editableMode()}
      suppressContentEditableWarning
      spellCheck={false}
      tabIndex={0}
      role="textbox"
      aria-label={def.label}
      aria-multiline={multiline}
      data-hfield={def.key}
      data-ph={def.placeholder}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  )
}
