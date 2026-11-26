import type { DocumentContent } from '../../../lib/documents'
import {
  DEFAULT_TEMPLATE_ID,
  fontStacks,
  HANDOUT_CONTENT_VERSION,
  isFontChoice,
  normalizeHex,
  parseHandoutContent,
  serializeHandout,
  type FontChoice,
  type HandoutContent,
  type TemplateId,
} from '../model'
import { casefile } from './casefile'
import { forest } from './forest'
import { moonlit } from './moonlit'
import { order } from './order'
import type { HandoutTemplate, ThemeColors, ThemeDef } from './types'

export type { Block, FieldDef, HandoutTemplate, TemplateCategory, TextStyle, ThemeColors, ThemeDef } from './types'
export { templateCategories } from './types'

export const handoutTemplates: HandoutTemplate[] = [moonlit, casefile, order, forest]

const byId = new Map<TemplateId, HandoutTemplate>(handoutTemplates.map((t) => [t.id, t]))

export function getTemplate(id: TemplateId): HandoutTemplate {
  return byId.get(id) ?? moonlit
}

/** 강조 색 팔레트 (직접 입력한 hex 도 받는다) */
export const accentPalette: { color: string; label: string }[] = [
  { color: '#9c795f', label: '고서 갈색' },
  { color: '#b8975a', label: '금박' },
  { color: '#9b3b2f', label: '봉랍 빨강' },
  { color: '#5f7f4f', label: '이끼 초록' },
  { color: '#4f6d8a', label: '잉크 파랑' },
  { color: '#7a5a8c', label: '라벤더 보라' },
]

function defaultFields(template: HandoutTemplate): Record<string, string> {
  return Object.fromEntries(template.fields.map((f) => [f.key, f.defaultText]))
}

/** 템플릿 기본 문구로 새 핸드아웃 내용을 만든다 */
export function createHandoutContent(templateId: TemplateId = DEFAULT_TEMPLATE_ID): HandoutContent {
  const template = getTemplate(templateId)
  return {
    v: HANDOUT_CONTENT_VERSION,
    templateId: template.id,
    theme: template.themes[0].id,
    fields: defaultFields(template),
    style: {},
    image: null,
  }
}

/** 새 핸드아웃 문서의 제목과 content (repo.create 에 그대로 넘긴다) */
export function newHandoutDocument(templateId: TemplateId = DEFAULT_TEMPLATE_ID): { title: string; content: DocumentContent } {
  const content = createHandoutContent(templateId)
  return { title: content.fields.title || getTemplate(templateId).name, content: serializeHandout(content) }
}

export function themeOf(template: HandoutTemplate, themeId: string): ThemeDef {
  return template.themes.find((t) => t.id === themeId) ?? template.themes[0]
}

/**
 * 저장된 content → 화면·출력에 쓰는 보기. 저장된 content 는 읽기만 하고 바꾸지 않는다.
 * 쓸 수 없는 값은 보기에서만 기본값으로 바꾼다 (저장된 값은 그대로 남아, 편집 때도 건드리지 않는다).
 * - 색·이미지 주소는 검사·정규화한 값, 잘못된 색·글꼴·이미지는 테마 기본값·템플릿 기본 글꼴·이미지 없음
 * - 알 수 없는 템플릿은 기본 템플릿, 템플릿에 없는 테마는 첫 테마
 * - 핸드아웃 형식이 아니던 내용(legacy)은 저장된 적 없는 칸만 템플릿 기본 문구로 채운다.
 *   저장된 글은 빈 문자열("")이라도 그대로다 (Phase 1 의 `{ text: "" }` 는 빈 본문 — 기본 본문으로 채우지 않는다)
 * - 템플릿에 없는 필드도 지우지 않고 그대로 둔다 (화면·출력에는 쓰지 않음)
 */
export function resolveHandout(stored: DocumentContent): HandoutContent {
  const { content, legacy } = parseHandoutContent(stored)
  const template = getTemplate(content.templateId)
  const fields = legacy ? { ...defaultFields(template), ...content.fields } : content.fields
  return { ...content, theme: themeOf(template, content.theme).id, fields }
}

/** resolveHandout 의 이전 이름 */
export const readHandout = resolveHandout

export interface HandoutLook {
  template: HandoutTemplate
  theme: ThemeDef
  colors: ThemeColors
  font: FontChoice
  fontStack: string
}

/**
 * 템플릿 + 테마 + 사용자 스타일(강조 색·글꼴)을 합친 최종 모양.
 * 보기의 색·글꼴은 이미 검사한 값이지만 여기서도 다시 검사한다 — 인라인 스타일에는 '#rrggbb' 와 정해진 글꼴 목록만 들어간다
 */
export function resolveLook(content: HandoutContent): HandoutLook {
  const template = getTemplate(content.templateId)
  const theme = themeOf(template, content.theme)
  const font = isFontChoice(content.style.font) ? content.style.font : template.defaultFont
  const accent = normalizeHex(content.style.accent)
  const colors = accent ? { ...theme.colors, accent } : theme.colors
  return { template, theme, colors, font, fontStack: fontStacks[font] }
}

export function fieldValue(content: HandoutContent, key: string): string {
  return content.fields[key] ?? ''
}
