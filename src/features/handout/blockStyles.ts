/**
 * 블록 → CSS. 편집 화면(React style)과 Roll20 복사(인라인 style 문자열)가 같은 값을 쓰도록 한 곳에서 계산한다.
 */
import { BLOCK_FONT_STACK, type Align, type FrameBox, type TextBlockStyle } from './layout'
import type { Css } from './styles'

const px = (n: number) => `${n}px`

/** 블록을 감싸는 칸: 여백·정렬 */
export function blockBoxCss(style: { marginTop?: number; marginBottom?: number }, align: Align): Css {
  return {
    marginTop: px(style.marginTop ?? 0),
    marginRight: '0',
    marginBottom: px(style.marginBottom ?? 0),
    marginLeft: '0',
    padding: '0',
    textAlign: align,
  }
}

/** 글자 */
export function textCss(style: TextBlockStyle): Css {
  return {
    margin: '0',
    padding: '0',
    fontFamily: BLOCK_FONT_STACK,
    fontSize: px(style.size),
    fontWeight: style.bold ? '700' : '400',
    fontStyle: style.italic ? 'italic' : 'normal',
    letterSpacing: px(style.letterSpacing ?? 0),
    lineHeight: String(style.lineHeight ?? 1.5),
    color: style.color,
    wordBreak: 'keep-all',
  }
}

/** 도장 글자 (boxed) */
export function boxedCss(style: TextBlockStyle): Css {
  return { display: 'inline-block', padding: '3px 8px', border: `2px solid ${style.color}` }
}

/** 원형 인장 */
export function sealCss(seal: NonNullable<TextBlockStyle['seal']>): Css {
  return {
    width: px(seal.size),
    height: px(seal.size),
    padding: '0',
    border: `3px double ${seal.ring}`,
    borderRadius: '50%',
    textAlign: 'center',
    verticalAlign: 'middle',
  }
}

/** 이미지: 항상 블록 너비를 꽉 채우고 높이는 원본 비율 */
export function imageCss(): Css {
  return {
    display: 'block',
    width: '100%',
    maxWidth: '100%',
    height: 'auto',
    margin: '0',
    padding: '0',
    border: '0 none',
    verticalAlign: 'top',
  }
}

/** 구분선 상자: 길이(px) · 굵기(px) · 가운데 (조각은 lineSegments 로 그린다) */
export function ruleBoxCss(length: number, thickness: number): Css {
  return { width: px(length), maxWidth: '100%', height: px(thickness), margin: '0 auto', display: 'flex', overflow: 'hidden', fontSize: '0', lineHeight: '0' }
}

/** 바깥 틀 한 겹 */
export function frameCss(frame: FrameBox, background: string, width?: number): Css {
  const css: Css = { padding: frame.padding, backgroundColor: background, boxSizing: 'border-box' }
  if (width) {
    css.width = px(width)
    css.maxWidth = '100%'
    css.margin = '0 auto'
  }
  return css
}
