import type { DocumentContent } from '../../../lib/documents'

/**
 * 기본 제공 핸드아웃 "핸드아웃 샘플" (2026-11-27, 운영자가 만든 핸드아웃을 그대로 옮김).
 * 블록 편집 기능을 짧게 안내하는 시작 양식. 새 계정의 템플릿 아카이브에 일반 핸드아웃으로 한 번 넣고,
 * 아카이브가 비었을 때 템플릿 선택창의 기본 템플릿으로도 보인다. 사용자는 자유롭게 고치고 지울 수 있다.
 * 고칠 때는 운영 계정에서 핸드아웃을 고친 뒤 content 를 이 파일에 다시 옮긴다.
 */
export const SAMPLE_HANDOUT_TITLE = '핸드아웃 샘플'

export const SAMPLE_HANDOUT_CONTENT: DocumentContent = {
  v: 1,
  image: null,
  style: { background: '#fafafa' },
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
            text: '상단에도 문구를 삽입할 수 있습니다.\n핸드아웃 길이는 내용에 따라 자동으로 늘어납니다.',
            type: 'text',
            style: { size: 12, align: 'center', color: '#a1a1a1', marginTop: 0, lineHeight: 1.5, marginBottom: 0, letterSpacing: 1 },
          },
        ],
      },
      { id: 'row-sp-0-bmwyk656c0', blocks: [{ id: 'sp-0', type: 'space', height: 25 }] },
      {
        id: 'row-f-title',
        blocks: [
          {
            id: 'f-title',
            text: 'HANDOUT',
            type: 'text',
            style: { bold: true, size: 25, align: 'center', color: '#1a1a1a', marginTop: 0, lineHeight: 1.5, marginBottom: 0, letterSpacing: 1 },
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
            style: { bold: true, size: 15, align: 'center', color: '#616161', italic: true, marginTop: 0, lineHeight: 1.5, marginBottom: 0, letterSpacing: 1 },
          },
        ],
      },
      { id: 'row-sp-1', blocks: [{ id: 'sp-1', type: 'space', height: 25 }] },
      {
        id: 'row-r-0',
        blocks: [{ id: 'r-0', rule: { color: '#1a1a1a', widthPercent: 70 }, type: 'image', maxWidth: 1000, marginTop: 0, marginBottom: 0 }],
      },
      { id: 'row-bmwym76sk0-bmwym7cfv1', blocks: [{ id: 'bmwym76sk0', type: 'space', height: 25 }] },
      {
        id: 'row-bmwylfyix4',
        blocks: [
          {
            id: 'bmwylfyix4',
            text: '위는 구분선 블록입니다.\n실선 점선 1점쇄선 2점쇄선 디자인 지원.\n굵기, 길이, 색변경이 가능합니다.',
            type: 'text',
            style: { size: 15, align: 'center', color: '#1a1a1a', lineHeight: 1.5, letterSpacing: 0 },
          },
        ],
      },
      { id: 'row-sp-2', blocks: [{ id: 'sp-2', type: 'space', height: 25 }] },
      {
        id: 'row-f-body',
        blocks: [
          {
            id: 'f-body',
            runs: [
              { t: '위는 공백 블록입니다.\n각 블록 사이사이마다의 간격을 조절하는 역할입니다.\n\n글 블록입니다.\n' },
              { s: { bold: true }, t: '볼드' },
              { t: ', ' },
              { s: { italic: true }, t: '이탤릭' },
              { t: ', ' },
              { s: { strike: true }, t: '취소선' },
              { t: ', ' },
              { s: { underline: true }, t: '밑줄' },
              { t: ' 지원.\n폰트 크기, 자간 및 행간, 가로 및 세로 정렬, ' },
              { s: { color: '#ff0000' }, t: '색 변경' },
              { t: ' 가능.' },
            ],
            text: '위는 공백 블록입니다.\n각 블록 사이사이마다의 간격을 조절하는 역할입니다.\n\n글 블록입니다.\n볼드, 이탤릭, 취소선, 밑줄 지원.\n폰트 크기, 자간 및 행간, 가로 및 세로 정렬, 색 변경 가능.',
            type: 'text',
            style: { size: 15, align: 'center', color: '#1a1a1a', marginTop: 0, lineHeight: 1.5, marginBottom: 0, letterSpacing: 0 },
          },
        ],
      },
      {
        id: 'row-bmwyle14t2',
        split: 24,
        blocks: [
          { id: 'bmwyle14t2', url: 'https://imgur.com/u23Oii3.png', type: 'image', maxWidth: 380 },
          {
            id: 'bmwyle2sx3',
            text: '옆은 이미지 블록입니다. 클릭하면 외부 이미지 링크로 사진을 출력할 수 있습니다. 사이를 선택해서 크기 비율을 바꿀 수도 있습니다.',
            type: 'text',
            style: { size: 15, align: 'left', color: '#1a1a1a', lineHeight: 1.5 },
          },
        ],
      },
      {
        id: 'row-bmwylgz925',
        blocks: [
          {
            id: 'bmwylgz925',
            text: '글상자와 이미지 블록은 2열 배치도 가능합니다.\n공백 블록과 구분선 블록은 1열 배치만 가능합니다.',
            type: 'text',
            style: { size: 15, align: 'center', color: '#1a1a1a', lineHeight: 1.5 },
          },
        ],
      },
      { id: 'row-sp-3', blocks: [{ id: 'sp-3', type: 'space', height: 25 }] },
      {
        id: 'row-s-1',
        blocks: [
          {
            id: 's-1',
            text: '하단에도 문구를 삽입할 수 있습니다.\n같은 종류의 블록은 ctrl 키로 다중 선택도 가능합니다.',
            type: 'text',
            style: { size: 12, align: 'center', color: '#a1a1a1', marginTop: 0, lineHeight: 1.5, marginBottom: 0, letterSpacing: 1 },
          },
        ],
      },
    ],
  },
  templateId: 'moonlit',
}

/** 새 문서로 넣을 때 쓰는 복사본 (상수를 공유하지 않게) */
export function sampleHandoutDocument(): { title: string; content: DocumentContent } {
  return { title: SAMPLE_HANDOUT_TITLE, content: structuredClone(SAMPLE_HANDOUT_CONTENT) }
}
