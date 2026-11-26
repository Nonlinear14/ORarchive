/**
 * 미리보기(뷰어)에서만 쓰는 글꼴: Pretendard 웹폰트.
 * 내보내기(HTML 파일 · 블로그용 코드)에는 넣지 않는다 — 화면에 "현재 화면의 글꼴은 뷰어에만 적용됩니다" 안내가 있다.
 * @font-face 는 그림자 DOM 안에서 적용되지 않으므로 문서 <head> 에 한 번만 넣는다.
 */
const W = [
  [100, 'Thin'],
  [200, 'ExtraLight'],
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'SemiBold'],
  [700, 'Bold'],
  [800, 'ExtraBold'],
  [900, 'Black'],
] as const

export const PRETENDARD_FONT_FACES = [
  ...W.map(
    ([weight, name]) =>
      `@font-face{font-family:'Pretendard';src:url('https://cdn.jsdelivr.net/gh/projectnoonnu/pretendard@1.0/Pretendard-${name}.woff2') format('woff2');font-weight:${weight};font-display:swap}`,
  ),
  `@font-face{font-family:'PretendardVariable';src:url('https://cdn.jsdelivr.net/gh/Project-Noonnu/2611030106@font-variable-694/variable-694/PretendardVariable.woff2') format('woff2');font-weight:45 930;font-display:swap}`,
].join('\n')

/** 미리보기 안의 모든 글자를 Pretendard 로 (그림자 DOM 의 <style> 에 넣는다) */
export const VIEWER_FONT_CSS = `.textchatcontainer,.textchatcontainer *{font-family:'Pretendard','PretendardVariable','Apple SD Gothic Neo','Malgun Gothic',sans-serif!important}`

const STYLE_ID = 'folio-viewer-fonts'

export function ensureViewerFonts(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = PRETENDARD_FONT_FACES
  document.head.append(style)
}
