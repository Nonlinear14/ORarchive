/**
 * 꾸민 글자 메시지 (롤꾸: style 이 붙은 <a>·<span> 등 → html 로 저장된 메시지).
 * 꾸밈(요소·style)은 그대로 두고 글자만 고친다. 판정 메시지·시트 판정·인라인 판정 결과는 고치지 않는다.
 */
import type { LogMessage } from './model'

const LOCKED = '.inlinerollresult, .sheet-rolltemplate'

function fragmentOf(html: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

/** 고칠 수 있는 글자 조각 (인라인 판정 결과 속 글자는 빼고) */
function editableTextNodes(root: Node): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest(LOCKED)) out.push(node as Text)
  }
  return out
}

const cache = new WeakMap<LogMessage, boolean>()

/** html 로 저장됐지만 꾸민 글자라서 글자를 고칠 수 있는 메시지인가 */
export function isStyledEditable(message: LogMessage): boolean {
  if (message.text !== undefined || message.html === undefined) return false
  if (message.kind === 'roll' || message.kind === 'hidden' || message.html.includes('sheet-rolltemplate')) return false
  const hit = cache.get(message)
  if (hit !== undefined) return hit
  const result = editableTextNodes(fragmentOf(message.html)).some((t) => (t.textContent ?? '').trim() !== '')
  cache.set(message, result)
  return result
}

/** 수정 칸 안에서 고치면 안 되는 부분(인라인 판정·이미지)을 잠근다 */
export function lockInlineParts(root: HTMLElement) {
  for (const el of root.querySelectorAll(`${LOCKED}, img`)) el.setAttribute('contenteditable', 'false')
}

/** 꾸민 글자 메시지에서 찾을 글자 수 */
export function countInHtml(html: string, find: string): number {
  if (!find) return 0
  return editableTextNodes(fragmentOf(html)).reduce((n, t) => n + (t.data.split(find).length - 1), 0)
}

/** 꾸민 글자 메시지의 글자만 바꾼다 (꾸밈은 그대로). 바뀐 것이 없으면 null */
export function replaceInHtml(html: string, find: string, replacement: string): string | null {
  if (!find) return null
  const fragment = fragmentOf(html)
  let changed = false
  for (const t of editableTextNodes(fragment)) {
    if (!t.data.includes(find)) continue
    t.data = t.data.split(find).join(replacement)
    changed = true
  }
  if (!changed) return null
  const holder = document.createElement('div')
  holder.append(fragment)
  return holder.innerHTML
}
