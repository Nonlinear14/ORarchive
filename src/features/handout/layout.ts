/**
 * 블록 편집 핸드아웃 (2026-11 개편).
 *
 * 핸드아웃의 내용은 행(row) 목록이다. 한 행에는 블록이 1개 또는 2개(2열) 들어간다.
 * - 텍스트 블록: 글자 + 글자 꾸밈(색·굵게·기울임·크기, 템플릿에서 온 정렬·자간·줄 간격·여백·도장/세로 막대/인장 모양)
 * - 이미지 블록: 공개 https 이미지. 템플릿의 구분선도 이미지 블록이다 (주소가 없으면 선을 그린다)
 * 템플릿은 바깥 틀(폭·테두리·여백)과 처음 블록 구성만 정한다. 배경색은 사용자가 고른다.
 *
 * 저장된 content:
 * - `layout.rows` 가 있으면 그것이 내용이다 (블록 편집을 한 번이라도 한 문서).
 * - 없으면(이전 칸 형식 · 새 문서) 템플릿 + 칸(fields)에서 블록을 만들어 보여 준다(deriveRows). 저장된 값은 첫 편집 때까지 그대로.
 *   첫 편집 때 layoutEdits.ts 가 보이던 블록을 그대로 `layout.rows` 에 적는다. 이전 칸(fields)은 지우지 않는다.
 * - 배경색은 `style.background`.
 * 보기(HandoutLayout)는 검사·정규화한 값이고 저장하지 않는다.
 */
import type { Json } from '../../lib/database.types'
import type { DocumentContent } from '../../lib/documents'
import { normalizeHex, renderableImage, validateImageUrl, type HandoutContent } from './model'
import { parseRuns, runsText, type Run } from './richText'
import { resolveHandout, resolveLook, type HandoutLook } from './templates'
import type { Block, TextStyle } from './templates/types'

export type Align = 'left' | 'center' | 'right'

/** 미리보기와 Roll20 복사에 쓰는 글꼴 (Roll20 에서는 Pretendard 가 설치된 컴퓨터에서만 Pretendard 로 보인다) */
export const BLOCK_FONT_STACK =
  "Pretendard, 'Pretendard Variable', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Helvetica Neue', Arial, sans-serif"

export const MIN_LETTER_SPACING = -5
export const MAX_LETTER_SPACING = 20
export const MIN_LINE_HEIGHT = 0.8
export const MAX_LINE_HEIGHT = 3
export const DEFAULT_LINE_HEIGHT = 1.5
export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 48

export interface TextBlockStyle {
  /** px (정수) */
  size: number
  /** '#rrggbb' */
  color: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  align?: Align
  letterSpacing?: number
  lineHeight?: number
  marginTop?: number
  marginBottom?: number
  /** 도장처럼 테두리를 두른 글자 */
  boxed?: boolean
  /** 왼쪽 세로 막대 */
  bar?: { color: string; width: number; gap: number }
  /** 원형 인장 */
  seal?: { ring: string; size: number }
}

/** 세로 정렬 (2열 줄에서 짧은 블록이 놓이는 자리). 없으면 가운데 */
export type VAlign = 'top' | 'middle' | 'bottom'
export const VALIGNS: VAlign[] = ['top', 'middle', 'bottom']

export interface TextBlock {
  id: string
  type: 'text'
  text: string
  style: TextBlockStyle
  /** 일부 글자 꾸밈 (richText.ts). 있으면 text 는 runs 를 이은 값 */
  runs?: Run[]
  valign?: VAlign
}

export interface ImageBlock {
  id: string
  type: 'image'
  valign?: VAlign
  /** 검사한 공개 https 주소. 없으면 구분선(rule)을 그리거나, 편집 화면에서만 빈 자리를 보여 준다 */
  url?: string
  alt?: string
  maxWidth: number
  marginTop?: number
  marginBottom?: number
  /** 이미지가 없을 때 그리는 구분선 */
  rule?: RuleSpec
}

export type LineStyle = 'solid' | 'dotted' | 'dashdot' | 'dashdotdot'
export const LINE_STYLES: LineStyle[] = ['solid', 'dotted', 'dashdot', 'dashdotdot']
export const MIN_RULE_LENGTH = 10
export const MIN_THICKNESS = 1
export const MAX_THICKNESS = 10

/** 구분선: 길이는 length(px)가 있으면 그것, 없으면 내용 칸 너비의 widthPercent */
export interface RuleSpec {
  widthPercent: number
  color: string
  length?: number
  /** px, 없으면 1 */
  thickness?: number
  /** 없으면 실선 */
  style?: LineStyle
}

/** 공백: 블록 사이 간격 (높이만) */
export interface SpaceBlock {
  id: string
  type: 'space'
  /** px (정수) */
  height: number
}
export const MIN_SPACE = 1
export const MAX_SPACE = 200
export const DEFAULT_SPACE = 16

export type LayoutBlock = TextBlock | ImageBlock | SpaceBlock

/** 같은 종류 (여러 개 고르기 · 편집 옵션): 글상자 · 이미지 · 구분선 · 공백 */
export const blockKind = (block: LayoutBlock): 'text' | 'image' | 'rule' | 'space' =>
  block.type === 'image' && block.rule && !block.url ? 'rule' : block.type

/** 2열에 놓을 수 없는 블록: 구분선 · 공백 */
export const isLineBlock = (block: LayoutBlock) => block.type === 'space' || (block.type === 'image' && !!block.rule && !block.url)

export interface LayoutRow {
  id: string
  /** 1개 또는 2개 */
  blocks: LayoutBlock[]
  /** 2열일 때 왼쪽 블록 너비 % (20–80, 정수). 없으면 50 */
  split?: number
}

export const MIN_SPLIT = 20
export const MAX_SPLIT = 80
export const splitOf = (row: LayoutRow) => row.split ?? 50

/** 2열 줄의 위아래 여백: 두 블록 가운데 큰 값을 줄에 한 번 */
export function rowMargins(row: LayoutRow): { top: number; bottom: number } {
  const of = (b: LayoutBlock): { marginTop?: number; marginBottom?: number } => (b.type === 'text' ? b.style : b.type === 'image' ? b : {})
  return {
    top: Math.max(...row.blocks.map((b) => of(b).marginTop ?? 0)),
    bottom: Math.max(...row.blocks.map((b) => of(b).marginBottom ?? 0)),
  }
}

/** 2열 칸 안에서는 블록의 위아래 여백을 쓰지 않는다 (줄에 한 번) */
export function withoutMargins<T extends LayoutBlock>(block: T): T {
  if (block.type === 'text') return { ...block, style: { ...block.style, marginTop: 0, marginBottom: 0 } }
  if (block.type === 'space') return block
  return { ...block, marginTop: 0, marginBottom: 0 }
}

export interface FrameBox {
  padding: string
}

export interface HandoutLayout {
  width: number
  background: string
  /** 바깥에서 안쪽으로 (마지막이 내용 칸) */
  frames: FrameBox[]
  align: Align
  rows: LayoutRow[]
  /** 새 텍스트 블록의 기본 모양 (본문) */
  bodyStyle: TextBlockStyle
  /** 내용 칸 너비(px): 폭에서 틀의 좌우 여백을 뺀 값 (구분선 최대 길이) */
  contentWidth: number
}

/** 그릴 구분선 길이(px) */
export function ruleLength(rule: RuleSpec, contentWidth: number): number {
  const raw = rule.length ?? Math.round((rule.widthPercent / 100) * contentWidth)
  return Math.round(Math.min(contentWidth, Math.max(MIN_RULE_LENGTH, raw)))
}

/** 선 모양 → 칠할 조각(on)과 빈 조각(off)의 폭(px) 목록. 길이를 채우고 마지막 조각은 자른다 */
export function lineSegments(length: number, style: LineStyle = 'solid', thickness = 1): { on: boolean; w: number }[] {
  if (style === 'solid') return [{ on: true, w: length }]
  const dash = Math.max(6, thickness * 4)
  const gap = Math.max(3, thickness * 2)
  const dot = thickness
  const unit =
    style === 'dotted'
      ? [dot, gap]
      : style === 'dashdot'
        ? [dash, gap, dot, gap]
        : [dash, gap, dot, gap, dot, gap]
  const out: { on: boolean; w: number }[] = []
  let used = 0
  for (let i = 0; used < length; i++) {
    const w = Math.min(unit[i % unit.length], length - used)
    out.push({ on: i % 2 === 0, w })
    used += w
  }
  return out
}

function paddingLR(padding: string): number {
  const v = padding.trim().split(/\s+/).map((p) => parseFloat(p) || 0)
  const right = v.length === 1 ? v[0] : v[1]
  const left = v.length === 4 ? v[3] : right
  return left + right
}

type JsonObject = { [key: string]: Json | undefined }
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)

function textStyleOf(style: TextStyle, look: HandoutLook, align: Align): TextBlockStyle {
  const out: TextBlockStyle = { size: style.size, color: look.colors[style.color], align: style.align ?? align }
  if (style.bold) out.bold = true
  if (style.italic) out.italic = true
  if (style.letterSpacing) out.letterSpacing = style.letterSpacing
  if (style.lineHeight) out.lineHeight = style.lineHeight
  if (style.marginTop) out.marginTop = style.marginTop
  if (style.marginBottom) out.marginBottom = style.marginBottom
  if (style.boxed) out.boxed = true
  return out
}

interface Frames {
  frames: FrameBox[]
  align: Align
  children: Block[]
}

/** 템플릿 블록 트리 → 바깥 틀(frames) + 내용 칸의 블록들 */
function splitFrames(look: HandoutLook): Frames {
  const frames: FrameBox[] = []
  let blocks = look.template.blocks
  let align: Align = 'center'
  for (;;) {
    const frame = blocks.length === 1 && blocks[0].kind === 'frame' ? blocks[0] : null
    if (!frame) break
    align = frame.align ?? align
    const box: FrameBox = { padding: frame.padding }
    const inner = frame.children
    // 안에 상자가 여러 개면(조사 기록: 머리칸 + 본문) 하나의 내용 칸으로 합친다. 머리칸 아래 선은 구분선 블록으로
    if (inner.length > 1 && inner.every((b) => b.kind === 'frame')) {
      const last = inner[inner.length - 1] as Extract<Block, { kind: 'frame' }>
      box.padding = frame.padding === '0' ? last.padding : frame.padding
      align = last.align ?? align
      frames.push(box)
      const children: Block[] = []
      for (const child of inner as Extract<Block, { kind: 'frame' }>[]) {
        children.push(...child.children)
        if (child.borderBottom)
          children.push({ kind: 'rule', widthPercent: 100, color: child.borderBottom.color, marginTop: 14, marginBottom: 18 })
      }
      return { frames, align, children }
    }
    frames.push(box)
    blocks = inner
  }
  return { frames, align, children: blocks }
}

/** 템플릿 + 칸 글(보기) → 블록 행. id 는 고정(f-칸 · s-순번 · r-순번 · img)이라 저장 전에도 선택이 유지된다 */
export function deriveRows(content: HandoutContent, look: HandoutLook, children: Block[], align: Align): LayoutRow[] {
  const rows: LayoutRow[] = []
  let n = 0
  const fieldText = (key: string) => content.fields[key] ?? ''
  const optionalEmpty = (key: string) => look.template.fields.find((f) => f.key === key)?.optional === true && !fieldText(key)

  const toBlock = (block: Block, inherited: Align): LayoutBlock | null => {
    switch (block.kind) {
      case 'field':
        if (optionalEmpty(block.field)) return null
        return { id: `f-${block.field}`, type: 'text', text: fieldText(block.field), style: textStyleOf(block.style, look, inherited) }
      case 'text':
        return { id: `s-${n++}`, type: 'text', text: block.text, style: textStyleOf(block.style, look, inherited) }
      case 'rule': {
        const out: ImageBlock = { id: `r-${n++}`, type: 'image', maxWidth: 1000, rule: { widthPercent: block.widthPercent, color: look.colors[block.color] } }
        if (block.marginTop) out.marginTop = block.marginTop
        if (block.marginBottom) out.marginBottom = block.marginBottom
        return out
      }
      case 'image': {
        const image = renderableImage(content.image)
        if (!image) return null
        return { id: 'img', type: 'image', url: image.url, alt: image.alt, maxWidth: block.maxWidth, marginBottom: block.marginBottom }
      }
      case 'seal': {
        const style = textStyleOf(block.style, look, 'center')
        style.seal = { ring: look.colors[block.ring], size: block.size }
        return { id: `f-${block.field}`, type: 'text', text: fieldText(block.field), style }
      }
      default:
        return null
    }
  }
  const push = (...blocks: (LayoutBlock | null)[]) => {
    const list = blocks.filter((b): b is LayoutBlock => b !== null)
    if (list.length) rows.push({ id: `row-${list[0].id}`, blocks: list })
  }

  const walk = (blocks: Block[], inherited: Align) => {
    for (const block of blocks) {
      switch (block.kind) {
        case 'frame':
          walk(block.children, block.align ?? inherited)
          if (block.borderBottom)
            push({ id: `r-${n++}`, type: 'image', maxWidth: 1000, rule: { widthPercent: 100, color: look.colors[block.borderBottom.color] } })
          break
        case 'split':
          push(...block.left.map((b) => toBlock(b, 'left')).slice(0, 1), ...block.right.map((b) => toBlock(b, 'right')).slice(0, 1))
          break
        case 'meta':
          for (const row of block.rows) {
            const label: TextBlock = {
              id: `m-${row.field}`,
              type: 'text',
              text: row.label,
              style: { ...textStyleOf(block.style, look, 'left'), color: look.colors[block.labelColor], align: 'left' },
            }
            const value: TextBlock = { id: `f-${row.field}`, type: 'text', text: fieldText(row.field), style: textStyleOf(block.style, look, 'left') }
            push(label, value)
          }
          break
        case 'aside':
          for (const child of block.children) {
            const b = toBlock(child, 'left')
            if (b?.type === 'text') b.style.bar = { color: look.colors[block.bar], width: block.barWidth, gap: block.gap }
            push(b)
          }
          break
        default:
          push(toBlock(block, inherited))
      }
    }
  }
  walk(children, align)
  return withSpacers(rows)
}

/**
 * 템플릿의 블록 사이 간격(위아래 여백)을 공백 블록으로 바꾼다. 맞닿은 여백은 화면에서처럼 큰 쪽 하나.
 * 블록 자체의 여백은 0 이 되어 블록 높이 = 내용 높이.
 */
function withSpacers(rows: LayoutRow[]): LayoutRow[] {
  const out: LayoutRow[] = []
  let pending = 0
  let n = 0
  rows.forEach((row) => {
    const { top, bottom } = rowMargins(row)
    const gap = Math.max(pending, top)
    if (gap > 0) out.push({ id: `row-sp-${n}`, blocks: [{ id: `sp-${n++}`, type: 'space', height: Math.round(gap) }] })
    out.push({ ...row, blocks: row.blocks.map((b) => withoutMargins(b)) })
    pending = bottom
  })
  if (pending > 0) out.push({ id: `row-sp-${n}`, blocks: [{ id: `sp-${n}`, type: 'space', height: Math.round(pending) }] })
  return out
}

// ── 저장된 layout 읽기 (보기만 만든다 — 쓸 수 없는 값은 보기에서 빠지고, 저장된 값은 그대로) ──

const num = (value: Json | undefined, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined
const ALIGNS: Align[] = ['left', 'center', 'right']

function parseTextStyle(raw: Json | undefined, fallback: TextBlockStyle): TextBlockStyle {
  const s = isObject(raw) ? raw : {}
  const style: TextBlockStyle = {
    size: Math.round(num(s.size, MIN_FONT_SIZE, MAX_FONT_SIZE) ?? fallback.size),
    color: normalizeHex(s.color) ?? fallback.color,
  }
  if (s.bold === true) style.bold = true
  if (s.italic === true) style.italic = true
  if (s.underline === true) style.underline = true
  if (s.strike === true) style.strike = true
  if (typeof s.align === 'string' && (ALIGNS as string[]).includes(s.align)) style.align = s.align as Align
  const ls = num(s.letterSpacing, -5, 40)
  if (ls) style.letterSpacing = ls
  const lh = num(s.lineHeight, 0.5, 5)
  if (lh) style.lineHeight = lh
  const mt = num(s.marginTop, 0, 400)
  if (mt) style.marginTop = mt
  const mb = num(s.marginBottom, 0, 400)
  if (mb) style.marginBottom = mb
  if (s.boxed === true) style.boxed = true
  if (isObject(s.bar)) {
    const color = normalizeHex(s.bar.color)
    if (color) style.bar = { color, width: num(s.bar.width, 1, 20) ?? 3, gap: num(s.bar.gap, 0, 60) ?? 16 }
  }
  if (isObject(s.seal)) {
    const ring = normalizeHex(s.seal.ring)
    if (ring) style.seal = { ring, size: num(s.seal.size, 30, 300) ?? 76 }
  }
  return style
}

function parseBlock(raw: Json | undefined, fallback: TextBlockStyle): LayoutBlock | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id) return null
  if (raw.type === 'space') {
    return { id: raw.id, type: 'space', height: Math.round(num(raw.height, MIN_SPACE, MAX_SPACE) ?? DEFAULT_SPACE) }
  }
  if (raw.type === 'text') {
    const block: TextBlock = { id: raw.id, type: 'text', text: typeof raw.text === 'string' ? raw.text : '', style: parseTextStyle(raw.style, fallback) }
    const runs = parseRuns(raw.runs)
    if (runs) {
      block.runs = runs
      block.text = runsText(runs)
    }
    if (typeof raw.valign === 'string' && (VALIGNS as string[]).includes(raw.valign)) block.valign = raw.valign as VAlign
    return block
  }
  if (raw.type === 'image') {
    const block: ImageBlock = { id: raw.id, type: 'image', maxWidth: num(raw.maxWidth, 20, 2000) ?? 380 }
    if (typeof raw.valign === 'string' && (VALIGNS as string[]).includes(raw.valign)) block.valign = raw.valign as VAlign
    if (typeof raw.url === 'string') {
      const check = validateImageUrl(raw.url)
      if (check.ok) block.url = check.url
    }
    if (typeof raw.alt === 'string') block.alt = raw.alt
    const mt = num(raw.marginTop, 0, 400)
    if (mt) block.marginTop = mt
    const mb = num(raw.marginBottom, 0, 400)
    if (mb) block.marginBottom = mb
    if (isObject(raw.rule)) {
      const color = normalizeHex(raw.rule.color)
      if (color) {
        const rule: RuleSpec = { widthPercent: num(raw.rule.widthPercent, 1, 100) ?? 100, color }
        const length = num(raw.rule.length, MIN_RULE_LENGTH, 4000)
        if (length !== undefined) rule.length = Math.round(length)
        const thickness = num(raw.rule.thickness, MIN_THICKNESS, MAX_THICKNESS)
        if (thickness !== undefined) rule.thickness = Math.round(thickness)
        if (typeof raw.rule.style === 'string' && (LINE_STYLES as string[]).includes(raw.rule.style)) rule.style = raw.rule.style as LineStyle
        block.rule = rule
      }
    }
    return block
  }
  return null
}

export function storedRows(stored: DocumentContent): Json[] | null {
  const layout = (stored as JsonObject).layout
  return isObject(layout) && Array.isArray(layout.rows) ? layout.rows : null
}

function parseRows(raw: Json[], fallback: TextBlockStyle): LayoutRow[] {
  const rows: LayoutRow[] = []
  const seen = new Set<string>()
  raw.forEach((row, index) => {
    if (!isObject(row) || !Array.isArray(row.blocks)) return
    const blocks = row.blocks
      .map((b) => parseBlock(b, fallback))
      .filter((b): b is LayoutBlock => b !== null && !seen.has(b.id))
      .slice(0, 2)
    blocks.forEach((b) => seen.add(b.id))
    if (!blocks.length) return
    const out: LayoutRow = { id: typeof row.id === 'string' && row.id ? row.id : `row-${index}`, blocks }
    const split = num(row.split, MIN_SPLIT, MAX_SPLIT)
    if (split !== undefined && blocks.length === 2) out.split = Math.round(split)
    rows.push(out)
  })
  return rows
}

/** 새 텍스트 블록의 기본 모양: 템플릿 본문 칸 */
function bodyStyleOf(rows: LayoutRow[], look: HandoutLook): TextBlockStyle {
  const body = rows.flatMap((r) => r.blocks).find((b) => b.id === 'f-body')
  if (body?.type === 'text') {
    const style: TextBlockStyle = { size: body.style.size, color: body.style.color, align: body.style.align }
    if (body.style.lineHeight) style.lineHeight = body.style.lineHeight
    return style
  }
  return { size: 14, color: look.colors.text, lineHeight: 1.8 }
}

/** 저장된 content → 화면·출력에 쓰는 블록 보기 */
export function resolveLayout(stored: DocumentContent): HandoutLayout {
  return layoutOf(resolveHandout(stored), storedRows(stored), (stored as JsonObject).style)
}

/** 보기(HandoutContent) + 저장된 행 → 블록 보기 (저장된 행이 없으면 템플릿에서 만든다) */
export function layoutOf(content: HandoutContent, raw: Json[] | null = null, rawStyle?: Json): HandoutLayout {
  const look = resolveLook(content)
  const { frames, align, children } = splitFrames(look)
  const derived = deriveRows(content, look, children, align)
  const bodyStyle = bodyStyleOf(derived, look)
  const rows = raw ? parseRows(raw, bodyStyle) : derived
  const background = (isObject(rawStyle) ? normalizeHex(rawStyle.background) : null) ?? look.colors.paper
  const contentWidth = Math.max(
    MIN_RULE_LENGTH,
    look.template.width - frames.reduce((sum, f) => sum + paddingLR(f.padding), 0),
  )
  return { width: look.template.width, background, frames, align, rows, bodyStyle, contentWidth }
}

export function findBlock(layout: HandoutLayout, id: string | null): LayoutBlock | null {
  if (!id) return null
  for (const row of layout.rows) for (const block of row.blocks) if (block.id === id) return block
  return null
}

/** 그릴 이미지 주소 (검사한 https 만) */
export function blockImage(block: ImageBlock): { url: string; alt: string } | null {
  return block.url && validateImageUrl(block.url).ok ? { url: block.url, alt: block.alt ?? '' } : null
}

/** 블록 → 평문 (클립보드 text/plain · 삭제 복구 화면) */
export function layoutText(layout: HandoutLayout): string {
  return layout.rows
    .map((row) =>
      row.blocks
        .map((b) => (b.type === 'text' ? b.text : b.type === 'image' && blockImage(b) ? `[이미지: ${b.alt || b.url}]` : ''))
        .filter(Boolean)
        .join('    '),
    )
    .filter(Boolean)
    .join('\n\n')
}
