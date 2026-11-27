/**
 * 블록 핸드아웃 → Roll20 에 붙여 넣을 HTML(롤꾸 복사)과 평문.
 * 규칙: 모든 스타일 인라인 · class/style 태그 없음 · 장식은 실제 요소 · 사용자 글자는 이스케이프 ·
 * 의미 있는 공백은 &nbsp; · 줄바꿈은 <br>.
 *
 * Roll20 은 핸드아웃 안의 표 칸에 자체 테두리(회색 1px)와 안쪽 여백을 입힌다 (2026-11-27 확인).
 * - 틀(종이 배경 · 여백 · 폭)과 공백 블록은 표 없이 <div> 로 그린다.
 * - 나란히 놓아야 하는 것(2열 줄 · 구분선 조각 · 원형 인장 · 세로 막대)만 표를 쓰고,
 *   표 · 표 칸의 테두리 · 여백 · 간격은 인라인 !important 로 초기화한다 (스타일시트의 !important 보다 우선).
 */
import { blockBoxCss, boxedCss, imageCss, runCss, sealCss, textCss } from './blockStyles'
import { blockImage, BLOCK_FONT_STACK, lineSegments, ruleLength, layoutText, rowMargins, splitOf, withoutMargins, type Align, type HandoutLayout, type LayoutBlock, type TextBlock } from './layout'
import { escapeHtml, normalizeText, whitespaceHtml } from './roll20'
import { inline } from './styles'

const NO_BORDER = 'border:0 none;'
const TABLE_ATTRS = 'cellpadding="0" cellspacing="0" border="0"'
/** 표: 테두리 · 칸 간격 · 배경을 Roll20 스타일보다 우선해서 없앤다 */
const TABLE_RESET = 'border:0 none !important;border-collapse:collapse !important;border-spacing:0 !important;background:transparent !important;'
/** 표 칸: 테두리 없음 · 안쪽 여백은 지정한 값 (Roll20 기본 여백보다 우선) */
const cell = (padding = '0') => `border:0 none !important;padding:${padding} !important;`
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
      `<table width="${size}" ${TABLE_ATTRS} align="center" style="${TABLE_RESET}border-collapse:separate !important;margin:0 auto;width:${size}px;">` +
      `<tbody><tr><td width="${size}" height="${size}" align="center" valign="middle" style="${inline(sealCss(style.seal))}${text}border:3px double ${style.seal.ring} !important;padding:0 !important;">${html}</td></tr></tbody></table></div>`
    )
  }
  const body = style.boxed ? `<span style="${inline(boxedCss(style))}">${html}</span>` : html
  const paragraph = `<p style="${NO_BORDER}${inline(box)}${text}margin-top:${box.marginTop};margin-bottom:${box.marginBottom};text-align:${box.textAlign};">${body}</p>`
  if (!style.bar) return paragraph
  const { color, width, gap } = style.bar
  return fullTable(
    `<tr><td width="${width}" bgcolor="${color}" style="${cell()}width:${width}px;background-color:${color} !important;font-size:1px;line-height:1px;">&nbsp;</td>` +
      `<td style="${cell(`0 0 0 ${gap}px`)}">${paragraph}</td></tr>`,
  )
}

function blockHtml(block: LayoutBlock, align: Align, contentWidth: number): string {
  if (block.type === 'text') return textHtml(block, align)
  // 공백: 표 없이 높이만 가진 <div>
  if (block.type === 'space')
    return `<div style="${NO_BORDER}margin:0;padding:0;height:${block.height}px;line-height:1px;font-size:1px;overflow:hidden;">&nbsp;</div>`
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
          ? `<td width="${seg.w}" height="${t}" bgcolor="${color}" style="${cell()}width:${seg.w}px;height:${t}px;line-height:1px;font-size:1px;background-color:${color} !important;">&nbsp;</td>`
          : `<td width="${seg.w}" height="${t}" style="${cell()}width:${seg.w}px;height:${t}px;line-height:1px;font-size:1px;">&nbsp;</td>`,
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
            `<td width="${widths[i]}%" valign="${valignOf(b)}" style="${cell(`0 ${i === 0 ? 8 : 0}px 0 ${i === 0 ? 0 : 8}px`)}width:${widths[i]}%;vertical-align:${valignOf(b)};">${blockHtml(withoutMargins(b), layout.align, layout.contentWidth)}</td>`,
        )
        .join('')
      const { top, bottom } = rowMargins(row)
      return fullTable(`<tr>${cells}</tr>`, `margin:${top}px 0 ${bottom}px;`)
    })
    .join('')
  // 틀: 표 없이 <div> (바깥 틀이 폭 · 글꼴, 안쪽 틀은 여백만). 배경색은 모든 틀에
  return layout.frames.reduceRight((inner, frame, index) => {
    const first = index === 0
    let css = `${NO_BORDER}margin:0 auto;padding:${frame.padding};background-color:${layout.background};box-sizing:border-box;text-align:${layout.align};`
    if (first) css += `width:${layout.width}px;max-width:100%;font-family:${BLOCK_FONT_STACK};font-size:16px;font-weight:400;line-height:normal;`
    return `<div style="${css}">${inner}</div>`
  }, rows)
}

/** 서식을 받지 않는 곳에 붙여 넣을 평문 (text/plain) */
export function blockRoll20Text(layout: HandoutLayout): string {
  return normalizeText(layoutText(layout))
}
