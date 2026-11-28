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

/** 기본 제공 롤꾸 (사본으로 시작) */
export interface Roll20CodeStarter {
  id: string
  title: string
  code: string
}

export const ROLL20_CODE_STARTERS: Roll20CodeStarter[] = [
  {
    id: 'judge-button',
    title: '판정 버튼',
    code: '/desc [✷　?{기능|} 판정　✷](#" style=" text-decoration: none; font-style: normal !important; text-align: center; display: inline-block; color: white; letter-spacing: -1px; border-radius: 20px; padding: 5px 25px;margin-left: -4px;background-image: linear-gradient(135deg, #FF0053, #FFD444)',
  },
  {
    id: 'chapter',
    title: '챕터 표시',
    code: '/desc [─────── CHAPTER ?{챕터 숫자|} ───────](#" style="text-decoration:none; color: #F5C542; background-color:#EE1B60; text-align:center; display:block; padding:2px; box-shadow: 0px 8px 0px 15px #EE1B60; font-size:12px; font-style: normal;)[?{챕터명|}](#" style="text-decoration:none; color: #FFFFFF; background-color:#EE1B60; text-align:center; display:block; padding:2px; box-shadow: 0px 8px 0px 15px #EE1B60; font-style: normal;)',
  },
  {
    id: 'full-desc',
    title: '배경색이 꽉 차는 desc 서술',
    code: '/desc [?{내용|}](#" style="text-decoration:none; color: #FFFFFF; background-color:#87BD00; text-align:center; display:block; padding:2px; box-shadow: 0px 8px 0px 15px #87BD00;)',
  },
]
