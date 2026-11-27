/** 글상자 글자 칸의 화면(DOM) ↔ 조각(run) · 글자 위치 */
import { runCss } from '../blockStyles'
import type { TextBlock } from '../layout'
import { runsText, type Run, type RunStyle } from '../richText'
import { readValue } from './editableText'

const BLOCK_TAGS = new Set(['DIV', 'P'])

/** 화면 글자를 순서대로 (글자, 조각 꾸밈). <br> · 줄 블록은 줄바꿈 */
function rawChars(el: HTMLElement): { ch: string; s: string }[] {
  const out: { ch: string; s: string }[] = []
  const styleOf = (node: Node) => (node.parentElement?.closest<HTMLElement>('[data-s]')?.dataset.s ?? '{}')
  const walk = (parent: Node) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const s = styleOf(node)
        for (const ch of (node as Text).data) out.push({ ch, s })
      } else if (node.nodeName === 'BR') out.push({ ch: '\n', s: out.at(-1)?.s ?? '{}' })
      else if (node.nodeType === Node.ELEMENT_NODE) {
        if (BLOCK_TAGS.has(node.nodeName) && out.length && out.at(-1)!.ch !== '\n') out.push({ ch: '\n', s: out.at(-1)!.s })
        walk(node)
      }
    }
  }
  walk(el)
  return out
}

/** 화면 → 조각들 (글자는 readValue 와 같은 규칙, 꾸밈은 글자마다 맞춘다) */
export function readRuns(el: HTMLElement): Run[] {
  const plain = readValue(el)
  const raw = rawChars(el)
  const runs: Run[] = []
  let j = 0
  let last = '{}'
  for (const ch of plain) {
    // 자리 표시 줄바꿈은 건너뛰고 같은 글자를 찾는다
    let k = j
    while (k < raw.length && raw[k].ch !== ch) k++
    let s = last
    if (k < raw.length) {
      s = raw[k].s
      j = k + 1
    }
    last = s
    const prev = runs.at(-1)
    const key = s
    if (prev && JSON.stringify(prev.s ?? {}) === key) prev.t += ch
    else {
      const parsed = JSON.parse(key) as RunStyle
      runs.push(Object.keys(parsed).length ? { t: ch, s: parsed } : { t: ch })
    }
  }
  return runs
}

/** 조각들 → 화면 */
export function writeRuns(el: HTMLElement, block: TextBlock) {
  el.textContent = ''
  const runs = block.runs ?? [{ t: block.text }]
  if (!runsText(runs)) return
  runs.forEach((run, i) => {
    const span = document.createElement('span')
    span.dataset.s = JSON.stringify(run.s ?? {})
    Object.assign(span.style, runCss(block.style, run.s))
    // 끝 줄바꿈은 빈 줄이 보이게 자리 표시를 하나 더 (editableText.displayText 와 같은 규칙)
    span.textContent = i === runs.length - 1 && run.t.endsWith('\n') ? `${run.t}\n` : run.t
    el.append(span)
  })
}

/** 칸 안 글자 위치 (선택 범위) */
export function caretOffsets(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null
  const at = (node: Node, offset: number) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    r.setEnd(node, offset)
    const holder = document.createElement('div')
    holder.append(r.cloneContents())
    return rawChars(holder).length
  }
  return { start: at(range.startContainer, range.startOffset), end: at(range.endContainer, range.endOffset) }
}

/** 글자 위치 → DOM 범위 */
export function rangeAt(el: HTMLElement, start: number, end: number): Range | null {
  const range = document.createRange()
  let count = 0
  let setStart = false
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const len = node.data.length
    if (!setStart && start <= count + len) {
      range.setStart(node, start - count)
      setStart = true
    }
    if (setStart && end <= count + len) {
      range.setEnd(node, end - count)
      return range
    }
    count += len
  }
  return null
}

