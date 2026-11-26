/**
 * 블록 편집 연산. 저장된 content 에 적용해 고친 경로만 바뀐 새 content 를 돌려준다 (edits.ts 와 같은 원칙).
 *
 * 블록 편집을 처음 할 때(저장된 layout.rows 가 없을 때)는 화면에 보이던 블록(템플릿 + 칸에서 만든 것)을 그대로
 * layout.rows 에 적은 뒤 고친다 — 보이던 글과 모양은 한 글자도 바뀌지 않는다. 이전 칸(fields)·템플릿·테마는 지우지 않는다.
 * 그다음부터는 저장된 행을 그대로 두고, 고친 블록의 고친 값만 바꾼다.
 */
import type { Json } from '../../lib/database.types'
import type { DocumentContent } from '../../lib/documents'
import { HANDOUT_CONTENT_VERSION, isStructuredHandout, serializeHandout } from './model'
import { MAX_SPLIT, MIN_SPLIT, resolveLayout, storedRows, type LayoutBlock, type RuleSpec, type TextBlockStyle } from './layout'
import { createHandoutContent, resolveHandout } from './templates'

export type LayoutEdit = (stored: DocumentContent) => DocumentContent

type JsonObject = { [key: string]: Json | undefined }
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)

/** 저장된 블록이 구분선인가 (이미지 주소 없이 선만) */
const isRuleJson = (block: Json | null | undefined) =>
  isObject(block) && (block.type === 'space' || (block.type === 'image' && isObject(block.rule) && !block.url))

let seq = 0
export const newBlockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`

/** 보이던 블록을 저장 형식으로 (undefined 는 빼고) */
const toJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json

/** 편집할 바탕: 저장된 행이 없으면 보이던 블록을 적는다 */
function withRows(stored: DocumentContent): { base: JsonObject; rows: JsonObject[] } {
  const base: JsonObject = isObject(stored) ? { ...stored } : {}
  const existing = storedRows(stored)
  if (existing) return { base, rows: existing.filter(isObject).map((r) => ({ ...r })) }
  if (!isStructuredHandout(base)) {
    // 이전 형식(`{}` · `{ text }`): 보이던 템플릿을 적어 둔다 (틀을 그릴 템플릿)
    if (!Object.hasOwn(base, 'v')) base.v = HANDOUT_CONTENT_VERSION
    if (!Object.hasOwn(base, 'templateId')) base.templateId = resolveHandout(stored).templateId
  }
  const rows = resolveLayout(stored).rows.map((row) => toJson(row) as JsonObject)
  return { base, rows }
}

function save(base: JsonObject, rows: JsonObject[]): DocumentContent {
  const layout = isObject(base.layout) ? base.layout : {}
  return { ...base, layout: { ...layout, rows: rows.filter((r) => Array.isArray(r.blocks) && r.blocks.length > 0) } }
}

function locate(rows: JsonObject[], id: string): { row: number; index: number } | null {
  for (let row = 0; row < rows.length; row++) {
    const blocks = rows[row].blocks
    if (!Array.isArray(blocks)) continue
    const index = blocks.findIndex((b) => isObject(b) && b.id === id)
    if (index >= 0) return { row, index }
  }
  return null
}

/** 블록 하나를 고친다 (patch 의 키만 바꾼다. undefined 값은 그 키를 뺀다) */
function patchBlock(id: string, patch: (block: JsonObject) => JsonObject): LayoutEdit {
  return (stored) => {
    const { base, rows } = withRows(stored)
    const at = locate(rows, id)
    if (!at) return stored
    const blocks = [...(rows[at.row].blocks as Json[])]
    blocks[at.index] = patch({ ...(blocks[at.index] as JsonObject) })
    rows[at.row] = { ...rows[at.row], blocks }
    return save(base, rows)
  }
}

function assign(target: JsonObject, patch: Record<string, unknown>): JsonObject {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete target[key]
    else target[key] = toJson(value)
  }
  return target
}

export const setBlockText = (id: string, text: string): LayoutEdit =>
  patchBlock(id, (block) => (block.text === text ? block : { ...block, text }))

/** 글자 꾸밈: 색·굵게·기울임·크기 */
export type TextStylePatch = Partial<Pick<TextBlockStyle, 'color' | 'bold' | 'italic' | 'size' | 'align'>>
export const setBlockStyle = (id: string, patch: TextStylePatch): LayoutEdit =>
  patchBlock(id, (block) => ({ ...block, style: assign({ ...(isObject(block.style) ? block.style : {}) }, patch) }))

/** 이미지 블록의 주소·대체 텍스트 (url 은 validateImageUrl 로 검사한 값, undefined 면 이미지 빼기) */
export const setBlockImage = (id: string, patch: { url?: string; alt?: string; rule?: undefined }): LayoutEdit =>
  patchBlock(id, (block) => assign(block, patch))

/** 공백 높이 (px) */
export const setSpaceHeight = (id: string, height: number): LayoutEdit => patchBlock(id, (block) => (block.height === height ? block : { ...block, height }))

/** 구분선 색 (rule.color) */
export const setBlockRule = (id: string, patch: Partial<Pick<RuleSpec, 'color' | 'length' | 'thickness' | 'style'>>): LayoutEdit =>
  patchBlock(id, (block) => ({ ...block, rule: assign({ ...(isObject(block.rule) ? block.rule : {}) }, patch) }))

function patchRow(rowId: string, patch: (row: JsonObject) => JsonObject): LayoutEdit {
  return (stored) => {
    const { base, rows } = withRows(stored)
    const index = rows.findIndex((r) => r.id === rowId)
    if (index < 0) return stored
    const next = patch({ ...rows[index] })
    if (JSON.stringify(next) === JSON.stringify(rows[index])) return stored
    rows[index] = next
    return save(base, rows)
  }
}

/** 2열 줄의 왼쪽 블록 너비 % (MIN_SPLIT–MAX_SPLIT 정수) */
export const setRowSplit = (rowId: string, split: number): LayoutEdit =>
  patchRow(rowId, (row) => ({ ...row, split: Math.round(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, split))) }))

/** 2열 줄의 왼쪽 · 오른쪽 바꾸기 (각 블록의 너비는 따라간다) */
export const swapRow = (rowId: string): LayoutEdit =>
  patchRow(rowId, (row) => {
    const blocks = Array.isArray(row.blocks) ? row.blocks : []
    if (blocks.length !== 2) return row
    const next: JsonObject = { ...row, blocks: [blocks[1], blocks[0]] }
    if (typeof row.split === 'number') next.split = 100 - row.split
    return next
  })

/** 초기화: 템플릿 처음 모양(기본 문구 · 기본 블록)으로. 문서 제목은 그대로 */
export function resetToTemplate(stored: DocumentContent): DocumentContent {
  return serializeHandout(createHandoutContent(resolveHandout(stored).templateId))
}

/** 배경색 (style.background). undefined 면 템플릿 기본 색으로 (그 키를 뺀다) */
export function setBackground(stored: DocumentContent, color: string | undefined): DocumentContent {
  const base: JsonObject = isObject(stored) ? stored : {}
  const style: JsonObject = { ...(isObject(base.style) ? base.style : {}) }
  if (color === undefined) {
    if (!Object.hasOwn(style, 'background')) return stored
    delete style.background
  } else style.background = color
  return { ...base, style }
}

/** 블록 추가: afterId 블록이 있는 행 바로 아래 새 행으로 (없으면 맨 아래) */
export const addBlock =
  (block: LayoutBlock, afterId: string | null): LayoutEdit =>
  (stored) => {
    const { base, rows } = withRows(stored)
    const at = afterId ? locate(rows, afterId) : null
    const row = { id: `row-${block.id}`, blocks: [toJson(block)] }
    rows.splice(at ? at.row + 1 : rows.length, 0, row)
    return save(base, rows)
  }

export const removeBlock =
  (id: string): LayoutEdit =>
  (stored) => {
    const { base, rows } = withRows(stored)
    const at = locate(rows, id)
    if (!at) return stored
    rows[at.row] = { ...rows[at.row], blocks: (rows[at.row].blocks as Json[]).filter((_, i) => i !== at.index) }
    return save(base, rows)
  }

/** 옮길 자리: 어떤 행의 위/아래 새 행, 또는 어떤 블록의 왼쪽/오른쪽(2열) */
export type DropTarget = { kind: 'before' | 'after'; rowId: string } | { kind: 'beside'; blockId: string; side: 'left' | 'right' }

export const moveBlock =
  (id: string, target: DropTarget): LayoutEdit =>
  (stored) => {
    const { base, rows } = withRows(stored)
    const from = locate(rows, id)
    if (!from) return stored
    const moving = (rows[from.row].blocks as Json[])[from.index]
    if (target.kind === 'beside' && target.blockId === id) return stored
    // 구분선 · 공백은 2열에 놓지 않는다 (옆에 놓거나, 그 옆에 놓기)
    if (target.kind === 'beside') {
      const to = locate(rows, target.blockId)
      const other = to ? (rows[to.row].blocks as Json[])[to.index] : null
      if (isRuleJson(moving) || isRuleJson(other)) return stored
    }
    // 빼낸다 (빈 행은 save 가 지운다 — 자리 계산을 위해 여기서는 남겨 둔다)
    rows[from.row] = { ...rows[from.row], blocks: (rows[from.row].blocks as Json[]).filter((_, i) => i !== from.index) }
    if (target.kind === 'beside') {
      const to = locate(rows, target.blockId)
      if (!to) return stored
      const blocks = [...(rows[to.row].blocks as Json[])]
      if (blocks.length >= 2) return stored
      blocks.splice(target.side === 'left' ? to.index : to.index + 1, 0, moving)
      rows[to.row] = { ...rows[to.row], blocks }
    } else {
      const index = rows.findIndex((r) => r.id === target.rowId)
      if (index < 0) return stored
      const movingId = isObject(moving) && typeof moving.id === 'string' ? moving.id : newBlockId()
      rows.splice(target.kind === 'before' ? index : index + 1, 0, { id: `row-${movingId}-${newBlockId()}`, blocks: [moving] })
    }
    return save(base, rows)
  }
