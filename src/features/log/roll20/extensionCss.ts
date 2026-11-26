/**
 * 확장 프로그램(User JavaScript and CSS 등)이 Roll20 채팅에 입힌 꾸밈.
 *
 * - 저장한 파일: 확장 프로그램이 넣은 <style> 블록에서 메시지(.textchatcontainer / .message)와
 *   판정 표(.sheet-rolltemplate-*) 규칙만 고른다. Roll20 화면용 규칙(매크로 바 등)과 글꼴(@font-face, font-family)은 뺀다.
 * - 붙여넣기: 크롬은 복사할 때 확장 프로그램이 입힌 모양을 각 요소의 style 속성으로 넣는다.
 *   메시지 종류별로 같은 속성을 모아 같은 규칙으로 되살린다 (메시지마다 저장하지 않아 용량이 늘지 않는다).
 */

const KEEP_SELECTOR = /\.textchatcontainer|\.message\b|\.sheet-rolltemplate-/
/** 꾸밈으로 옮기지 않는 속성: 글꼴(사용자 결정 — 글꼴은 반영하지 않는다) */
const DROP_PROPERTY = /^font-family$/i

/** CSS 글자를 규칙 목록으로 (현재 문서에 media="not all" 로 잠깐 붙여 읽는다 — 화면에는 적용되지 않는다) */
export function readCssRules(css: string): CSSRule[] {
  if (typeof document === 'undefined') return []
  const style = document.createElement('style')
  style.media = 'not all'
  style.textContent = css
  document.head.append(style)
  try {
    return style.sheet ? Array.from(style.sheet.cssRules) : []
  } finally {
    style.remove()
  }
}

function declarations(style: CSSStyleDeclaration): string {
  // 글꼴 속성을 뺀 뒤 브라우저가 다시 쓴 선언(줄임 속성 유지)을 쓴다
  for (let i = style.length - 1; i >= 0; i--) {
    const name = style.item(i)
    if (DROP_PROPERTY.test(name)) style.removeProperty(name)
  }
  return style.cssText.trim().replace(/;$/, '')
}

/** 확장 프로그램 <style> 내용 → 메시지·판정 표 꾸밈만 남긴 CSS */
export function filterExtensionCss(css: string): string {
  const out: string[] = []
  for (const rule of readCssRules(css)) {
    if (!(rule instanceof CSSStyleRule)) continue
    const selectors = rule.selectorText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && KEEP_SELECTOR.test(s) && !/#(?!textchat\b)[\w-]/.test(s))
    if (selectors.length === 0) continue
    const body = declarations(rule.style)
    if (body) out.push(`${selectors.join(',')}{${body}}`)
  }
  return out.join('\n')
}

/** style 속성 글자에서 특정 속성을 뺀다 */
export function stripStyleProperties(style: string, drop: (name: string, value: string) => boolean): string {
  return style
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => {
      const i = d.indexOf(':')
      if (i < 0) return false
      return !drop(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim())
    })
    .join('; ')
}

/** 붙여넣은 내용의 style 속성 정리: 글꼴은 빼고, 복사할 때 화면 폭으로 굳은 표 폭(px)은 지운다 */
export function cleanPastedStyle(el: Element): void {
  const style = el.getAttribute('style')
  if (!style) return
  const isTable = el.tagName === 'TABLE'
  const cleaned = stripStyleProperties(style, (name, value) => DROP_PROPERTY.test(name) || (isTable && name === 'width' && /px$/i.test(value)))
  if (cleaned) el.setAttribute('style', cleaned)
  else el.removeAttribute('style')
}

/** 가장 많이 나온 값 */
function mostCommon(values: string[]): string | undefined {
  const count = new Map<string, number>()
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1)
  let best: string | undefined
  let n = 0
  for (const [v, c] of count) if (c > n) [best, n] = [v, c]
  return best
}

const cleanForRule = (style: string) =>
  stripStyleProperties(style, (name) => DROP_PROPERTY.test(name) || name === 'position')

/**
 * 붙여넣은 메시지들의 style 속성(메시지 · 구분선 · 이름) → 메시지 종류별 CSS 규칙.
 * 확장 프로그램을 쓰지 않은 페이지를 복사하면 style 속성이 없으므로 빈 글자를 돌려준다.
 */
export function rulesFromPastedMessages(elements: Element[]): string {
  const groups = new Map<string, { message: string[]; spacer: string[]; by: string[] }>()
  for (const el of elements) {
    const own = el.getAttribute('style')
    const spacer = el.querySelector(':scope > .spacer')?.getAttribute('style')
    const by = el.querySelector(':scope > .by')?.getAttribute('style')
    if (!own && !spacer && !by) continue
    const classes = [...el.classList].filter((c) => /^[a-z][\w-]*$/i.test(c) && !/^player-|^discord-/.test(c))
    const key = classes.map((c) => `.${c}`).join('')
    const group = groups.get(key) ?? { message: [], spacer: [], by: [] }
    if (own) group.message.push(own)
    if (spacer) group.spacer.push(spacer)
    if (by) group.by.push(by)
    groups.set(key, group)
  }
  const out: string[] = []
  for (const [key, group] of groups) {
    const base = `.textchatcontainer ${key}`
    const message = mostCommon(group.message)
    const spacer = mostCommon(group.spacer)
    const by = mostCommon(group.by)
    if (message && cleanForRule(message)) out.push(`${base}{${cleanForRule(message)}}`)
    if (spacer && cleanForRule(spacer)) out.push(`${base} .spacer{${cleanForRule(spacer)}}`)
    if (by && cleanForRule(by)) out.push(`${base} .by{${cleanForRule(by)}}`)
  }
  return out.join('\n')
}
