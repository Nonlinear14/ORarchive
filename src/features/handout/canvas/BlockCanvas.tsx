import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { ensureViewerFonts } from '../../../lib/pretendard'
import { blockBoxCss, boxedCss, frameCss, imageCss, ruleCss, sealCss, textCss } from '../blockStyles'
import { blockImage, BLOCK_FONT_STACK, type Align, type HandoutLayout, type ImageBlock, type LayoutBlock, type TextBlock } from '../layout'
import type { DropTarget } from '../layoutEdits'
import type { Css } from '../styles'
import type { FieldDef } from '../templates'
import { EditableField } from './EditableField'
import { displayText } from './editableText'
import './HandoutCanvas.css'

const rs = (css: Css) => css as CSSProperties

const TEXT_DEF: FieldDef = { key: 'text', label: '텍스트 블록', placeholder: '글자를 입력하세요', multiline: true, defaultText: '' }

export interface BlockEditing {
  selectedId: string | null
  onSelect(id: string | null): void
  onText(id: string, text: string): void
  onMove(id: string, target: DropTarget): void
}

function TextBody({ block, editing }: { block: TextBlock; editing?: BlockEditing }) {
  const style = block.style
  let css = textCss(style)
  if (style.boxed) css = { ...css, ...boxedCss(style) }
  const body = editing ? (
    <EditableField def={TEXT_DEF} value={block.text} style={rs(css)} onChange={(text) => editing.onText(block.id, text)} />
  ) : (
    <div className="hc-field" style={rs(css)}>
      {block.text ? displayText(block.text) : ' '}
    </div>
  )
  if (style.seal)
    return (
      <div className="hc-seal" style={{ ...rs(sealCss(style.seal)), margin: '0 auto', boxSizing: 'border-box' }}>
        {body}
      </div>
    )
  if (style.bar)
    return (
      <div className="hc-aside">
        <div className="hc-aside-bar" style={{ width: style.bar.width, background: style.bar.color }} />
        <div style={{ paddingLeft: style.bar.gap, flex: 1, minWidth: 0 }}>{body}</div>
      </div>
    )
  return body
}

function ImageBody({ block, editing }: { block: ImageBlock; editing: boolean }) {
  const image = blockImage(block)
  if (image) return <img src={image.url} alt={image.alt} referrerPolicy="no-referrer" style={rs(imageCss(block))} draggable={false} />
  if (block.rule) return <div className="hc-rule" style={rs(ruleCss(block.rule))} />
  return editing ? <div className="hb-image-empty">이미지 블록 · 오른쪽 디자인 설정에서 이미지 주소를 넣어 주세요</div> : null
}

/** 블록 하나의 칸 (여백·정렬) */
function blockBox(block: LayoutBlock, align: Align): Css {
  if (block.type === 'text') return blockBoxCss(block.style, block.style.align ?? align)
  return { ...blockBoxCss(block, 'center'), lineHeight: '0' }
}

interface Indicator {
  top: number
  left: number
  width: number
  height: number
}

/** 끌고 있는 위치 → 놓을 자리 */
function dropAt(root: HTMLElement, x: number, y: number, dragId: string): { target: DropTarget; mark: Indicator } | null {
  const rootRect = root.getBoundingClientRect()
  const rel = (r: DOMRect, part: Partial<Indicator>): Indicator => ({
    top: (part.top ?? r.top) - rootRect.top,
    left: (part.left ?? r.left) - rootRect.left,
    width: part.width ?? r.width,
    height: part.height ?? 3,
  })
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-block-id]')].filter((el) => el.dataset.blockId !== dragId)
  if (blocks.length === 0) return null
  let el = blocks.find((b) => {
    const r = b.getBoundingClientRect()
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  })
  if (!el) {
    // 블록 사이 빈 곳: 세로로 가장 가까운 블록
    el = blocks.reduce((best, b) => {
      const r = b.getBoundingClientRect()
      const d = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom))
      const br = best.getBoundingClientRect()
      return d < Math.min(Math.abs(y - br.top), Math.abs(y - br.bottom)) ? b : best
    })
  }
  const rowEl = el.closest<HTMLElement>('[data-row-id]')!
  const r = el.getBoundingClientRect()
  const rowRect = rowEl.getBoundingClientRect()
  const rowCount = rowEl.querySelectorAll('[data-block-id]').length
  const draggedInRow = rowEl.querySelector(`[data-block-id="${CSS.escape(dragId)}"]`) !== null
  const fx = (x - r.left) / Math.max(1, r.width)
  // 한 칸짜리 행(또는 끌고 있는 블록이 같은 행)의 왼쪽/오른쪽 끝 → 2열
  if ((rowCount === 1 || draggedInRow) && x >= r.left && x <= r.right && (fx < 0.22 || fx > 0.78)) {
    const side = fx < 0.22 ? 'left' : 'right'
    return {
      target: { kind: 'beside', blockId: el.dataset.blockId!, side },
      mark: rel(r, { left: side === 'left' ? r.left - 2 : r.right - 1, width: 3, height: r.height }),
    }
  }
  const after = y > rowRect.top + rowRect.height / 2
  return {
    target: { kind: after ? 'after' : 'before', rowId: rowEl.dataset.rowId! },
    mark: rel(rowRect, { top: (after ? rowRect.bottom : rowRect.top) - 1 }),
  }
}

interface BlockCanvasProps {
  layout: HandoutLayout
  /** 지정하면 블록을 고르고 · 고치고 · 옮길 수 있다. 없으면 읽기 전용 미리보기 */
  editing?: BlockEditing
  label?: string
}

/** 블록 핸드아웃 캔버스 (roll20 출력과 같은 blockStyles 를 쓴다) */
export function BlockCanvas({ layout, editing, label }: BlockCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; target: DropTarget | null; mark: Indicator | null } | null>(null)
  const pending = useRef<{ id: string; x: number; y: number; pointer: number } | null>(null)

  const allIds = layout.rows.map((r) => r.id)
  // 미리보기·이미지 파일 글꼴: Pretendard 웹폰트
  useEffect(() => ensureViewerFonts(), [])

  function startDrag(id: string, event: PointerEvent<HTMLElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDrag({ id, target: null, mark: null })
  }
  function moveDrag(event: PointerEvent<HTMLElement>) {
    const root = rootRef.current
    if (pending.current && !drag && root) {
      const p = pending.current
      if (Math.hypot(event.clientX - p.x, event.clientY - p.y) > 5) {
        event.currentTarget.setPointerCapture?.(p.pointer)
        setDrag({ id: p.id, target: null, mark: null })
        pending.current = null
      }
      return
    }
    if (!drag || !root) return
    const found = dropAt(root, event.clientX, event.clientY, drag.id)
    setDrag({ id: drag.id, target: found?.target ?? null, mark: found?.mark ?? null })
  }
  function endDrag() {
    pending.current = null
    if (drag?.target && editing) editing.onMove(drag.id, drag.target)
    setDrag(null)
  }
  /** 손잡이에서 ↑ ↓ 로도 옮긴다 (키보드) */
  function keyMove(id: string, event: KeyboardEvent) {
    if (!editing || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    const index = layout.rows.findIndex((r) => r.blocks.some((b) => b.id === id))
    const row = layout.rows[index]
    if (event.key === 'ArrowUp') {
      const prev = row.blocks.length > 1 ? row : layout.rows[index - 1]
      if (prev) editing.onMove(id, { kind: 'before', rowId: prev.id })
    } else {
      const next = row.blocks.length > 1 ? row : layout.rows[index + 1]
      if (next) editing.onMove(id, { kind: 'after', rowId: next.id })
    }
  }

  const renderBlock = (block: LayoutBlock): ReactNode => {
    const selected = editing?.selectedId === block.id
    const cls = ['hb-block', editing ? 'is-editable' : '', selected ? 'is-selected' : '', drag?.id === block.id ? 'is-dragging' : '']
      .filter(Boolean)
      .join(' ')
    return (
      <div
        key={block.id}
        className={cls}
        data-block-id={block.id}
        data-block-type={block.type}
        style={rs(blockBox(block, layout.align))}
        onPointerDown={
          editing
            ? (event) => {
                if ((event.target as Element).closest('.hb-bubble')) return
                editing.onSelect(block.id)
                // 이미지 블록은 블록 자체를 끌어서 옮긴다 (글자 블록은 손잡이로 — 글자 선택과 겹치지 않게)
                if (block.type === 'image' && selected) pending.current = { id: block.id, x: event.clientX, y: event.clientY, pointer: event.pointerId }
              }
            : undefined
        }
        onPointerMove={editing ? moveDrag : undefined}
        onPointerUp={editing ? endDrag : undefined}
        onFocus={editing ? () => editing.selectedId !== block.id && editing.onSelect(block.id) : undefined}
      >
        {block.type === 'text' ? <TextBody block={block} editing={editing} /> : <ImageBody block={block} editing={!!editing} />}
        {selected && (
          <div className="hb-bubble">
            <button
              type="button"
              className="hb-handle"
              aria-label="블록 옮기기"
              title="끌어서 옮기기 (↑ ↓ 키로도 옮겨요)"
              onPointerDown={(event) => startDrag(block.id, event)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(event) => keyMove(block.id, event)}
            >
              <svg viewBox="0 0 10 16" aria-hidden="true">
                {[2, 8].flatMap((cx) => [3, 8, 13].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" fill="currentColor" />))}
              </svg>
            </button>
          </div>
        )}
      </div>
    )
  }

  // 바깥 틀 → 내용 칸
  const content = (
    <>
      {layout.rows.map((row) => (
        <div key={row.id} className={row.blocks.length > 1 ? 'hb-row two' : 'hb-row'} data-row-id={row.id}>
          {row.blocks.map(renderBlock)}
        </div>
      ))}
    </>
  )
  const framed = layout.frames.reduceRight<ReactNode>(
    (inner, frame, index) => (
      <div className={index === 0 ? 'hc-frame' : undefined} style={rs(frameCss(frame, layout.background, index === 0 ? layout.width : undefined))}>
        {inner}
      </div>
    ),
    content,
  )

  return (
    <div
      ref={rootRef}
      className={['hc-canvas', 'hb-canvas', editing ? 'editable' : '', drag ? 'is-dragging' : ''].filter(Boolean).join(' ')}
      style={{ fontFamily: BLOCK_FONT_STACK, textAlign: layout.align }}
      role={editing ? 'group' : undefined}
      aria-label={label}
      data-rows={allIds.length}
    >
      {framed}
      {drag?.mark && <div className="hb-drop" style={drag.mark} aria-hidden="true" />}
    </div>
  )
}
