import type { DocumentContent } from '../../../lib/documents'

/**
 * "새 핸드아웃" 양식 (2026-11-28, 운영자가 만든 핸드아웃 "새 핸드아웃"을 그대로 옮김).
 * 핸드아웃 편집 › 템플릿 선택 창의 "새 핸드아웃" 버튼이 여는 빈 편집기의 시작 모양. 저장을 눌러야 문서가 된다.
 * 처음 템플릿 목록에 들어올 때 한 번 넣는 "핸드아웃 샘플"(sample.ts)과는 별개다.
 */
export const NEW_HANDOUT_TITLE = '새 핸드아웃'
/** 새 핸드아웃 편집기 — 저장할 때 처음 만들어진다 (템플릿 목록 · 템플릿 선택 화면의 "새 핸드아웃") */
export const NEW_HANDOUT_PATH = '/studio/handout/new'

export const NEW_HANDOUT_CONTENT: DocumentContent = {
  v: 1,
  image: null,
  style: {
    background: '#fafafa',
  },
  theme: 'classic',
  fields: {
    cap: 'A PRIVATE INVITATION',
    body: '친애하는 방문객께,\n\n달이 세 번째 탑 꼭대기에 걸리는 밤, 당신을 오래된 저택으로 초대합니다.\n\n부디 이 편지를 다른 이에게 보여주지 마십시오.',
    title: '달빛 아래의 초대장',
    signature: '— 블랙우드 저택의 주인',
  },
  layout: {
    rows: [
      {
        id: 'row-f-cap',
        blocks: [
          {
            id: 'f-cap',
            text: '상단 문구',
            type: 'text',
            style: {
              size: 12,
              align: 'center',
              color: '#a1a1a1',
              marginTop: 0,
              lineHeight: 1.5,
              marginBottom: 0,
              letterSpacing: 1,
            },
          },
        ],
      },
      {
        id: 'row-sp-0-bmwyk656c0',
        blocks: [
          {
            id: 'sp-0',
            type: 'space',
            height: 25,
          },
        ],
      },
      {
        id: 'row-f-title',
        blocks: [
          {
            id: 'f-title',
            text: 'HANDOUT',
            type: 'text',
            style: {
              bold: true,
              size: 25,
              align: 'center',
              color: '#1a1a1a',
              marginTop: 0,
              lineHeight: 1.5,
              marginBottom: 0,
              letterSpacing: 1,
            },
          },
        ],
      },
      {
        id: 'row-f-signature-bmwyl4og81',
        blocks: [
          {
            id: 'f-signature',
            text: '강조 내용',
            type: 'text',
            style: {
              bold: true,
              size: 15,
              align: 'center',
              color: '#616161',
              italic: true,
              marginTop: 0,
              lineHeight: 1.5,
              marginBottom: 0,
              letterSpacing: 1,
            },
          },
        ],
      },
      {
        id: 'row-sp-1',
        blocks: [
          {
            id: 'sp-1',
            type: 'space',
            height: 25,
          },
        ],
      },
      {
        id: 'row-r-0',
        blocks: [
          {
            id: 'r-0',
            rule: {
              color: '#1a1a1a',
              widthPercent: 70,
            },
            type: 'image',
            maxWidth: 1000,
            marginTop: 0,
            marginBottom: 0,
          },
        ],
      },
      {
        id: 'row-bmwym76sk0-bmwym7cfv1',
        blocks: [
          {
            id: 'bmwym76sk0',
            type: 'space',
            height: 25,
          },
        ],
      },
      {
        id: 'row-bmwylfyix4',
        blocks: [
          {
            id: 'bmwylfyix4',
            text: '본문 내용을 적습니다.',
            type: 'text',
            style: {
              size: 15,
              align: 'center',
              color: '#1a1a1a',
              lineHeight: 1.5,
              letterSpacing: 0,
            },
          },
        ],
      },
      {
        id: 'row-sp-3',
        blocks: [
          {
            id: 'sp-3',
            type: 'space',
            height: 25,
          },
        ],
      },
      {
        id: 'row-s-1',
        blocks: [
          {
            id: 's-1',
            text: '하단 문구',
            type: 'text',
            style: {
              size: 12,
              align: 'center',
              color: '#a1a1a1',
              marginTop: 0,
              lineHeight: 1.5,
              marginBottom: 0,
              letterSpacing: 1,
            },
          },
        ],
      },
    ],
  },
  templateId: 'moonlit',
}

/** 새 핸드아웃의 제목과 content (매번 새 객체) */
export function newHandoutTemplate(): { title: string; content: DocumentContent } {
  return { title: NEW_HANDOUT_TITLE, content: structuredClone(NEW_HANDOUT_CONTENT) }
}
