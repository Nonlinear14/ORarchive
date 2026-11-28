import type { CcfRow } from '../render'

/** 내용을 고칠 수 있는 메시지 (대사만 — system · 주사위 · 표 결과는 고칠 수 없다) */
export const isCcfEditable = (row: Pick<CcfRow, 'kind'>) => row.kind.kind === 'talk'

/** 고친 글자 칸 → 저장할 글 (줄바꿈 \n, 꾸밈 없음) */
export function plainEditableToText(root: Node): string {
  let out = ''
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child.textContent ?? '').replace(/\u00a0/g, ' ')
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const tag = (child as Element).tagName.toLowerCase()
      if (tag === 'br') {
        out += '\n'
        continue
      }
      if ((tag === 'div' || tag === 'p') && out && !out.endsWith('\n')) out += '\n'
      walk(child)
    }
  }
  walk(root)
  return out.replace(/\n+$/, '')
}
