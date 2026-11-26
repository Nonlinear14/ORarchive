/**
 * 저장된 핸드아웃 content 를 고치는 연산 (스튜디오의 모든 편집이 여기를 거친다).
 *
 * 연산은 저장된 content 를 바꾸지 않고, 얕게 복사한 뒤 사용자가 고친 경로만 바꾼 새 content 를 돌려준다.
 * 고치지 않은 값은 저장된 그대로(같은 문자열, 같은 객체) 남는다 — 정규화하지 않은 표기(#ABC · 대문자 호스트 · 앞뒤 공백),
 * 이 버전이 모르는 키, 쓸 수 없는 값(화면·출력에서는 기본값으로 그림), 다른 템플릿의 숨은 칸, 버전 표시(v)까지.
 * 검사·정규화한 값은 resolveHandout(templates)의 보기에만 있고, 보기는 저장하지 않는다.
 *
 * 고친 값이 들어갈 자리가 객체가 아니면(예: 문자열인 fields · 배열인 style) 그 자리만 새 객체로 바꾼다 —
 * 객체가 아닌 값 안에는 하위 값을 넣을 수 없다. 이런 값은 보기에서도 이미 쓰지 않던 값이다.
 */
import type { Json } from '../../lib/database.types'
import type { DocumentContent } from '../../lib/documents'
import { HANDOUT_CONTENT_VERSION, isStructuredHandout, type FontChoice, type TemplateId } from './model'
import { getTemplate, resolveHandout } from './templates'

/** 저장된 content → 고친 content (저장된 content 는 그대로) */
export type HandoutEdit = (stored: DocumentContent) => DocumentContent

type JsonObject = { [key: string]: Json | undefined }

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 하위 값을 고칠 객체: 객체면 그대로, 아니면(없음 · 객체가 아닌 값) 빈 객체 */
function objectAt(value: Json | undefined): JsonObject {
  return isObject(value) ? value : {}
}

/**
 * 편집을 적용할 바탕. 핸드아웃 형식으로 저장된 content 는 그대로 쓴다.
 * 핸드아웃 형식이 아닌 content(legacy: `{}` · Phase 1 의 `{ text }`)는 첫 편집 때 핸드아웃 형식으로 옮긴다.
 * - 화면에 보이던 칸(저장된 적 없는 칸의 템플릿 기본 문구 + 이전 본문 text)을 그대로 fields 에 적는다 — 보이는 글은 한 글자도
 *   바뀌지 않는다. 이전 본문이 빈 문자열이면 body 도 "" (빈 칸으로 보이던 그대로 — 기본 본문을 지어 넣지 않는다)
 * - 없던 v · templateId 만 더한다 (있던 값은 쓸 수 없는 값이라도 그대로 — 화면은 기본 템플릿으로 그린다)
 * - 원래 있던 키는 바꾸거나 지우지 않는다. 이전 본문 text 도 그대로 남는다 (핸드아웃 형식이 되면 읽지 않는 사본)
 */
function editable(stored: DocumentContent): JsonObject {
  const base: JsonObject = isObject(stored) ? stored : {}
  if (isStructuredHandout(base)) return base
  const shown = resolveHandout(base)
  const migrated: JsonObject = { ...base }
  if (!Object.hasOwn(base, 'v')) migrated.v = HANDOUT_CONTENT_VERSION
  if (!Object.hasOwn(base, 'templateId')) migrated.templateId = shown.templateId
  migrated.fields = { ...shown.fields }
  return migrated
}

/** 칸 하나의 글 (fields[key]) */
export function setField(stored: DocumentContent, key: string, value: string): DocumentContent {
  const base = editable(stored)
  return { ...base, fields: { ...objectAt(base.fields), [key]: value } }
}

/** 테마 (theme) */
export function setTheme(stored: DocumentContent, theme: string): DocumentContent {
  return { ...editable(stored), theme }
}

/** 강조 색 (style.accent): 검사한 '#rrggbb', 또는 undefined 면 테마 기본값으로 — 저장된 accent 를 뺀다 */
export function setAccent(stored: DocumentContent, accent: string | undefined): DocumentContent {
  const base = editable(stored)
  if (accent !== undefined) return { ...base, style: { ...objectAt(base.style), accent } }
  if (!isObject(base.style) || !Object.hasOwn(base.style, 'accent')) return base
  const style = { ...base.style }
  delete style.accent
  return { ...base, style }
}

/** 글꼴 (style.font) */
export function setFont(stored: DocumentContent, font: FontChoice): DocumentContent {
  const base = editable(stored)
  return { ...base, style: { ...objectAt(base.style), font } }
}

/** 이미지에서 사용자가 고친 부분. url 은 validateImageUrl 로 검사한 주소 */
export interface ImagePatch {
  url?: string
  alt?: string
}

/** 이미지 넣기 · 바꾸기: 고친 부분(image.url · image.alt)만 바꾼다 */
export function setImage(stored: DocumentContent, patch: ImagePatch): DocumentContent {
  const base = editable(stored)
  const image: JsonObject = { ...objectAt(base.image) }
  if (patch.url !== undefined) image.url = patch.url
  if (patch.alt !== undefined) image.alt = patch.alt
  return { ...base, image }
}

/** 이미지 빼기 */
export function removeImage(stored: DocumentContent): DocumentContent {
  return { ...editable(stored), image: null }
}

/**
 * 템플릿 바꾸기: templateId 를 바꾸고, 새 템플릿의 칸 가운데 저장된 적 없는 칸만 기본 문구로 더한다.
 * - 입력한 글은 한 칸도 지우거나 바꾸지 않는다. 새 템플릿에 없는 칸도 그대로 남아(숨은 칸) 그 칸이 있는 템플릿으로 돌아오면 다시 보인다
 * - 테마 · 강조 색 · 글꼴 · 이미지도 그대로 둔다. 저장된 테마가 새 템플릿에 없으면 화면 · 출력은 새 템플릿의 첫 테마로 그리고,
 *   그 테마가 있는 템플릿으로 돌아오면 다시 그 테마로 보인다
 */
export function switchTemplate(stored: DocumentContent, templateId: TemplateId): DocumentContent {
  const base = editable(stored)
  const template = getTemplate(templateId)
  const fields = objectAt(base.fields)
  const added = template.fields.filter((field) => !Object.hasOwn(fields, field.key))
  return {
    ...base,
    templateId: template.id,
    fields: { ...fields, ...Object.fromEntries(added.map((field) => [field.key, field.defaultText])) },
  }
}
