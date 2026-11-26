/**
 * 블록 핸드아웃 → Roll20 에 붙여 넣을 HTML(롤꾸 복사)과 평문.
 * roll20.ts 와 같은 규칙: 표 기반 레이아웃 · 모든 스타일 인라인 · class/style 태그 없음 · 장식은 실제 요소 ·
 * 사용자 글자는 이스케이프 · 의미 있는 공백은 &nbsp; · 줄바꿈은 <br>.
 * 2열 행은 칸 두 개짜리 표로 그린다.
 */
import { blockBoxCss, boxedCss, frameCss, imageCss, sealCss, textCss } from './blockStyles'
import { blockImage, BLOCK_FONT_STACK, layoutText, type Align, type HandoutLayout, type LayoutBlock, type TextBlock } from './layout'
import { escapeHtml, normalizeText, whitespaceHtml } from './roll20'
import { inline } from './styles'

const NO_BORDER = 'border-top:0px none;border-right:0px none;border-bottom:0px none;border-left:0px none;'
const TABLE_ATTRS = 'cellpadding="0" cellspacing="0" border="0"'
const TABLE_RESET = 'border-collapse:collapse;border-spacing:0;'
const fullTable = (inner: string, extra = '') =>
  `<table width="100%" ${TABLE_ATTRS} style="${TABLE_RESET}margin:0;width:100%;${extra}"><tbody>${inner}</tbody></table>`

function textHtml(block: TextBlock, align: Align): string {
  const style = block.style
  const html = block.text ? whitespaceHtml(block.text) : '&nbsp;'
  const text = inline(textCss(style))
  const box = blockBoxCss(style, style.align ?? align)
  if (style.seal) {
    const size = style.seal.size
    return (
      `<div style="${NO_BORDER}${inline(box)}">` +
      `<table width="${size}" ${TABLE_ATTRS} align="center" style="border-collapse:separate;border-spacing:0;margin:0 auto;width:${size}px;">` +
      `<tbody><tr><td width="${size}" height="${size}" align="center" valign="middle" style="${inline(sealCss(style.seal))}${text}">${html}</td></tr></tbody></table></div>`
    )
  }
  const body = style.boxed ? `<span style="${inline(boxedCss(style))}">${html}</span>` : html
  const paragraph = `<p style="${NO_BORDER}${inline(box)}${text}margin-top:${box.marginTop};margin-bottom:${box.marginBottom};text-align:${box.textAlign};">${body}</p>`
  if (!style.bar) return paragraph
  const { color, width, gap } = style.bar
  return fullTable(
    `<tr><td width="${width}" bgcolor="${color}" style="${NO_BORDER}padding:0;width:${width}px;background-color:${color};font-size:1px;line-height:1px;">&nbsp;</td>` +
      `<td style="${NO_BORDER}padding:0 0 0 ${gap}px;">${paragraph}</td></tr>`,
  )
}

function blockHtml(block: LayoutBlock, align: Align): string {
  if (block.type === 'text') return textHtml(block, align)
  const margin = `margin:${block.marginTop ?? 0}px 0 ${block.marginBottom ?? 0}px;`
  const image = blockImage(block)
  if (image)
    return `<p style="${NO_BORDER}${margin}padding:0;text-align:center;line-height:0;"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" width="${block.maxWidth}" style="${inline(imageCss(block))}"></p>`
  if (block.rule) {
    const { widthPercent, color } = block.rule
    return (
      `<table width="${widthPercent}%" ${TABLE_ATTRS} align="center" style="${TABLE_RESET}margin:${block.marginTop ?? 0}px auto ${block.marginBottom ?? 0}px;width:${widthPercent}%;">` +
      `<tbody><tr><td height="1" bgcolor="${color}" style="${NO_BORDER}padding:0;height:1px;line-height:1px;font-size:1px;background-color:${color};">&nbsp;</td></tr></tbody></table>`
    )
  }
  return ''
}

/** 롤꾸 복사: Roll20 핸드아웃 내용 칸에 붙여 넣을 HTML (text/html) */
export function blockRoll20Html(layout: HandoutLayout): string {
  const rows = layout.rows
    .map((row) => {
      if (row.blocks.length === 1) return blockHtml(row.blocks[0], layout.align)
      const cells = row.blocks
        .map(
          (b, i) =>
            `<td width="50%" valign="top" style="${NO_BORDER}padding:0 ${i === 0 ? 8 : 0}px 0 ${i === 0 ? 0 : 8}px;width:50%;vertical-align:top;">${blockHtml(b, layout.align)}</td>`,
        )
        .join('')
      return fullTable(`<tr>${cells}</tr>`)
    })
    .join('')
  return layout.frames.reduceRight((inner, frame, index) => {
    const first = index === 0
    let css = TABLE_RESET + inline(frameCss({ ...frame, padding: '0' }, layout.background, first ? layout.width : undefined))
    if (first) css += `font-family:${BLOCK_FONT_STACK};font-size:16px;font-weight:400;line-height:normal;`
    const widthAttr = first ? String(layout.width) : '100%'
    if (!first) css += 'width:100%;'
    return (
      `<table width="${widthAttr}" ${TABLE_ATTRS} align="center" bgcolor="${layout.background}" style="${css}"><tbody><tr>` +
      `<td align="${layout.align}" bgcolor="${layout.background}" style="${NO_BORDER}padding:${frame.padding};background-color:${layout.background};text-align:${layout.align};">${inner}</td></tr></tbody></table>`
    )
  }, rows)
}

/** 서식을 받지 않는 곳에 붙여 넣을 평문 (text/plain) */
export function blockRoll20Text(layout: HandoutLayout): string {
  return normalizeText(layoutText(layout))
}
