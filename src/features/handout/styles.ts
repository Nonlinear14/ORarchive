/** 블록 → CSS 값 모음의 형식과, Roll20 용 인라인 style 문자열 만들기 (계산은 blockStyles.ts) */
export type Css = Record<string, string>

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** Css → 인라인 style 문자열 (Roll20) */
export function inline(css: Css): string {
  return Object.entries(css)
    .map(([key, value]) => `${kebab(key)}:${value};`)
    .join('')
}
