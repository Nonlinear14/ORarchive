/**
 * 블록 핸드아웃 → Roll20 에 붙여 넣을 HTML(롤꾸 복사)과 평문.
 * roll20.ts 와 같은 규칙: 표 기반 레이아웃 · 모든 스타일 인라인 · class/style 태그 없음 · 장식은 실제 요소 ·
 * 사용자 글자는 이스케이프 · 의미 있는 공백은 &nbsp; · 줄바꿈은 <br>.
 * 2열 행은 칸 두 개짜리 표로 그린다.
 */
import { blockBoxCss, boxedCss, frameCss, imageCss, runCss, sealCss, textCss } from './blockStyles'
import { blockImage, BLOCK_FONT_STACK, lineSegments, ruleLength, layoutText, rowMargins, splitOf, withoutMargins, type Align, type HandoutLayout, type LayoutBlock, type TextBlock } from './layout'
import { escapeHtml, normalizeText, whitespaceHtml } from './roll20'
import { inline } from './styles'

const NO_BORDER = 'border-top:0px none;border-right:0px none;border-bottom:0px none;border-left:0px none;'
const TABLE_ATTRS = 'cellpadding="0" cellspacing="0" border="0"'
const TABLE_RESET = 'border-collapse:collapse;border-spacing:0;'
const fullTable = (inner: string, extra = '') =>
  `<table width="100%" ${TABLE_ATTRS} style="${TABLE_RESET}margin:0;width:100%;${extra}"><tbody>${inner}</tbody></table>`

function textHtml(block: TextBlock, align: Align): string {
  const style = block.style
  // 조각마다 <span style> (밑줄 · 취소선 · 일부 글자 꾸밈). 꾸밈이 없는 조각은 글자만
  const html = block.text
    ? (block.runs ?? [{ t: block.text }])
        .map((run) => {
          const css = inline(runCss(style, run.s))
          const body = whitespaceHtml(run.t)
          return css ? `<span style="${css}">${body}</span>` : body
        })
        .join('')
    : '&nbsp;'
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

function blockHtml(block: LayoutBlock, align: Align, contentWidth: number): string {
  if (block.type === 'text') return textHtml(block, align)
  if (block.type === 'space')
    return fullTable(`<tr><td height="${block.height}" style="${NO_BORDER}padding:0;height:${block.height}px;line-height:1px;font-size:1px;">&nbsp;</td></tr>`)
  const margin = `margin:${block.marginTop ?? 0}px 0 ${block.marginBottom ?? 0}px;`
  const image = blockImage(block)
  if (image)
    return `<p style="${NO_BORDER}${margin}padding:0;text-align:center;line-height:0;"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" width="100%" style="${inline(imageCss())}"></p>`
  if (block.rule) {
    // 장식은 실제 요소로: 선의 조각(선분 · 점)을 표 칸으로 하나씩 그린다
    const { color } = block.rule
    const length = ruleLength(block.rule, contentWidth)
    const t = block.rule.thickness ?? 1
    const cells = lineSegments(length, block.rule.style, t)
      .map((seg) =>
        seg.on
          ? `<td width="${seg.w}" height="${t}" bgcolor="${color}" style="${NO_BORDER}padding:0;width:${seg.w}px;height:${t}px;line-height:1px;font-size:1px;background-color:${color};">&nbsp;</td>`
          : `<td width="${seg.w}" height="${t}" style="${NO_BORDER}padding:0;width:${seg.w}px;height:${t}px;line-height:1px;font-size:1px;">&nbsp;</td>`,
      )
      .join('')
    return (
      `<table width="${length}" ${TABLE_ATTRS} align="center" style="${TABLE_RESET}margin:${block.marginTop ?? 0}px auto ${block.marginBottom ?? 0}px;width:${length}px;max-width:100%;">` +
      `<tbody><tr>${cells}</tr></tbody></table>`
    )
  }
  return ''
}

const valignOf = (b: LayoutBlock) => (b.type === 'space' ? 'middle' : (b.valign ?? 'middle'))

/** 롤꾸 복사: Roll20 핸드아웃 내용 칸에 붙여 넣을 HTML (text/html) */
export function blockRoll20Html(layout: HandoutLayout): string {
  const rows = layout.rows
    .map((row) => {
      if (row.blocks.length === 1) return blockHtml(row.blocks[0], layout.align, layout.contentWidth)
      // 2열: 왼쪽 너비 %(split) · 두 칸은 같은 높이(표 칸) · 내용은 세로 가운데 · 여백은 줄에 한 번
      const split = splitOf(row)
      const widths = [split, 100 - split]
      const cells = row.blocks
        .map(
          (b, i) =>
            `<td width="${widths[i]}%" valign="${valignOf(b)}" style="${NO_BORDER}padding:0 ${i === 0 ? 8 : 0}px 0 ${i === 0 ? 0 : 8}px;width:${widths[i]}%;vertical-align:${valignOf(b)};">${blockHtml(withoutMargins(b), layout.align, layout.contentWidth)}</td>`,
        )
        .join('')
      const { top, bottom } = rowMargins(row)
      return fullTable(`<tr>${cells}</tr>`, `margin:${top}px 0 ${bottom}px;`)
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
