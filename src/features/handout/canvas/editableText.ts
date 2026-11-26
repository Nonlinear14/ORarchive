/**
 * 캔버스 글자 칸(contenteditable)의 화면(DOM) ↔ 저장 값 변환.
 *
 * 저장 값은 textarea 와 같은 규칙의 평문이다: 줄은 \n 으로 나누고, "abc\n" 은 abc 다음에 빈 줄 하나가 보이는 상태.
 * writeValue 와 readValue 는 정확히 왕복한다 — 어떤 문자열 v 로 화면을 그려도 다시 읽으면 v 다 (한 줄 칸도 마찬가지).
 * 한 줄 칸은 이번 입력으로 새로 들어온 줄바꿈만 막는다(singleLineInput) — 저장돼 있던 글자는 줄바꿈까지 그대로 둔다.
 *
 * 브라우저가 실제로 만드는 DOM (Chrome 으로 확인, white-space: pre-wrap):
 * - plaintext-only : 빈 칸에서 Enter → "\n\n" (두 번째 \n 은 마지막 빈 줄이 보이게 하는 자리 표시),
 *                    "abc" + Enter → "abc\n\n", 이어서 입력 → "abc\ndef", 전부 지우면 → "<br>" 또는 "\n"
 * - true (대체)    : 빈 칸에서 Enter → "<div><br></div><div><br></div>", "abc" + Enter → "abc<div><br></div>",
 *                    줄마다 <div> 로 감싸고, 빈 줄은 <div><br></div>
 * innerText 는 이런 자리 표시까지 줄바꿈으로 세어(예: "<br>" → "\n") 쓰지 않는다.
 */

/** 앞뒤로 줄을 나누는 블록 요소 (contenteditable="true" 는 Enter 마다 <div> 로 줄을 감싼다) */
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4',
  'H5', 'H6', 'HEADER', 'LI', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TFOOT', 'THEAD', 'TR', 'UL',
])

/**
 * 한 블록(칸 자체 또는 그 안의 <div> 등)이 화면에 그리는 줄들.
 * - 글자 노드는 글자 그대로 (\n 은 줄바꿈 — pre-wrap), <br> 도 줄바꿈
 * - 블록 끝(또는 블록 요소 바로 앞)의 줄바꿈 하나는 새 줄을 만들지 않는다 — 브라우저가 넣는 자리 표시라서
 *   ("abc\n\n" = abc + 빈 줄, "abc\n<br>" = abc + 빈 줄, "<br>" = "\n" = 빈 칸)
 * - 블록 요소는 새 줄에서 시작하고, 내용이 하나도 없는 블록(<div></div>)은 줄을 만들지 않는다
 */
export function renderedLines(block: Node): string[] {
  const lines: string[] = []
  let run: string | null = null

  const flush = () => {
    if (run === null) return
    const parts = run.split('\n')
    if (run.endsWith('\n')) parts.pop()
    for (const part of parts) lines.push(part)
    run = null
  }

  const walk = (parent: Node) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const data = (node as Text).data
        if (data) run = (run ?? '') + data
      } else if (node.nodeName === 'BR') {
        run = (run ?? '') + '\n'
      } else if (BLOCK_TAGS.has(node.nodeName)) {
        flush()
        for (const line of renderedLines(node)) lines.push(line)
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        walk(node) // <span> 같은 인라인 요소는 같은 줄을 잇는다
      }
    }
  }

  walk(block)
  flush()
  return lines
}

/**
 * 화면의 글자를 읽는다: 보이는 줄을 \n 으로 이은 값. 길이로 자르지 않는다.
 * 줄바꿈만 있는 값("\n", "\n\n")도 그대로 — 빈 값은 빈 칸(자리 표시 <br> 포함)뿐.
 * 한 줄 칸도 보이는 그대로 읽는다: 저장돼 있던 줄바꿈(다른 기기 · 이전 버전에서 온 값)을 공백으로 바꾸거나 지우면
 * 사용자가 고치지 않은 글자가 바뀐다. 새로 들어온 줄바꿈은 singleLineInput 이 뺀다.
 */
export function readValue(el: Node): string {
  return renderedLines(el).join('\n')
}

/**
 * 한 줄 칸에 새로 넣는 글의 줄바꿈을 뺀다. 새로 들어온 글(붙여넣기 · 끌어다 놓기 · IME 등)에만 쓴다 — 저장돼 있던 글에는 쓰지 않는다.
 * 글 사이의 줄바꿈은 그 둘레 공백과 함께 공백 하나로, 글 앞뒤의 줄바꿈은 없앤다 (줄바꿈만 있는 글은 빈 글).
 * 정규식(\s*\n\s*)은 긴 공백에서 되짚기가 제곱으로 늘어나므로 줄 단위로 한 번씩만 훑는다.
 */
export function withoutLineBreaks(text: string): string {
  if (!text.includes('\n')) return text
  const lines = text.split('\n')
  const last = lines.length - 1
  return lines
    .map((line, i) => {
      const start = i === 0 ? line : line.trimStart()
      return i === last ? start : start.trimEnd()
    })
    .filter((line) => line !== '')
    .join(' ')
}

export interface SingleLineInput {
  /** 저장할 값: 화면에서 읽은 값에서 새로 들어온 글의 줄바꿈만 뺀 것 */
  value: string
  /** 새로 들어온 글 바로 뒤 — 화면을 value 로 다시 그릴 때 커서를 둘 자리 */
  caret: number
}

/**
 * 한 줄 칸의 입력: 이번 입력으로 새로 들어온 글의 줄바꿈만 뺀다 (Enter 는 keydown 에서, 붙여넣기는 paste 에서 미리 막고,
 * 여기서는 끌어다 놓기 · IME · 자동 완성처럼 그 밖의 길로 들어온 줄바꿈을 막는다).
 * 새로 들어온 글 = 입력 전 값(prev)과 화면에서 읽은 값(next)의 같은 앞부분 · 뒷부분을 뺀 가운데.
 * 그 밖의 글자는 줄바꿈(저장돼 있던 것)까지 한 글자도 바꾸지 않는다. 새 글에 줄바꿈이 없으면 value 는 next 그대로다.
 */
export function singleLineInput(prev: string, next: string): SingleLineInput {
  const limit = Math.min(prev.length, next.length)
  let start = 0
  while (start < limit && prev[start] === next[start]) start++
  let end = 0
  while (end < limit - start && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++
  const inserted = withoutLineBreaks(next.slice(start, next.length - end))
  return { value: next.slice(0, start) + inserted + next.slice(next.length - end), caret: start + inserted.length }
}

/**
 * 저장 값을 화면에 그릴 글자. 값이 줄바꿈으로 끝나면 브라우저(plaintext-only)처럼 \n 을 하나 더 붙여
 * 마지막 빈 줄이 실제로 보이게 한다 (pre-wrap 은 블록 끝의 줄바꿈 하나를 그리지 않는다).
 */
export function displayText(value: string): string {
  return value.endsWith('\n') ? `${value}\n` : value
}

/** 저장 값 → 화면. readValue(el) 가 정확히 value 를 돌려준다 */
export function writeValue(el: HTMLElement, value: string) {
  el.textContent = displayText(value)
}
