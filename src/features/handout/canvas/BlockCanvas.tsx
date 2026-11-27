import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { ensureViewerFonts } from '../../../lib/pretendard'
import { blockBoxCss, boxedCss, frameCss, imageCss, ruleBoxCss, sealCss, textCss } from '../blockStyles'
import { blockImage, BLOCK_FONT_STACK, isLineBlock, lineSegments, ruleLength, type RuleSpec, MAX_SPLIT, MIN_SPLIT, rowMargins, splitOf, withoutMargins, type Align, type HandoutLayout, type ImageBlock, type LayoutBlock, type LayoutRow, type SpaceBlock, type TextBlock } from '../layout'
import type { DropTarget } from '../layoutEdits'
import type { Css } from '../styles'
import type { FieldDef } from '../templates'
import { EditableField } from './EditableField'
import { displayText } from './editableText'
import './HandoutCanvas.css'

const rs = (css: Css) => css as CSSProperties

const TEXT_DEF: FieldDef = { key: 'text', label: '텍스트 블록', placeholder: '글자를 입력하세요', multiline: true, defaultText: '' }

export interface BlockEditing {
  /** 고른 블록들 (같은 종류) */
  selectedIds: string[]
  /** additive: Ctrl(Mac 은 Cmd)+누르기 — 같은 종류면 선택에 더하거나 빼기 */
  onSelect(id: string | null, additive?: boolean): void
  onText(id: string, text: string): void
  onMove(id: string, target: DropTarget): void
  /** 2열 줄의 왼쪽 너비 % */
  onSplit(rowId: string, split: number): void
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

/** 구분선: 실선 · 점선 · 1점 쇄선 · 2점 쇄선 (롤꾸 복사와 같은 조각) */
export function RuleLine({ rule, contentWidth }: { rule: RuleSpec; contentWidth: number }) {
  const length = ruleLength(rule, contentWidth)
  const thickness = rule.thickness ?? 1
  return (
    <div className="hc-rule" style={rs(ruleBoxCss(length, thickness))} data-style={rule.style ?? 'solid'}>
      {lineSegments(length, rule.style, thickness).map((seg, i) => (
        <span key={i} style={{ flex: 'none', width: seg.w, height: '100%', background: seg.on ? rule.color : 'transparent' }} />
      ))}
    </div>
  )
}

/** 공백: 높이만큼 빈 칸. 편집 화면에서만 점선과 높이 표시 */
function SpaceBody({ block, editing }: { block: SpaceBlock; editing: boolean }) {
  return (
    <div className="hb-space" style={{ height: block.height }}>
      {editing && <span className="hb-space-label">공백 {block.height}px</span>}
    </div>
  )
}

function ImageBody({ block, editing, contentWidth }: { block: ImageBlock; editing: boolean; contentWidth: number }) {
  const image = blockImage(block)
  if (image) return <img src={image.url} alt={image.alt} referrerPolicy="no-referrer" style={rs(imageCss())} draggable={false} />
  if (block.rule) return <RuleLine rule={block.rule} contentWidth={contentWidth} />
  return editing ? <div className="hb-image-empty">이미지 블록 · 오른쪽 디자인 설정에서 이미지 주소를 넣어 주세요</div> : null
}

/** 블록 하나의 칸 (여백·정렬) */
function blockBox(block: LayoutBlock, align: Align): Css {
  if (block.type === 'text') return blockBoxCss(block.style, block.style.align ?? align)
  if (block.type === 'space') return blockBoxCss({}, 'center')
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
  // 구분선은 2열에 놓지 않는다
  const ruleInvolved = el.dataset.line === 'true' || root.querySelector(`[data-block-id="${CSS.escape(dragId)}"]`)?.getAttribute('data-line') === 'true'
  // 한 칸짜리 행(또는 끌고 있는 블록이 같은 행)의 왼쪽/오른쪽 끝 → 2열
  if (!ruleInvolved && (rowCount === 1 || draggedInRow) && x >= r.left && x <= r.right && (fx < 0.22 || fx > 0.78)) {
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
  const inTwo = new Set(layout.rows.filter((r) => r.blocks.length > 1).flatMap((r) => r.blocks.map((b) => b.id)))
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
  // 2열 너비 조절: 끄는 동안은 화면에만, 놓을 때 한 번 저장
  const [resize, setResize] = useState<{ rowId: string; split: number } | null>(null)
  function resizeTo(row: LayoutRow, el: HTMLElement, clientX: number) {
    const rect = el.parentElement!.getBoundingClientRect()
    const split = Math.round(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, ((clientX - rect.left) / Math.max(1, rect.width)) * 100)))
    setResize({ rowId: row.id, split })
  }

  const renderDivider = (row: LayoutRow, split: number): ReactNode =>
    editing ? (
      <div
        className={resize?.rowId === row.id ? 'hb-divider is-active' : 'hb-divider'}
        role="separator"
        aria-orientation="vertical"
        aria-label="2열 너비 조절 (끌어서 조절)"
        aria-valuenow={split}
        aria-valuemin={MIN_SPLIT}
        aria-valuemax={MAX_SPLIT}
        tabIndex={0}
        title="끌어서 너비 조절"
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture?.(event.pointerId)
          event.currentTarget.focus()
          resizeTo(row, event.currentTarget, event.clientX)
        }}
        onPointerMove={(event) => {
          if (resize?.rowId === row.id) resizeTo(row, event.currentTarget, event.clientX)
        }}
        onPointerUp={() => {
          if (resize?.rowId === row.id && resize.split !== splitOf(row)) editing.onSplit(row.id, resize.split)
          setResize(null)
        }}
        onPointerCancel={() => setResize(null)}
      >
        <span aria-hidden="true" />
      </div>
    ) : (
      <div className="hb-divider" aria-hidden="true" />
    )

  /** 블록 칸 스타일. 편집 화면의 구분선은 고르기 쉽게 위아래 12px 영역을 넓히고 그만큼 여백을 줄인다 (보이는 자리는 그대로) */
  const editBox = (block: LayoutBlock): Css => {
    const css = blockBox(inTwo.has(block.id) ? withoutMargins(block) : block, layout.align)
    if (!editing || !isLineBlock(block)) return css
    const HIT = block.type === 'space' ? 8 : 12
    const margins = block.type === 'image' ? block : { marginTop: 0, marginBottom: 0 }
    return {
      ...css,
      paddingTop: `${HIT}px`,
      paddingBottom: `${HIT}px`,
      marginTop: `${(margins.marginTop ?? 0) - HIT}px`,
      marginBottom: `${(margins.marginBottom ?? 0) - HIT}px`,
    }
  }

  const renderBlock = (block: LayoutBlock): ReactNode => {
    const selected = editing?.selectedIds.includes(block.id) ?? false
    const single = selected && editing?.selectedIds.length === 1
    const cls = ['hb-block', editing ? 'is-editable' : '', selected ? 'is-selected' : '', drag?.id === block.id ? 'is-dragging' : '']
      .filter(Boolean)
      .join(' ')
    return (
      <div
        key={block.id}
        className={cls}
        data-block-id={block.id}
        data-block-type={block.type}
        data-line={isLineBlock(block) ? 'true' : undefined}
        data-valign={block.type !== 'space' ? (block.valign ?? 'middle') : undefined}
        style={rs(editBox(block))}
        onPointerDown={
          editing
            ? (event) => {
                if ((event.target as Element).closest('.hb-bubble')) return
                // Ctrl(Cmd)+누르기: 여러 개 고르기 (마우스 · PC 에서만). 글상자도 입력으로 들어가지 않는다
                if ((event.ctrlKey || event.metaKey) && event.pointerType !== 'touch') {
                  event.preventDefault()
                  editing.onSelect(block.id, true)
                  return
                }
                editing.onSelect(block.id)
                // 이미지 · 구분선 · 공백 블록은 블록 자체를 끌어서 옮긴다 (글자 블록은 손잡이로 — 글자 선택과 겹치지 않게)
                if (block.type !== 'text' && single) pending.current = { id: block.id, x: event.clientX, y: event.clientY, pointer: event.pointerId }
              }
            : undefined
        }
        onPointerMove={editing ? moveDrag : undefined}
        onPointerUp={editing ? endDrag : undefined}
        onMouseDown={editing ? (event) => (event.ctrlKey || event.metaKey) && event.preventDefault() : undefined}
        onFocus={editing ? () => !editing.selectedIds.includes(block.id) && editing.onSelect(block.id) : undefined}
      >
        {block.type === 'text' ? (
          <TextBody block={block} editing={editing} />
        ) : block.type === 'space' ? (
          <SpaceBody block={block} editing={!!editing} />
        ) : (
          <ImageBody block={block} editing={!!editing} contentWidth={layout.contentWidth} />
        )}
        {single && (
          <div className="hb-bubble">
            <button
              type="button"
              className="hb-handle"
              aria-label="블록 옮기기"
              title="끌어서 옮기기"
              onPointerDown={(event) => startDrag(block.id, event)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={() => setDrag(null)}
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
      {layout.rows.map((row) => {
        if (row.blocks.length < 2)
          return (
            <div key={row.id} className="hb-row" data-row-id={row.id}>
              {row.blocks.map(renderBlock)}
            </div>
          )
        // 2열: 왼쪽 너비 % · 두 블록은 더 높은 쪽에 맞춘 같은 높이 · 내용은 세로 가운데 · 여백은 줄에 한 번
        const split = resize?.rowId === row.id ? resize.split : splitOf(row)
        const { top, bottom } = rowMargins(row)
        return (
          <div
            key={row.id}
            className="hb-row two"
            data-row-id={row.id}
            style={{ gridTemplateColumns: `minmax(0, ${split}fr) 16px minmax(0, ${100 - split}fr)`, marginTop: top, marginBottom: bottom }}
          >
            {renderBlock(row.blocks[0])}
            {renderDivider(row, split)}
            {renderBlock(row.blocks[1])}
          </div>
        )
      })}
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
