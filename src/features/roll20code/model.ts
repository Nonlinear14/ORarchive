import type { DocumentContent } from '../../lib/documents'

/**
 * 롤꾸코드 문서 (type: 'roll20code').
 * 롤꾸 = Roll20 채팅의 링크 문법 [글자](#" style="…") 에 인라인 스타일을 끼워 넣어 꾸민 메시지.
 * 저장하는 것은 원본 코드 한 덩어리와 출처뿐이고, 글자 칸 · 색 목록은 코드를 읽어 그때그때 만든다
 * (코드를 직접 고쳐도 칸이 어긋나지 않게). 줄바꿈으로 여러 메시지를 담을 수 있게 code 는 여러 줄을 허용한다.
 */
export const ROLL20_CODE_FORMAT = 'roll20-code'
export const ROLL20_CODE_VERSION = 1

export interface Roll20CodeContent {
  format: typeof ROLL20_CODE_FORMAT
  v: number
  /** Roll20 채팅에 보낼 원본 코드 (?{질문|…} 매크로 질문을 담을 수 있다) */
  code: string
  /** 만든 사람 · 출처 (선택) */
  source?: { name?: string; link?: string }
}

export function isRoll20Code(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && (raw as { format?: unknown }).format === ROLL20_CODE_FORMAT
}

/** 저장 값 → 화면용 보기 (모르는 값은 기본값으로, 저장 값은 바꾸지 않는다) */
export function resolveRoll20Code(raw: unknown): Roll20CodeContent {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const source = obj.source && typeof obj.source === 'object' ? (obj.source as Record<string, unknown>) : undefined
  return {
    format: ROLL20_CODE_FORMAT,
    v: ROLL20_CODE_VERSION,
    code: typeof obj.code === 'string' ? obj.code : '',
    ...(source
      ? {
          source: {
            ...(typeof source.name === 'string' ? { name: source.name } : {}),
            ...(typeof source.link === 'string' ? { link: source.link } : {}),
          },
        }
      : {}),
  }
}

export function roll20CodeContent(code: string, source?: Roll20CodeContent['source']): DocumentContent {
  return { format: ROLL20_CODE_FORMAT, v: ROLL20_CODE_VERSION, code, ...(source ? { source } : {}) } as DocumentContent
}

/** 새 롤꾸코드 기본 이름 */
export const NEW_ROLL20_CODE_TITLE = '새 롤꾸코드'

/** 빈 편집기 (코드나 제목을 처음 넣을 때 문서를 만든다) */
export const NEW_ROLL20_CODE_PATH = '/studio/roll20code/new'
