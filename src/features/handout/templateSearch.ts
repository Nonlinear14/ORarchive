import type { HandoutTemplate } from './templates'

/** 검색어가 이름·분류·설명 중 하나에 들어 있으면 보인다 (대소문자·공백 무시) */
export function matchesTemplate(template: HandoutTemplate, query: string): boolean {
  const normalize = (text: string) => text.toLocaleLowerCase('ko-KR').replace(/\s+/g, '')
  const needle = normalize(query)
  if (!needle) return true
  return [template.name, template.kind, template.description, ...template.categories].some((text) =>
    normalize(text).includes(needle),
  )
}
