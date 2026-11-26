import type { Roll20LogContent } from './model'
import { containerClass, escapeHtml, logCss, renderMessagesHtml } from './render'

/**
 * 내보내기 두 가지
 * - HTML 파일: <style> 이 들어 있는 완성된 페이지 (바로 열어 보기)
 * - 블로그용 코드: 블로그 HTML 편집 모드에 붙여 넣는 코드. 블로그가 <style>·class 를 지우거나 덮어써도 모양이 유지되도록
 *   CSS 규칙을 각 요소의 style 속성으로 옮기고 class 는 지운다.
 */

const PAGE_CSS = `body{margin:0;background:#e9e7e1}.folio-log{max-width:760px;margin:24px auto;box-shadow:0 2px 12px rgba(0,0,0,.12)}`

export function logBodyHtml(content: Roll20LogContent): string {
  return `<div class="${containerClass(content)}"><div class="content">\n${renderMessagesHtml(content)}\n</div></div>`
}

export function logHtmlFile(content: Roll20LogContent, title: string): string {
  const safeTitle = escapeHtml(title || 'Roll20 로그')
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
${PAGE_CSS}
${logCss(content)}
</style>
</head>
<body>
<div class="folio-log">
${logBodyHtml(content)}
</div>
</body>
</html>
`
}

export function logFileName(title: string): string {
  const base = (title || 'roll20-log').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${base || 'roll20-log'}.html`
}

// ---------------------------------------------------------------- 블로그용: CSS 를 style 속성으로

interface IndexedRule {
  selector: string
  specificity: number
  order: number
  style: CSSStyleDeclaration
}

/** 아주 단순한 명시도: id 10000 · class/속성/가상 클래스 100 · 태그 1 */
function specificityOf(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) ?? []).length
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length
  const tags = (selector.replace(/[#.][\w-]+|\[[^\]]+\]|:[\w-]+(\([^)]*\))?/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length
  return ids * 10000 + classes * 100 + tags
}

/** 가장 오른쪽 조각의 열쇠 (class 하나 또는 태그). 요소마다 검사할 규칙을 줄이는 데 쓴다 */
function keyOf(selector: string): string {
  const last = selector.trim().split(/[\s>+~]+/).pop() ?? ''
  const cls = /\.([\w-]+)/.exec(last)
  if (cls) return `.${cls[1]}`
  const tag = /^([a-z][\w-]*)/i.exec(last)
  return tag ? tag[1].toLowerCase() : '*'
}

function collectRules(sheet: CSSStyleSheet): Map<string, IndexedRule[]> {
  const index = new Map<string, IndexedRule[]>()
  let order = 0
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        // 화면 너비 조건 등은 블로그에서 판단할 수 없어 건너뛴다
        continue
      }
      if (!(rule instanceof CSSStyleRule)) continue
      for (const raw of rule.selectorText.split(',')) {
        const selector = raw.trim()
        if (!selector || /::|:hover|:focus|:active|:visited|:before|:after/i.test(selector)) continue
        const key = keyOf(selector)
        const list = index.get(key) ?? []
        list.push({ selector, specificity: specificityOf(selector), order: order++, style: rule.style })
        index.set(key, list)
      }
    }
  }
  visit(sheet.cssRules)
  return index
}

/** html 에 css 를 적용한 결과를 style 속성으로 옮긴다 (class 는 지운다) */
export function inlineCss(html: string, css: string): string {
  // 규칙만 읽으려고 현재 문서에 잠깐 붙인다 (media="not all" 이라 화면에는 적용되지 않는다)
  const styleEl = document.createElement('style')
  styleEl.media = 'not all'
  styleEl.textContent = css
  document.head.append(styleEl)
  let index: Map<string, IndexedRule[]>
  try {
    if (!styleEl.sheet) return html
    index = collectRules(styleEl.sheet)
  } finally {
    styleEl.remove()
  }
  const doc = document.implementation.createHTMLDocument('')
  doc.body.innerHTML = html
  const elements = [...doc.body.querySelectorAll('*')]
  const styles = new Map<Element, string>()

  for (const el of elements) {
    const candidates: IndexedRule[] = [...(index.get('*') ?? []), ...(index.get(el.tagName.toLowerCase()) ?? [])]
    for (const cls of el.classList) candidates.push(...(index.get(`.${cls}`) ?? []))
    const matched = candidates.filter((r) => {
      try {
        return el.matches(r.selector)
      } catch {
        return false
      }
    })
    matched.sort((a, b) => a.specificity - b.specificity || a.order - b.order)
    const props = new Map<string, { value: string; important: boolean }>()
    for (const rule of matched) {
      for (let i = 0; i < rule.style.length; i++) {
        const name = rule.style.item(i)
        const value = rule.style.getPropertyValue(name)
        const important = rule.style.getPropertyPriority(name) === 'important'
        const prev = props.get(name)
        if (prev?.important && !important) continue
        props.set(name, { value, important })
      }
    }
    const own = el.getAttribute('style')
    const declared = [...props.entries()].map(([name, { value }]) => `${name}:${value}`).join(';')
    const merged = [declared, own].filter(Boolean).join(';')
    if (merged) styles.set(el, merged)
  }
  for (const el of elements) {
    el.removeAttribute('class')
    const style = styles.get(el)
    if (style) el.setAttribute('style', style)
  }
  return doc.body.innerHTML
}

export function logBlogCode(content: Roll20LogContent): string {
  const css = logCss(content)
  return `<div style="max-width:760px;margin:0 auto">${inlineCss(logBodyHtml(content), css)}</div>`
}
