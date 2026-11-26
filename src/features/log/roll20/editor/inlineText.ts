/**
 * 바로 수정한 글자 칸(contentEditable)의 내용 → 저장 형식의 글자 (*기울임* · **굵게** · 줄바꿈 \n).
 * Ctrl+B / Ctrl+I 가 만든 <b>·<i>(또는 font-weight/font-style 이 붙은 span), 줄바꿈 <br>, 브라우저가 줄마다 만든 <div> 를 읽는다.
 */
export function editableHtmlToText(root: Node): string {
  let out = ''
  const walk = (node: Node, bold: boolean, italic: boolean) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        let text = (child.textContent ?? '').replace(/\u00a0/g, ' ')
        if (!text) continue
        if (italic) text = `*${text}*`
        if (bold) text = `**${text}**`
        out += text
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as HTMLElement
      const tag = el.tagName.toLowerCase()
      if (tag === 'br') {
        out += '\n'
        continue
      }
      const block = tag === 'div' || tag === 'p'
      if (block && out && !out.endsWith('\n')) out += '\n'
      const weight = el.style?.fontWeight
      const isBold = bold || tag === 'b' || tag === 'strong' || weight === 'bold' || Number(weight) >= 600
      const isItalic = italic || tag === 'i' || tag === 'em' || el.style?.fontStyle === 'italic'
      walk(el, isBold && !bold ? true : bold, isItalic && !italic ? true : italic)
    }
  }
  walk(root, false, false)
  // 붙어 있는 굵은 조각은 하나로: **가****나** → **가나**
  return out.replace(/(?<!\*)\*\*\*\*(?!\*)/g, '').replace(/\n+$/, '').trim()
}
