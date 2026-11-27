import { useLayoutEffect, useRef, type ClipboardEvent, type CSSProperties, type DragEvent } from 'react'
import { runCss } from '../blockStyles'
import type { TextBlock } from '../layout'
import { normalizeRuns, runsText, type Run, type RunStyle } from '../richText'
import { caretOffsets, rangeAt, readRuns, writeRuns } from './richDom'

/**
 * 글상자 글자 칸 (일부 글자 꾸밈 지원). 규칙:
 * React 는 자식을 그리지 않고, 값이 바깥에서 바뀌었을 때만 직접 다시 그린다 (입력 중 커서 유지).
 * 조각(run)마다 <span data-s="{꾸밈}"> 로 그리고, 읽을 때는 글자마다 가장 가까운 span 의 꾸밈을 따른다.
 * 입력은 평문만 (붙여넣기 · 끌어다 놓기도 평문) — 꾸밈은 편집 칸 · 단축키로만.
 */

type EditableMode = 'plaintext-only' | 'true'
let detectedMode: EditableMode | null = null
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

interface RichFieldProps {
  block: TextBlock
  style: CSSProperties
  label: string
  placeholder: string
  onChange(text: string, runs: Run[] | undefined): void
}

export function RichField({ block, style, label, placeholder, onChange }: RichFieldProps) {
  const ref = useRef<HTMLDivElement>(null)
  const key = JSON.stringify([block.text, block.runs ?? null, block.style.underline, block.style.strike])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = readRuns(el)
    const same = runsText(read) === block.text && JSON.stringify(normalizeRuns(read, block.style) ?? null) === JSON.stringify(block.runs ?? null)
    const decoSame = [...el.querySelectorAll<HTMLElement>('[data-s]')].every((span) => {
      const s = JSON.parse(span.dataset.s ?? '{}') as RunStyle
      const want = runCss(block.style, s).textDecoration ?? ''
      return (span.style.textDecoration || '') === want
    })
    if (same && decoSame && el.childNodes.length) return
    if (same && !block.text && !el.firstChild) return
    // 다시 그린다: 고르고 있던 글자 범위는 그대로 둔다 (꾸밈만 바뀐 경우)
    const focused = document.activeElement === el
    const offsets = focused ? caretOffsets(el) : null
    writeRuns(el, block)
    if (offsets) {
      const range = rangeAt(el, offsets.start, offsets.end)
      const sel = window.getSelection()
      if (range && sel) {
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key 가 글자 · 조각 · 밑줄 · 취소선을 모두 담는다
  }, [key])

  const draggingInside = useRef(false)

  function handleInput() {
    const el = ref.current
    if (!el) return
    const runs = readRuns(el)
    const text = runsText(runs)
    if (text === '' && el.firstChild) el.textContent = ''
    onChange(text, normalizeRuns(runs, block.style))
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    if (!text) return
    let inserted: boolean
    try {
      inserted = document.execCommand('insertText', false, text)
    } catch {
      inserted = false
    }
    if (!inserted) {
      const sel = window.getSelection()
      if (sel && sel.rangeCount && event.currentTarget.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        const node = document.createTextNode(text)
        range.insertNode(node)
        range.setStartAfter(node)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
      } else event.currentTarget.append(text)
      handleInput()
    }
  }

  /** 끌어다 놓기도 평문만 (서식 있는 글을 놓으면 화면에만 서식이 남는 것을 막는다) */
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    // 이 칸 안에서 글자를 옮기는 것은 브라우저에 맡긴다 (원래 자리 글자를 지워야 하므로)
    if (draggingInside.current) {
      draggingInside.current = false
      return
    }
    const text = event.dataTransfer.getData('text/plain')
    event.preventDefault()
    if (!text) return
    const doc = document as Document & { caretRangeFromPoint?(x: number, y: number): Range | null }
    const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY)
    const sel = window.getSelection()
    if (range && sel && event.currentTarget.contains(range.startContainer)) {
      sel.removeAllRanges()
      sel.addRange(range)
    }
    event.currentTarget.focus()
    let inserted: boolean
    try {
      inserted = document.execCommand('insertText', false, text)
    } catch {
      inserted = false
    }
    if (!inserted) {
      event.currentTarget.append(text)
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
      aria-label={label}
      aria-multiline
      data-hfield="text"
      data-ph={placeholder}
      onInput={handleInput}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragStart={() => (draggingInside.current = true)}
      onDragEnd={() => (draggingInside.current = false)}
    />
  )
}
