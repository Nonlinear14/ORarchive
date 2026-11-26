/**
 * 블록 → CSS 속성 계산. React 캔버스(style 객체)와 Roll20 HTML(인라인 style 문자열)이 같은 값을 쓰도록
 * 여기 한 곳에서 계산한다. 값은 모두 문자열 (React 는 그대로, Roll20 은 kebab-case 로 바꿔 쓴다).
 */
import { MONO_STACK } from './model'
import type { HandoutLook } from './templates'
import type { BorderSpec, TextStyle } from './templates/types'

export type Css = Record<string, string>
export type Align = 'left' | 'center' | 'right'

const px = (n: number) => `${n}px`

export function borderValue(spec: BorderSpec, look: HandoutLook): string {
  return `${spec.width}px ${spec.style ?? 'solid'} ${look.colors[spec.color]}`
}

/** 글자 블록 (머리말·제목·본문·장식 글자) */
export function textCss(style: TextStyle, look: HandoutLook, inherited: Align): Css {
  return {
    marginTop: px(style.marginTop ?? 0),
    marginRight: '0',
    marginBottom: px(style.marginBottom ?? 0),
    marginLeft: '0',
    padding: '0',
    fontFamily: style.mono ? MONO_STACK : look.fontStack,
    fontSize: px(style.size),
    fontWeight: style.bold ? '700' : '400',
    fontStyle: style.italic ? 'italic' : 'normal',
    letterSpacing: px(style.letterSpacing ?? 0),
    lineHeight: String(style.lineHeight ?? 1.4),
    color: look.colors[style.color],
    textAlign: style.align ?? inherited,
    wordBreak: 'keep-all',
  }
}

/** 도장처럼 테두리를 두른 글자 (boxed) */
export function boxedCss(style: TextStyle, look: HandoutLook): Css {
  return {
    display: 'inline-block',
    padding: '3px 8px',
    border: `2px solid ${look.colors[style.color]}`,
    lineHeight: '1.4',
  }
}

/** 상자(frame)의 바깥 표/블록 */
export function frameOuterCss(look: HandoutLook, width: string, border?: BorderSpec): Css {
  const css: Css = {
    margin: '0 auto',
    backgroundColor: look.colors.paper,
    boxSizing: 'border-box',
    width,
    maxWidth: '100%',
  }
  if (border) css.border = borderValue(border, look)
  return css
}

/** 상자(frame)의 안쪽 칸 */
export function frameInnerCss(look: HandoutLook, padding: string, align: Align, borderBottom?: BorderSpec): Css {
  const css: Css = { padding, backgroundColor: look.colors.paper, textAlign: align }
  if (borderBottom) css.borderBottom = borderValue(borderBottom, look)
  return css
}

export function sealCss(size: number, ring: string): Css {
  return {
    width: px(size),
    height: px(size),
    padding: '0',
    border: `3px double ${ring}`,
    borderRadius: '50%',
    textAlign: 'center',
    verticalAlign: 'middle',
  }
}

export function imageCss(maxWidth: number): Css {
  return {
    display: 'inline-block',
    width: '100%',
    maxWidth: px(maxWidth),
    height: 'auto',
    margin: '0',
    padding: '0',
    border: '0 none',
    verticalAlign: 'top',
  }
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** Css → 인라인 style 문자열 (Roll20) */
export function inline(css: Css): string {
  return Object.entries(css)
    .map(([key, value]) => `${kebab(key)}:${value};`)
    .join('')
}
