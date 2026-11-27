import { DESC_KEY, WHISPER_KEY, effectiveSetting, isWhisperGroup, type LogMessage, type Roll20LogContent } from './model'

export type ColorKey = 'color' | 'bg' | 'text'
/** 캐릭터 설정 열쇠(화자 · DESC_KEY · WHISPER_KEY)별로 미리보기에 실제로 보이는 색 (#rrggbb) */
export type DetectedColors = Record<string, Partial<Record<ColorKey, string>>>

/** 'rgb(1, 2, 3)' · 'rgba(…, a)' → '#010203'. 투명하거나 읽을 수 없으면 undefined */
export function cssColorToHex(value: string): string | undefined {
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(value.trim())
  if (m) {
    if (m[4] !== undefined) {
      const a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
      if (a === 0) return undefined
    }
    return '#' + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!hex) return undefined
  const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
  return `#${h.toLowerCase()}`
}

/** 메시지가 속한 설정 열쇠: 귓속말 묶음 → 귓속말, 서술 → desc, 나머지 → 화자 (캐릭터 색에는 귓속말 메시지를 세지 않는다) */
export function settingKeyOf(m: LogMessage): string | undefined {
  if (isWhisperGroup(m)) return WHISPER_KEY
  if (m.kind === 'desc' || m.kind === 'emote') return DESC_KEY
  return m.speaker
}

function mostCommon(values: string[]): string | undefined {
  const count = new Map<string, number>()
  let best: string | undefined
  for (const v of values) {
    const n = (count.get(v) ?? 0) + 1
    count.set(v, n)
    if (!best || n > (count.get(best) ?? 0)) best = v
  }
  return best
}

/**
 * 미리보기에 그려진 메시지에서 열쇠별로 불러온 로그의 원래 배경 · 이름 · 대사 색을 읽는다 (Roll20 기본 · 시트 · 확장 프로그램 꾸밈이 반영된 색).
 * 사용자가 고른 색이 칠해진 칸은 세지 않는다.
 * 같은 열쇠의 메시지 색이 다르면 가장 많이 쓰인 색. 저장하지 않는다 — 색 동그라미에 보여 주기만 한다.
 */
export function detectColors(root: ParentNode, content: Roll20LogContent): DetectedColors {
  const byId = new Map(content.messages.map((m) => [m.id, m]))
  const seen: Record<string, Record<ColorKey, string[]>> = {}
  for (const row of root.querySelectorAll<HTMLElement>('.log-msg[data-mid]')) {
    const m = byId.get(row.dataset.mid ?? '')
    const box = row.querySelector<HTMLElement>(':scope > .message')
    if (!m || !box) continue
    const key = settingKeyOf(m)
    if (!key) continue
    const bucket = (seen[key] ??= { color: [], bg: [], text: [] })
    // 사용자가 고른 색이 칠해진 칸은 원래 색이 아니므로 세지 않는다
    const chosen = effectiveSetting(content, m)
    const style = getComputedStyle(box)
    const bg = chosen.bg ? undefined : cssColorToHex(style.backgroundColor)
    const text = chosen.text ? undefined : cssColorToHex(style.color)
    if (bg) bucket.bg.push(bg)
    if (text) bucket.text.push(text)
    const by = chosen.color ? null : box.querySelector<HTMLElement>('.by')
    const name = by ? cssColorToHex(getComputedStyle(by).color) : undefined
    if (name) bucket.color.push(name)
  }
  const out: DetectedColors = {}
  for (const [key, bucket] of Object.entries(seen)) {
    const entry: Partial<Record<ColorKey, string>> = {}
    for (const k of ['color', 'bg', 'text'] as const) {
      const v = mostCommon(bucket[k])
      if (v) entry[k] = v
    }
    out[key] = entry
  }
  return out
}
