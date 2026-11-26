import type { HandoutTemplate } from './types'

/** 달빛의 초대 — 목업 v3 의 클래식 편지 (이중 테두리 · 중앙 정렬 · 세리프) */
export const moonlit: HandoutTemplate = {
  id: 'moonlit',
  name: '달빛의 초대',
  kind: '고딕 · 서신',
  categories: ['고딕'],
  description: '이중 테두리 안에 가운데 정렬한 고전 편지. 초대장·유서·비밀 서신에 어울려요.',
  layoutNotes: ['클래식 편지 · 중앙 정렬', '이중 테두리와 구분선', '맺음말과 꽃 장식'],
  width: 430,
  defaultFont: 'serif',
  fields: [
    { key: 'cap', label: '머리 문구', placeholder: '영문 장식 문구', optional: true, defaultText: 'A PRIVATE INVITATION' },
    { key: 'title', label: '제목', placeholder: '제목을 입력하세요', defaultText: '달빛 아래의 초대장' },
    {
      key: 'body',
      label: '본문',
      placeholder: '본문을 입력하세요',
      multiline: true,
      defaultText:
        '친애하는 방문객께,\n\n달이 세 번째 탑 꼭대기에 걸리는 밤, 당신을 오래된 저택으로 초대합니다.\n\n부디 이 편지를 다른 이에게 보여주지 마십시오.',
    },
    { key: 'signature', label: '서명', placeholder: '서명 (선택)', optional: true, defaultText: '— 블랙우드 저택의 주인' },
  ],
  themes: [
    {
      id: 'classic',
      label: '양피지',
      colors: { paper: '#e8ddc9', border: '#aa9775', inner: '#baa481', ink: '#594733', text: '#665847', muted: '#927e66', accent: '#9c795f' },
    },
    {
      id: 'dark',
      label: '한밤',
      colors: { paper: '#23343b', border: '#a38c66', inner: '#8e846b', ink: '#e8dec7', text: '#e8dec7', muted: '#cfb99a', accent: '#b39770' },
    },
    {
      id: 'purple',
      label: '라벤더',
      colors: { paper: '#e0d9e8', border: '#b2a4bf', inner: '#c3b6cf', ink: '#534360', text: '#534360', muted: '#85769a', accent: '#8b7299' },
    },
    {
      id: 'forest',
      label: '이끼',
      colors: { paper: '#d7e1d5', border: '#9cae9b', inner: '#afc0ad', ink: '#3c5445', text: '#3c5445', muted: '#6b8270', accent: '#6f8a6a' },
    },
  ],
  blocks: [
    {
      kind: 'frame',
      padding: '16px',
      children: [
        {
          kind: 'frame',
          padding: '44px 24px 30px',
          align: 'center',
          children: [
            { kind: 'field', field: 'cap', style: { size: 11, letterSpacing: 4, color: 'accent', marginBottom: 44 } },
            { kind: 'field', field: 'title', style: { size: 30, lineHeight: 1.4, color: 'ink', marginBottom: 22 } },
            { kind: 'rule', widthPercent: 70, color: 'accent', marginBottom: 24 },
            { kind: 'image', maxWidth: 300, marginBottom: 24 },
            { kind: 'field', field: 'body', style: { size: 14, lineHeight: 2.2, color: 'text' } },
            { kind: 'field', field: 'signature', style: { size: 13, lineHeight: 1.8, color: 'text', italic: true, marginTop: 26 } },
            { kind: 'text', text: 'THE END OF THE LETTER', style: { size: 9, letterSpacing: 3, color: 'muted', marginTop: 40 } },
            { kind: 'text', text: '❧', style: { size: 36, lineHeight: 1, color: 'accent', marginTop: 18 } },
          ],
        },
      ],
    },
  ],
}
