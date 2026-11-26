/**
 * Roll20 핸드아웃에 붙여 넣을 HTML 과 평문 만들기 (목업 v3 에서 검증한 방식을 템플릿 블록 전체로 일반화).
 *
 * Roll20 은 붙여 넣은 HTML 의 <style>·<script>·class 를 버리고, 바깥 CSS 도 없다. 그래서
 * - 레이아웃은 표(table) 로, 모든 스타일은 요소마다 인라인으로 적는다 (class 속성 없음)
 * - 테두리·구분선·인장 같은 장식도 실제 요소로 그린다 (::before/::after 없음)
 * - margin/padding/border/line-height/font 를 요소마다 명시해 Roll20 기본 스타일을 덮는다
 * - 캔버스는 white-space:pre-wrap 이지만 붙여 넣은 HTML 은 아니므로, 의미 있는 공백을 &nbsp; 로 바꾼다
 *   (탭 → 공백 4칸, 줄 앞·줄 끝 공백과 2칸 이상 연속 공백 → &nbsp;, 줄바꿈 → <br>)
 * - 빈 문자열인 선택 칸만 뺀다. 공백·줄바꿈만 있는 칸도 사용자가 넣은 내용이므로 그린다
 * - 사용자가 입력한 글자는 모두 이스케이프한다
 */
import { resolveLook, type HandoutLook } from './templates'
import type { Block } from './templates/types'
import { renderableImage, type HandoutContent } from './model'
import {
  boxedCss,
  frameInnerCss,
  frameOuterCss,
  imageCss,
  inline,
  sealCss,
  textCss,
  type Align,
} from './styles'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 줄바꿈 통일 · 탭 → 공백 4칸 · NBSP(contenteditable 이 남기는 것) → 공백 */
export function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\u00a0/g, ' ')
}

/**
 * 공백을 보존하는 HTML 조각 (일반 HTML 은 줄 앞·줄 끝 공백과 연속 공백을 접어 버린다).
 * - 줄 앞 공백과 줄 끝 공백(공백만 있는 줄 포함)은 모두 &nbsp;
 * - 줄 가운데 2칸 이상 연속 공백은 마지막 하나만 일반 공백으로 남겨(단어 사이에서 줄이 바뀔 수 있게) 나머지를 &nbsp;
 * - 줄 가운데 공백 한 칸은 일반 공백 그대로
 * - 줄바꿈은 <br>
 * - 줄바꿈으로 끝나는 값의 마지막 빈 줄은 &nbsp; — HTML 은 블록 끝의 <br> 뒤에 줄을 그리지 않으므로
 *   ("본문\n" → 본문 + 빈 줄, "\n\n" → 빈 줄 3개: 캔버스와 같은 줄 수)
 */
export function whitespaceHtml(value: string): string {
  const lines = normalizeText(value)
    .split('\n')
    .map((line) =>
      escapeHtml(line)
        .replace(/^ +| +$/g, (m) => '&nbsp;'.repeat(m.length))
        .replace(/ {2,}/g, (m) => `${'&nbsp;'.repeat(m.length - 1)} `),
    )
  if (lines.length > 1 && lines[lines.length - 1] === '') lines[lines.length - 1] = '&nbsp;'
  return lines.join('<br>')
}

/** 비어 있는 칸인가: 빈 문자열만. 공백·줄바꿈만 있는 값도 사용자가 넣은 내용으로 본다 */
export function isEmptyField(value: string | undefined): boolean {
  return !value
}

/** 모든 변의 테두리를 없앤다 (Roll20 기본 표 테두리 덮기) */
const NO_BORDER = 'border-top:0px none;border-right:0px none;border-bottom:0px none;border-left:0px none;'
const TABLE_ATTRS = 'cellpadding="0" cellspacing="0" border="0"'
const TABLE_RESET = 'border-collapse:collapse;border-spacing:0;'

interface Ctx {
  look: HandoutLook
  content: HandoutContent
  depth: number
  align: Align
}

function fieldHtml(ctx: Ctx, key: string): string | null {
  const value = ctx.content.fields[key] ?? ''
  const def = ctx.look.template.fields.find((f) => f.key === key)
  if (isEmptyField(value)) return def?.optional ? null : '&nbsp;'
  // 공백·줄바꿈만 있는 값도 그대로 그린다 (&nbsp; · <br> 로 자리를 지킨다)
  return whitespaceHtml(value)
}

function paragraph(css: string, html: string): string {
  return `<p style="${NO_BORDER}${css}">${html}</p>`
}

function render(blocks: Block[], ctx: Ctx): string {
  return blocks.map((block) => renderBlock(block, ctx)).join('')
}

function renderBlock(block: Block, ctx: Ctx): string {
  const { look } = ctx
  const c = look.colors
  switch (block.kind) {
    case 'frame': {
      const align = block.align ?? ctx.align
      const width = ctx.depth === 0 ? `${look.template.width}px` : '100%'
      const widthAttr = ctx.depth === 0 ? String(look.template.width) : '100%'
      let outer = TABLE_RESET + inline(frameOuterCss(look, width, block.border))
      if (ctx.depth === 0)
        outer += `font-family:${look.fontStack};font-size:16px;font-weight:400;line-height:normal;color:${c.text};`
      const inner = NO_BORDER + inline(frameInnerCss(look, block.padding, align, block.borderBottom))
      const children = render(block.children, { ...ctx, depth: ctx.depth + 1, align })
      return (
        `<table width="${widthAttr}" ${TABLE_ATTRS} align="center" bgcolor="${c.paper}" style="${outer}"><tbody><tr>` +
        `<td align="${align}" bgcolor="${c.paper}" style="${inner}">${children}</td></tr></tbody></table>`
      )
    }
    case 'field': {
      const html = fieldHtml(ctx, block.field)
      if (html === null) return ''
      return paragraph(inline(textCss(block.style, look, ctx.align)), html)
    }
    case 'text': {
      const css = textCss(block.style, look, ctx.align)
      const html = whitespaceHtml(block.text)
      return paragraph(inline(css), block.style.boxed ? `<span style="${inline(boxedCss(block.style, look))}">${html}</span>` : html)
    }
    case 'rule': {
      const color = c[block.color]
      return (
        `<table width="${block.widthPercent}%" ${TABLE_ATTRS} align="center" style="${TABLE_RESET}margin:${block.marginTop ?? 0}px auto ${block.marginBottom ?? 0}px;width:${block.widthPercent}%;">` +
        `<tbody><tr><td height="1" bgcolor="${color}" style="${NO_BORDER}padding:0;height:1px;line-height:1px;font-size:1px;background-color:${color};">&nbsp;</td></tr></tbody></table>`
      )
    }
    case 'image': {
      const image = renderableImage(ctx.content.image)
      if (!image) return ''
      return paragraph(
        `margin:0 0 ${block.marginBottom}px;padding:0;text-align:center;line-height:0;`,
        `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" width="${block.maxWidth}" style="${inline(imageCss(block.maxWidth))}">`,
      )
    }
    case 'seal': {
      const ring = c[block.ring]
      const html = fieldHtml(ctx, block.field) ?? '&nbsp;'
      const text = inline(textCss(block.style, look, 'center'))
      return (
        `<table width="${block.size}" ${TABLE_ATTRS} align="center" style="border-collapse:separate;border-spacing:0;margin:0 auto;width:${block.size}px;">` +
        `<tbody><tr><td width="${block.size}" height="${block.size}" align="center" valign="middle" style="${inline(sealCss(block.size, ring))}${text}">${html}</td></tr></tbody></table>`
      )
    }
    case 'meta': {
      const text = textCss(block.style, look, 'left')
      const cell = `${NO_BORDER}border-bottom:1px dashed ${c[block.lineColor]};padding:6px 0;vertical-align:top;`
      const rows = block.rows
        .map(
          (row) =>
            // 글자 스타일(여백 0) 다음에 칸 스타일을 적어 칸의 위아래 여백이 남게 한다
            `<tr><td width="32%" valign="top" style="${inline({ ...text, color: c[block.labelColor] })}${cell}">${whitespaceHtml(row.label)}</td>` +
            `<td valign="top" style="${inline(text)}${cell}">${fieldHtml(ctx, row.field) ?? '&nbsp;'}</td></tr>`,
        )
        .join('')
      return `<table width="100%" ${TABLE_ATTRS} style="${TABLE_RESET}margin:0;width:100%;"><tbody>${rows}</tbody></table>`
    }
    case 'split':
      return (
        `<table width="100%" ${TABLE_ATTRS} style="${TABLE_RESET}margin:0;width:100%;"><tbody><tr>` +
        `<td align="left" valign="middle" style="${NO_BORDER}padding:0;text-align:left;vertical-align:middle;">${render(block.left, { ...ctx, align: 'left' })}</td>` +
        `<td align="right" valign="middle" style="${NO_BORDER}padding:0;text-align:right;vertical-align:middle;">${render(block.right, { ...ctx, align: 'right' })}</td>` +
        `</tr></tbody></table>`
      )
    case 'aside': {
      const bar = c[block.bar]
      return (
        `<table width="100%" ${TABLE_ATTRS} style="${TABLE_RESET}margin:0;width:100%;"><tbody><tr>` +
        `<td width="${block.barWidth}" bgcolor="${bar}" style="${NO_BORDER}padding:0;width:${block.barWidth}px;background-color:${bar};font-size:1px;line-height:1px;">&nbsp;</td>` +
        `<td style="${NO_BORDER}padding:0 0 0 ${block.gap}px;">${render(block.children, { ...ctx, align: 'left' })}</td>` +
        `</tr></tbody></table>`
      )
    }
  }
}

/** Roll20 핸드아웃 내용 칸에 붙여 넣을 HTML (text/html) */
export function roll20Html(content: HandoutContent): string {
  const look = resolveLook(content)
  return render(look.template.blocks, { look, content, depth: 0, align: 'center' })
}

function textRows(blocks: Block[], content: HandoutContent, rows: string[]): string[] {
  for (const block of blocks) {
    switch (block.kind) {
      case 'frame':
      case 'aside':
        textRows(block.children, content, rows)
        break
      case 'split':
        textRows(block.left, content, rows)
        textRows(block.right, content, rows)
        break
      case 'field':
      case 'seal':
        rows.push(content.fields[block.field] ?? '')
        break
      case 'text':
        rows.push(block.text)
        break
      case 'rule':
        rows.push('────────')
        break
      case 'image': {
        const image = renderableImage(content.image)
        if (image) rows.push(`[이미지${image.alt ? `: ${image.alt}` : ''}] ${image.url}`)
        break
      }
      case 'meta':
        rows.push(block.rows.map((row) => `${row.label}: ${content.fields[row.field] ?? ''}`).join('\n'))
        break
    }
  }
  return rows
}

/** 서식을 받지 않는 곳에 붙여 넣을 때 쓰는 평문 (text/plain) */
export function roll20Text(content: HandoutContent): string {
  const look = resolveLook(content)
  // HTML 과 같은 규칙: 빈 문자열인 칸만 빼고, 공백·줄바꿈만 있는 칸과 줄 끝 공백은 그대로 둔다
  return textRows(look.template.blocks, content, [])
    .map(normalizeText)
    .filter((row) => !isEmptyField(row))
    .join('\n\n')
}

/** "HTML 파일 저장" 용 단독 문서. 본문은 Roll20 용 마크업 그대로다 */
export function handoutDocumentHtml(content: HandoutContent, title: string): string {
  return [
    '<!doctype html>',
    '<html lang="ko">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title || '핸드아웃')}</title>`,
    '</head>',
    '<body style="margin:0;padding:40px 16px;background-color:#f4f1ea;">',
    roll20Html(content),
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

/** 다운로드 파일 이름: 파일 이름에 못 쓰는 글자를 빼고, 비면 folio-handout */
export function handoutFileName(title: string): string {
  const base = Array.from(title)
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || 'folio-handout'}.html`
}
