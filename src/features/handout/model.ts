/**
 * 핸드아웃 문서(documents.type = 'handout')의 content 모델.
 *
 * 저장된 content 와 보기(HandoutContent)를 나눈다.
 * - 저장된 content (documents.content, jsonb): 서버·다른 기기·이전 단계(Phase 1 의 `{ text }`)에서 온 그대로 둔다.
 *   편집은 edits.ts 의 연산이 저장된 content 를 얕게 복사해 사용자가 고친 경로만 바꾼다 — 고치지 않은 값은
 *   표기(#ABC · 대문자 호스트 · 앞뒤 공백)도, 이 버전이 모르는 키도, 쓸 수 없는 값도 한 글자도 바뀌지 않는다.
 * - 보기 (HandoutContent): 저장된 content 를 검사·정규화한 값. 어떤 값이 와도 parseHandoutContent 가 깨지지 않고 만들며,
 *   템플릿에 맞추는 일(테마·이전 형식의 기본 문구)은 templates/index.ts 의 resolveHandout 가 한다.
 *   화면·Roll20 출력은 보기만 쓰고, 보기는 기존 문서에 다시 저장하지 않는다.
 */
import type { Json } from '../../lib/database.types'
import type { DocumentContent } from '../../lib/documents'

export const HANDOUT_CONTENT_VERSION = 1

export const templateIds = ['moonlit', 'casefile', 'order', 'forest'] as const
export type TemplateId = (typeof templateIds)[number]
export const DEFAULT_TEMPLATE_ID: TemplateId = 'moonlit'

export const fontChoices = ['serif', 'sans', 'hand'] as const
export type FontChoice = (typeof fontChoices)[number]

/** 외부 글꼴 없이 시스템 글꼴만 쓰는 대체 글꼴 목록 (Roll20 을 보는 사람의 컴퓨터에서도 같은 목록으로 고른다) */
export const fontStacks: Record<FontChoice, string> = {
  serif: "Georgia, 'Times New Roman', 'Batang', 'AppleMyungjo', 'Noto Serif KR', 'Malgun Gothic', serif",
  sans: "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Helvetica Neue', Arial, sans-serif",
  hand: "'Segoe Print', 'Bradley Hand', 'Nanum Pen Script', 'Comic Sans MS', 'Malgun Gothic', cursive",
}
export const MONO_STACK = "'Courier New', Courier, 'D2Coding', 'Malgun Gothic', monospace"

export const fontLabels: Record<FontChoice, string> = { serif: '세리프', sans: '산세리프', hand: '손글씨' }

export interface HandoutImage {
  /** 공개 https 주소만 허용 (Roll20 은 공개된 https 이미지만 보여 준다) */
  url: string
  alt: string
}

export interface HandoutStyle {
  /** 강조 색 '#rrggbb'. 없으면 테마 기본값 */
  accent?: string
  /** 없으면 템플릿 기본 글꼴 */
  font?: FontChoice
}

/**
 * 핸드아웃의 보기: 저장된 content 를 검사·정규화한 값 (색은 '#rrggbb', 이미지는 검사한 https 주소, 쓸 수 없는 값은 빠짐).
 * 화면·출력에만 쓴다. 기존 문서의 편집을 저장할 때 이것을 직렬화하면 안 된다 — 저장된 값이 정규화되어 바뀐다 (edits.ts 를 쓴다).
 */
export interface HandoutContent {
  v: typeof HANDOUT_CONTENT_VERSION
  templateId: TemplateId
  /** 템플릿마다 고를 수 있는 테마 id */
  theme: string
  /** 필드 key → 사용자가 입력한 글자 (평문, 줄바꿈은 \n) */
  fields: Record<string, string>
  style: HandoutStyle
  image: HandoutImage | null
}

/**
 * 한 칸의 권장 최대 글자 수. 저장·불러오기에서 자르지 않는다(사용자 글은 절대 잃지 않는다).
 * 넘으면 스튜디오가 경고만 보여 준다 — documents.content(jsonb) 에는 크기 제한이 없다.
 */
export const RECOMMENDED_FIELD_LENGTH = 20_000
export const MAX_ALT_LENGTH = 200
export const MAX_URL_LENGTH = 2048
const FIELD_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,23}$/

type JsonObject = { [key: string]: Json | undefined }

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && (templateIds as readonly string[]).includes(value)
}

export function isFontChoice(value: unknown): value is FontChoice {
  return typeof value === 'string' && (fontChoices as readonly string[]).includes(value)
}

/** '#abc' / '#aabbcc' (앞뒤 공백·# 생략 허용) → '#aabbcc'. 아니면 null */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(raw))
    return `#${raw
      .split('')
      .map((c) => c + c)
      .join('')
      .toLowerCase()}`
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`
  return null
}

export type ImageUrlCheck = { ok: true; url: string } | { ok: false; error: string }

/** 이미지 주소 검사: 공개 https URL 만 받는다 (data:, http:, javascript:, 계정 정보 포함 주소 거부) */
export function validateImageUrl(input: string): ImageUrlCheck {
  const value = input.trim()
  if (!value) return { ok: false, error: '이미지 주소를 입력해 주세요.' }
  if (value.length > MAX_URL_LENGTH) return { ok: false, error: '주소가 너무 길어요.' }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, error: '올바른 주소가 아니에요. https:// 로 시작하는 전체 주소를 넣어 주세요.' }
  }
  if (url.protocol !== 'https:')
    return { ok: false, error: 'https:// 로 시작하는 공개 이미지 주소만 쓸 수 있어요. (Roll20 은 https 이미지만 보여 줘요)' }
  if (url.username || url.password) return { ok: false, error: '계정 정보가 들어 있는 주소는 쓸 수 없어요.' }
  if (!url.hostname.includes('.')) return { ok: false, error: '공개된 인터넷 주소만 쓸 수 있어요.' }
  return { ok: true, url: url.href }
}

/**
 * 그려도 되는 이미지: 주소가 공개 https 일 때만, 아니면 null.
 * resolveHandout 의 보기는 이미 검사한 값이지만, 캔버스·Roll20 출력도 한 번 더 막는다 (직접 만든 보기가 와도 위험한 주소는 그리지 않는다)
 */
export function renderableImage(image: HandoutImage | null): HandoutImage | null {
  return image && validateImageUrl(image.url).ok ? image : null
}

// 아래 parse* 는 보기를 만든다. 쓸 수 없는 값은 보기에서만 빠지고, 저장된 content 에는 그대로 남는다

function parseFields(raw: Json | undefined): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!isObject(raw)) return fields
  for (const [key, value] of Object.entries(raw)) {
    if (FIELD_KEY.test(key) && typeof value === 'string') fields[key] = value
  }
  return fields
}

function parseStyle(raw: Json | undefined): HandoutStyle {
  const style: HandoutStyle = {}
  if (!isObject(raw)) return style
  const accent = normalizeHex(raw.accent)
  if (accent) style.accent = accent
  if (isFontChoice(raw.font)) style.font = raw.font
  return style
}

function parseImage(raw: Json | undefined): HandoutImage | null {
  if (!isObject(raw) || typeof raw.url !== 'string') return null
  const check = validateImageUrl(raw.url)
  if (!check.ok) return null
  // 길이 제한(MAX_ALT_LENGTH)은 입력할 때만 건다 — 이미 저장된 글은 자르지 않는다
  const alt = typeof raw.alt === 'string' ? raw.alt : ''
  return { url: check.url, alt }
}

export interface ParsedHandout {
  content: HandoutContent
  /**
   * 핸드아웃 형식으로 저장된 적이 없는 내용(빈 `{}` 이나 Phase 1 의 `{ text }`).
   * 이 경우 저장된 적 없는 칸만 템플릿 기본 문구로 채워 보여 준다 — 이전 본문 text 는 빈 문자열("")이라도 본문이다
   * (첫 편집 때 edits.ts 가 이 모습 그대로 핸드아웃 형식으로 옮긴다).
   */
  legacy: boolean
}

function asObject(raw: DocumentContent | Json | null | undefined): JsonObject {
  return isObject(raw ?? undefined) ? (raw as JsonObject) : {}
}

/** 핸드아웃 형식(템플릿·칸)으로 저장된 content 인가. 아니면 legacy (`{}` · Phase 1 의 `{ text }` · 형식이 다른 값) */
export function isStructuredHandout(raw: DocumentContent | Json | null | undefined): boolean {
  const obj = asObject(raw)
  return isTemplateId(obj.templateId) || isObject(obj.fields)
}

/**
 * 저장된 content 를 보기(HandoutContent)로 읽는다. 저장된 content 는 읽기만 하고, 어떤 입력에도 예외를 던지지 않는다.
 * - `{}` / 형식이 다른 값 → 기본 템플릿, 빈 필드 (legacy)
 * - `{ text }` (Phase 1 기본 편집기) → 본문(body)으로 보여 준다 (legacy). 빈 문자열도 그대로 빈 본문이다 — 기본 문구로 바꾸지 않는다
 * - 쓸 수 없는 값(잘못된 색·글꼴·이미지 주소, 문자열이 아닌 필드)은 보기에서만 뺀다 — 저장된 값은 그대로 남는다
 * - 쓸 수 있는 색·이미지 주소는 정규화한다 ('#ABC' → '#aabbcc', 주소 → URL.href). 이것도 보기에서만이다
 * - 글자(필드 · 이전 본문)는 길이와 상관없이 자르지 않는다
 */
export function parseHandoutContent(raw: DocumentContent | Json | null | undefined): ParsedHandout {
  const obj = asObject(raw)
  const structured = isStructuredHandout(obj)
  const fields = parseFields(obj.fields)
  // 이전 본문은 길이와 상관없이 한 글자도 바꾸지 않고 옮긴다. 빈 문자열("")도 사용자가 저장한 본문이다 —
  // 문자열이면 무엇이든 옮겨야 resolveHandout 가 기본 문구로 채우지 않는다 (빈 칸 + placeholder, 첫 편집 때도 "" 로 저장)
  if (!structured && typeof obj.text === 'string') fields.body = obj.text

  return {
    legacy: !structured,
    content: {
      v: HANDOUT_CONTENT_VERSION,
      templateId: isTemplateId(obj.templateId) ? obj.templateId : DEFAULT_TEMPLATE_ID,
      theme: typeof obj.theme === 'string' ? obj.theme : '',
      fields,
      style: parseStyle(obj.style),
      image: parseImage(obj.image),
    },
  }
}

/**
 * 보기 → 새 문서의 documents.content JSON (undefined 값은 넣지 않는다).
 * 새 핸드아웃을 만들 때(newHandoutDocument)만 쓴다. 기존 문서의 편집을 이것으로 저장하면 보기의 정규화된 값이
 * 저장된 값을 덮고 알 수 없는 키가 사라진다 — 편집은 edits.ts 의 연산으로 저장된 content 를 고친다.
 */
export function serializeHandout(content: HandoutContent): DocumentContent {
  const style: JsonObject = {}
  if (content.style.accent) style.accent = content.style.accent
  if (content.style.font) style.font = content.style.font
  return {
    v: content.v,
    templateId: content.templateId,
    theme: content.theme,
    fields: { ...content.fields },
    style,
    image: content.image ? { url: content.image.url, alt: content.image.alt } : null,
  }
}

export interface OversizedField {
  key: string
  length: number
}

/** 권장 글자 수(RECOMMENDED_FIELD_LENGTH)를 넘는 칸들. 내용은 바꾸지 않고 경고에만 쓴다 */
export function oversizedFields(content: HandoutContent, limit = RECOMMENDED_FIELD_LENGTH): OversizedField[] {
  return Object.entries(content.fields)
    .filter(([, value]) => value.length > limit)
    .map(([key, value]) => ({ key, length: value.length }))
}
