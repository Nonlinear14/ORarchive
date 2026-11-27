/**
 * 글상자 안 일부 글자 꾸밈 (2026-11-27).
 *
 * 글상자는 글자 전체 꾸밈(style)에 더해, 글자 조각(run)마다 다른 꾸밈을 가질 수 있다.
 * - 저장: `runs: [{ t: '글자', s?: { color, bold, ... } }]` — s 는 블록 꾸밈과 다른 값만. runs 가 있으면 text 는 runs 를 이은 값.
 * - 모든 조각의 s 가 비면 runs 를 지우고 text 만 둔다.
 * - 블록 전체에 꾸밈을 적용하면(손잡이로 고른 경우) 블록 style 을 바꾸고 조각들의 그 꾸밈은 지운다.
 * - 드래그한 부분에만 적용하면 그 범위의 조각을 나눠 s 를 바꾼다. 가로 · 세로 정렬은 항상 블록 전체.
 */
import type { Json } from '../../lib/database.types'
import { normalizeHex } from './model'
import type { TextBlockStyle } from './layout'

/** 조각마다 바꿀 수 있는 꾸밈 */
export interface RunStyle {
  color?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  size?: number
  letterSpacing?: number
  lineHeight?: number
}
export type RunKey = keyof RunStyle
export const RUN_KEYS: RunKey[] = ['color', 'bold', 'italic', 'underline', 'strike', 'size', 'letterSpacing', 'lineHeight']
export const TOGGLE_KEYS = ['bold', 'italic', 'underline', 'strike'] as const
export type ToggleKey = (typeof TOGGLE_KEYS)[number]

export interface Run {
  t: string
  s?: RunStyle
}

type JsonObject = { [key: string]: Json | undefined }
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const num = (v: Json | undefined, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined

/** 저장된 runs → 보기 (쓸 수 없는 값은 빠진다) */
export function parseRuns(raw: Json | undefined): Run[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const runs: Run[] = []
  for (const r of raw) {
    if (!isObject(r) || typeof r.t !== 'string') continue
    const run: Run = { t: r.t }
    if (isObject(r.s)) {
      const s: RunStyle = {}
      const color = normalizeHex(r.s.color)
      if (color) s.color = color
      for (const k of TOGGLE_KEYS) if (typeof r.s[k] === 'boolean') s[k] = r.s[k] as boolean
      const size = num(r.s.size, 8, 48)
      if (size !== undefined) s.size = Math.round(size)
      const ls = num(r.s.letterSpacing, -5, 40)
      if (ls !== undefined) s.letterSpacing = ls
      const lh = num(r.s.lineHeight, 0.5, 5)
      if (lh !== undefined) s.lineHeight = lh
      if (Object.keys(s).length) run.s = s
    }
    runs.push(run)
  }
  return runs.length ? runs : undefined
}

/** 블록 꾸밈의 그 값 (없으면 기본) */
export function baseValue(style: TextBlockStyle, key: RunKey): RunStyle[RunKey] {
  switch (key) {
    case 'color':
      return style.color
    case 'size':
      return style.size
    case 'letterSpacing':
      return style.letterSpacing ?? 0
    case 'lineHeight':
      return style.lineHeight ?? 1.5
    default:
      return !!style[key]
  }
}

/** 조각의 실제 꾸밈 (블록 꾸밈 + 조각 꾸밈) */
export function effective(style: TextBlockStyle, s: RunStyle | undefined, key: RunKey): RunStyle[RunKey] {
  return s && s[key] !== undefined ? s[key] : baseValue(style, key)
}

/** 블록과 같은 값은 빼고, 같은 꾸밈의 이웃 조각은 합친다. 꾸밈이 하나도 없으면 undefined (text 만) */
export function normalizeRuns(runs: Run[], style: TextBlockStyle): Run[] | undefined {
  const out: Run[] = []
  for (const r of runs) {
    if (!r.t) continue
    const s: RunStyle = {}
    for (const k of RUN_KEYS) {
      const v = r.s?.[k]
      if (v !== undefined && v !== baseValue(style, k)) (s as Record<string, unknown>)[k] = v
    }
    const run: Run = Object.keys(s).length ? { t: r.t, s } : { t: r.t }
    const prev = out[out.length - 1]
    if (prev && JSON.stringify(prev.s ?? {}) === JSON.stringify(run.s ?? {})) prev.t += run.t
    else out.push(run)
  }
  return out.some((r) => r.s) ? out : undefined
}

export const runsText = (runs: Run[]) => runs.map((r) => r.t).join('')

/** start..end 글자 범위로 조각을 나눈다: [앞, 범위 안, 뒤] */
function split(runs: Run[], start: number, end: number): { before: Run[]; inside: Run[]; after: Run[] } {
  const before: Run[] = []
  const inside: Run[] = []
  const after: Run[] = []
  let at = 0
  for (const r of runs) {
    const a = at
    const b = at + r.t.length
    at = b
    const cut = (from: number, to: number) => ({ ...r, t: r.t.slice(from - a, to - a) })
    if (b <= start) before.push(r)
    else if (a >= end) after.push(r)
    else {
      if (a < start) before.push(cut(a, start))
      inside.push(cut(Math.max(a, start), Math.min(b, end)))
      if (b > end) after.push(cut(end, b))
    }
  }
  return { before, inside, after }
}

/** 범위의 꾸밈 값: 범위 첫 글자 기준 (편집 칸에 보여 줄 값) */
export function rangeValue(text: string, runs: Run[] | undefined, style: TextBlockStyle, start: number, end: number, key: RunKey) {
  const { inside } = split(runs ?? [{ t: text }], start, Math.max(end, start + 1))
  return effective(style, inside[0]?.s, key)
}

/** 범위의 모든 글자가 켜져 있나 (굵게 · 기울임 · 밑줄 · 취소선) */
export function rangeAllOn(text: string, runs: Run[] | undefined, style: TextBlockStyle, start: number, end: number, key: ToggleKey) {
  const { inside } = split(runs ?? [{ t: text }], start, end)
  return inside.length > 0 && inside.every((r) => effective(style, r.s, key) === true)
}

/** 범위에만 꾸밈을 적용한 새 조각 (정리 전) */
export function applyToRange(text: string, runs: Run[] | undefined, start: number, end: number, patch: RunStyle): Run[] {
  const { before, inside, after } = split(runs ?? [{ t: text }], start, end)
  return [...before, ...inside.map((r) => ({ t: r.t, s: { ...r.s, ...patch } })), ...after]
}

/** 블록 전체에 적용할 때: 조각들의 그 꾸밈은 지운다 */
export function clearKeys(runs: Run[], keys: RunKey[]): Run[] {
  return runs.map((r) => {
    if (!r.s) return r
    const s = { ...r.s }
    for (const k of keys) delete s[k]
    return Object.keys(s).length ? { t: r.t, s } : { t: r.t }
  })
}
