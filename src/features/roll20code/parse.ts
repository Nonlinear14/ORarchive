/**
 * 롤꾸 코드 읽기 · 고치기 · 그리기.
 *
 * Roll20 채팅은 [글자](주소) 를 링크로 바꾸는데, 주소 자리에 `#" style="…"` 를 넣으면 따옴표가 닫히지 않은 채로
 * style 속성이 링크에 붙는다 — 이것이 롤꾸다. 이 파일은 그 문법을 Roll20 과 같은 방식으로 읽는다:
 * - 한 줄 = 메시지 하나. 맨 앞 /desc · /em 은 desc 서술 · 감정 표현
 * - [글자] 바로 뒤 ( 부터 첫 " 까지가 주소, 이어서 style=" 부터 닫는 ) 까지가 스타일
 *   (스타일 안의 linear-gradient( … ) 같은 괄호는 짝을 맞춰 넘긴다)
 * - ?{질문|기본값} · ?{질문|선택1|선택2,값2} 은 Roll20 매크로 질문 (미리보기에서는 예시 답으로 채운다)
 * 고치기는 모두 원본 코드 문자열의 해당 위치만 바꾼다 (나머지는 한 글자도 바꾸지 않는다).
 */

export type LineKind = 'desc' | 'emote' | 'general'

/** 원본 코드 안의 [start, end) 위치 */
export interface Span {
  start: number
  end: number
}

export interface TextPart extends Span {
  kind: 'text'
  text: string
}

export interface LinkPart extends Span {
  kind: 'link'
  /** [ ] 안 글자 */
  text: string
  /** 글자의 원본 위치 ([ 와 ] 사이) */
  textSpan: Span
  href: string
  /** style="…" 안쪽 (없으면 일반 링크) */
  style?: string
  styleSpan?: Span
}

export type Part = TextPart | LinkPart

export interface CodeLine extends Span {
  kind: LineKind
  /** /desc · /em 머리 (없으면 빈 글자) */
  prefix: string
  parts: Part[]
}

export interface Query extends Span {
  /** ?{…} 전체 */
  raw: string
  label: string
  /** 선택지 (이름, 값). 하나뿐이면 기본값 */
  options: { name: string; value: string }[]
}

export interface ColorUse extends Span {
  /** 원본 표기 (#abc · #AABBCC · white …) */
  raw: string
  /** 쓰인 CSS 속성 (color, background-color, box-shadow …) */
  property: string
}

/** 같은 색(정규화한 #RRGGBB)끼리 묶은 것 — 하나를 바꾸면 함께 바뀐다 */
export interface ColorGroup {
  hex: string
  uses: ColorUse[]
}

const NAMED_COLORS: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  red: '#FF0000',
  blue: '#0000FF',
  green: '#008000',
  yellow: '#FFFF00',
  orange: '#FFA500',
  purple: '#800080',
  pink: '#FFC0CB',
  gray: '#808080',
  grey: '#808080',
}

export function normalizeColor(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (NAMED_COLORS[v]) return NAMED_COLORS[v]
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v)
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return `#${h.toUpperCase()}`
}

/** [글자] 뒤의 (주소" style="스타일) 를 Roll20 처럼 읽는다. 맞지 않으면 null */
function readLinkTail(src: string, open: number): { href: string; style?: string; styleSpan?: Span; end: number } | null {
  if (src[open] !== '(') return null
  const quote = src.indexOf('"', open + 1)
  const close = src.indexOf(')', open + 1)
  // 따옴표 없는 보통 링크: [글자](주소)
  if (quote === -1 || (close !== -1 && close < quote)) {
    if (close === -1) return null
    const href = src.slice(open + 1, close)
    if (href.includes('\n')) return null
    return { href: href.trim(), end: close + 1 }
  }
  const href = src.slice(open + 1, quote)
  if (href.includes('\n')) return null
  let i = quote + 1
  while (i < src.length && /[ \t]/.test(src[i])) i++
  if (!src.startsWith('style="', i)) return null
  const styleStart = i + 'style="'.length
  let depth = 0
  for (let j = styleStart; j < src.length; j++) {
    const ch = src[j]
    if (ch === '\n') return { href: href.trim(), style: src.slice(styleStart, j), styleSpan: { start: styleStart, end: j }, end: j }
    if (ch === '(') depth++
    else if (ch === ')') {
      if (depth > 0) {
        depth--
        // 스타일 끝의 linear-gradient(…) 처럼 함수 괄호가 곧 링크의 끝이기도 한 경우
        const rest = src.slice(j + 1)
        if (depth === 0 && (/^[ \t]*\[/.test(rest) || /^[ \t]*(\n|$)/.test(rest))) {
          return { href: href.trim(), style: src.slice(styleStart, j + 1), styleSpan: { start: styleStart, end: j + 1 }, end: j + 1 }
        }
        continue
      }
      return { href: href.trim(), style: src.slice(styleStart, j), styleSpan: { start: styleStart, end: j }, end: j + 1 }
    }
  }
  // 닫는 ) 가 없으면 줄 끝까지가 스타일
  return { href: href.trim(), style: src.slice(styleStart), styleSpan: { start: styleStart, end: src.length }, end: src.length }
}

function parseParts(src: string, from: number, to: number): Part[] {
  const parts: Part[] = []
  let i = from
  let textStart = from
  const pushText = (end: number) => {
    if (end > textStart) parts.push({ kind: 'text', text: src.slice(textStart, end), start: textStart, end })
  }
  while (i < to) {
    const open = src.indexOf('[', i)
    if (open === -1 || open >= to) break
    const close = src.indexOf(']', open + 1)
    if (close === -1 || close >= to) break
    const tail = readLinkTail(src, close + 1)
    if (!tail || tail.end > to) {
      i = open + 1
      continue
    }
    pushText(open)
    parts.push({
      kind: 'link',
      text: src.slice(open + 1, close),
      textSpan: { start: open + 1, end: close },
      href: tail.href,
      ...(tail.style !== undefined ? { style: tail.style, styleSpan: tail.styleSpan } : {}),
      start: open,
      end: tail.end,
    })
    i = tail.end
    textStart = tail.end
  }
  pushText(to)
  return parts
}

export function parseCode(code: string): CodeLine[] {
  const lines: CodeLine[] = []
  let start = 0
  for (const raw of code.split('\n')) {
    const end = start + raw.length
    const m = /^\s*(\/desc|\/em)(\s+|$)/i.exec(raw)
    const kind: LineKind = m ? (m[1].toLowerCase() === '/desc' ? 'desc' : 'emote') : 'general'
    const bodyStart = start + (m ? m[0].length : 0)
    if (raw.trim()) lines.push({ kind, prefix: m ? m[1] : '', parts: parseParts(code, bodyStart, end), start, end })
    start = end + 1
  }
  return lines
}

/** 글자 칸: 롤꾸 링크마다 하나 */
export function textSlots(code: string): LinkPart[] {
  return parseCode(code).flatMap((l) => l.parts.filter((p): p is LinkPart => p.kind === 'link'))
}

/** Roll20 매크로 질문 ?{…} (중첩 없음, 첫 } 에서 닫힌다) */
export function findQueries(text: string, offset = 0): Query[] {
  const out: Query[] = []
  const re = /\?\{([^{}]*)\}/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const [label, ...rest] = m[1].split('|')
    const options = rest.map((opt) => {
      const comma = opt.indexOf(',')
      return comma === -1 ? { name: opt, value: opt } : { name: opt.slice(0, comma), value: opt.slice(comma + 1) }
    })
    out.push({ raw: m[0], label: label.trim(), options, start: offset + m.index, end: offset + m.index + m[0].length })
  }
  return out
}

/** 질문의 기본 예시 답: 선택지의 첫 값 → 없으면 질문 이름 (레퍼런스처럼 미리보기에 질문 이름을 보여 준다) */
export function defaultAnswer(q: Query): string {
  const first = q.options[0]
  if (first && first.value.trim()) return first.value
  return q.label
}

/** 코드 속 ?{…} 를 예시 답으로 바꾼다 (같은 질문 이름은 같은 답 — Roll20 도 같은 질문은 한 번만 묻는다) */
export function fillQueries(code: string, answers: Record<string, string>): string {
  let out = ''
  let last = 0
  for (const q of findQueries(code)) {
    out += code.slice(last, q.start) + (answers[q.label] ?? defaultAnswer(q))
    last = q.end
  }
  return out + code.slice(last)
}

/** 질문 목록 (같은 이름은 하나로) */
export function uniqueQueries(code: string): Query[] {
  const seen = new Map<string, Query>()
  for (const q of findQueries(code)) if (!seen.has(q.label)) seen.set(q.label, q)
  return [...seen.values()]
}

/** 스타일 속 색 (url(…) 안은 건너뛴다) */
export function colorGroups(code: string): ColorGroup[] {
  const groups = new Map<string, ColorGroup>()
  for (const line of parseCode(code))
    for (const part of line.parts) {
      if (part.kind !== 'link' || !part.style || !part.styleSpan) continue
      const style = part.style
      const base = part.styleSpan.start
      const urls: Span[] = []
      for (const u of style.matchAll(/url\([^)]*\)/gi)) urls.push({ start: u.index, end: u.index + u[0].length })
      const re = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\b(?:white|black|red|blue|green|yellow|orange|purple|pink|gr[ae]y)\b/gi
      for (const m of style.matchAll(re)) {
        const at = m.index
        if (urls.some((u) => at >= u.start && at < u.end)) continue
        // 속성 이름: 앞쪽의 가장 가까운 "이름:" (같은 선언 안)
        const before = style.slice(0, at)
        const decl = before.slice(before.lastIndexOf(';') + 1)
        const prop = /([a-zA-Z-]+)\s*:/.exec(decl)?.[1]?.toLowerCase()
        if (!prop) continue
        const hex = normalizeColor(m[0])
        if (!hex) continue
        const use: ColorUse = { raw: m[0], property: prop, start: base + at, end: base + at + m[0].length }
        const g = groups.get(hex)
        if (g) g.uses.push(use)
        else groups.set(hex, { hex, uses: [use] })
      }
    }
  return [...groups.values()]
}

const PROPERTY_LABELS: [RegExp, string][] = [
  [/^color$/, '글자'],
  [/^background/, '배경'],
  [/^text-shadow$/, '글자 그림자'],
  [/^box-shadow$/, '그림자'],
  [/^border/, '테두리'],
  [/^outline/, '테두리'],
]

/** 색이 쓰인 곳 이름 (글자 · 배경 · 그림자 …) */
export function colorUsageLabel(group: ColorGroup): string {
  const names: string[] = []
  for (const use of group.uses) {
    const label = PROPERTY_LABELS.find(([re]) => re.test(use.property))?.[1] ?? use.property
    if (!names.includes(label)) names.push(label)
  }
  return names.join(' · ')
}

// ── 고치기 (원본 코드에서 해당 위치만 바꾼다) ──

function splice(code: string, span: Span, text: string): string {
  return code.slice(0, span.start) + text + code.slice(span.end)
}

/** [ ] 안 글자 바꾸기. ] 와 줄바꿈은 롤꾸를 깨뜨리므로 바꿔 넣는다 */
export function setSlotText(code: string, slot: LinkPart, text: string): string {
  const safe = text.replace(/\]/g, '］').replace(/\r?\n/g, ' ')
  return splice(code, slot.textSpan, safe)
}

/** 같은 색 묶음을 한꺼번에 새 색으로 */
export function setColor(code: string, group: ColorGroup, hex: string): string {
  let out = code
  for (const use of [...group.uses].sort((a, b) => b.start - a.start)) out = splice(out, use, hex)
  return out
}

/** 모든 줄을 /desc 서술로 보내기 / 일반 메시지로 */
export function setDesc(code: string, on: boolean): string {
  return code
    .split('\n')
    .map((line) => {
      if (!line.trim()) return line
      const stripped = line.replace(/^(\s*)\/(desc|em)(\s+|$)/i, '$1')
      return on ? `/desc ${stripped.trimStart()}` : stripped
    })
    .join('\n')
}

export function allDesc(code: string): boolean {
  const lines = parseCode(code)
  return lines.length > 0 && lines.every((l) => l.kind === 'desc')
}

const NO_ITALIC = /font-style\s*:\s*normal\s*(!important)?\s*;?/i

/** 롤꾸 글자의 기울임 없애기 (desc 서술은 Roll20 이 기울임으로 보여 준다) */
export function italicRemoved(code: string): boolean {
  const styled = textSlots(code).filter((s) => s.style !== undefined)
  return styled.length > 0 && styled.every((s) => NO_ITALIC.test(s.style!))
}

export function setItalicRemoved(code: string, on: boolean): string {
  let out = code
  const styled = textSlots(code)
    .filter((s) => s.style !== undefined && s.styleSpan)
    .sort((a, b) => b.styleSpan!.start - a.styleSpan!.start)
  for (const slot of styled) {
    const style = slot.style!
    if (on && !NO_ITALIC.test(style)) {
      const lead = style.match(/^\s*/)![0]
      out = splice(out, slot.styleSpan!, `${lead}font-style: normal !important; ${style.slice(lead.length)}`)
    } else if (!on && NO_ITALIC.test(style)) {
      // 맨 앞이면 뒤 공백까지, 가운데면 공백 하나만 남긴다 (넣었다 빼면 원래 코드 그대로)
      const removed = style.replace(/\s*font-style\s*:\s*normal\s*(!important)?\s*;?[ \t]*/gi, (m: string, _i: string, at: number) =>
        at === 0 || at + m.length === style.length ? '' : ' ',
      )
      out = splice(out, slot.styleSpan!, removed)
    }
  }
  return out
}

/** 칸 글자를 매크로 질문으로 (이미 질문이 들어 있으면 그대로) */
export function slotAsQuery(text: string, index: number): string {
  if (/\?\{[^{}]*\}/.test(text)) return text
  const label = index === 0 ? '내용' : `내용${index + 1}`
  return `?{${label}|${text.replace(/[|}]/g, ' ')}}`
}

// ── 그리기 (Roll20 채팅 모양) ──

export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Roll20 이 스타일에 그대로 넣는 엔티티 ( &#41; 등) 를 풀고, 위험한 값은 걷어 낸다 */
export function sanitizeStyle(style: string): string {
  const decoded = style
    .replace(/&#40;|&lpar;/gi, '(')
    .replace(/&#41;|&rpar;/gi, ')')
    .replace(/&#44;|&comma;/gi, ',')
    .replace(/&quot;/gi, "'")
    .replace(/&amp;/gi, '&')
  return decoded
    .replace(/[<>"]/g, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/url\(\s*(['"]?)(?!https?:\/\/)[^)]*\)/gi, 'none')
    .replace(/@import/gi, '')
}

const IMAGE_URL = /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i

function partHtml(part: Part): string {
  if (part.kind === 'text') {
    const t = part.text.trim()
    // Roll20 은 메시지 속 이미지 주소를 그림으로 보여 준다
    if (IMAGE_URL.test(t)) return `<img src="${escapeHtml(t)}" alt="">`
    return escapeHtml(part.text)
  }
  if (part.style === undefined) {
    if (IMAGE_URL.test(part.href)) return `<img src="${escapeHtml(part.href)}" alt="${escapeHtml(part.text)}">`
    return `<a href="#">${escapeHtml(part.text)}</a>`
  }
  return `<a href="#" style="${escapeHtml(sanitizeStyle(part.style))}">${escapeHtml(part.text)}</a>`
}

/** 코드 → Roll20 채팅 메시지 HTML (질문은 예시 답으로 채워서). 사용자 글자는 모두 이스케이프 */
export function renderChatHtml(code: string, answers: Record<string, string>): string {
  const filled = fillQueries(code, answers)
  return parseCode(filled)
    .map((line) => {
      const body = line.parts.map(partHtml).join('')
      if (line.kind === 'general')
        return `<div class="message general you"><div class="spacer"></div><span class="by">나:</span> ${body}</div>`
      return `<div class="message ${line.kind}"><div class="spacer"></div>${body}</div>`
    })
    .join('')
}

/** 미리보기용 Roll20 채팅 링크 기본 모양 (롤꾸 스타일이 덮어쓴다) */
export const ROLL20_LINK_CSS = `
.textchatcontainer a{color:#08c;text-decoration:underline;cursor:default}
.textchatcontainer .message{word-break:keep-all}
`
