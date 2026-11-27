import type { HandoutTemplate } from './types'

/** 비밀 결사의 인장 — 어두운 바탕 · 이중선 테두리 · 원형 인장 엠블럼 */
export const order: HandoutTemplate = {
  id: 'order',
  name: '비밀 결사의 인장',
  kind: '다크 판타지 · 문장',
  categories: ['고딕', '판타지'],
  description: '맨 위에 원형 인장을 찍은 어두운 결사 문서. 서약서·명령서·금서의 한 장에 어울려요.',
  layoutNotes: ['결사 문서 · 중앙 정렬', '원형 인장 엠블럼', '이중선 테두리와 표어'],
  width: 450,
  defaultFont: 'serif',
  fields: [
    { key: 'seal', label: '인장 문양', placeholder: '✠', defaultText: '✠' },
    { key: 'cap', label: '머리 문구', placeholder: '결사의 이름', optional: true, defaultText: 'THE SECRET ORDER' },
    { key: 'title', label: '제목', placeholder: '제목을 입력하세요', defaultText: '봉인된 서약' },
    { key: 'motto', label: '표어', placeholder: '표어 (선택)', optional: true, defaultText: '침묵은 빛보다 오래 남는다' },
    {
      key: 'body',
      label: '본문',
      placeholder: '본문을 입력하세요',
      multiline: true,
      defaultText:
        '이 문서를 받은 자는 오늘부로 결사의 일원이 된다.\n\n그믐달이 뜨는 밤, 북쪽 회랑의 세 번째 기둥 아래에서\n네 이름을 다시 부를 것이다.',
    },
    { key: 'signature', label: '서명', placeholder: '서명 (선택)', optional: true, defaultText: '— 제7 서기관' },
  ],
  themes: [
    {
      id: 'obsidian',
      label: '흑요석',
      colors: { paper: '#191b21', border: '#b8975a', inner: '#6d5a3a', ink: '#efe3c8', text: '#d8ccb2', muted: '#a8987a', accent: '#c9a25f' },
    },
    {
      id: 'crimson',
      label: '진홍',
      colors: { paper: '#2a1517', border: '#b07a5c', inner: '#6b3c35', ink: '#f2dfcf', text: '#e2cbb9', muted: '#b4938a', accent: '#d39a6a' },
    },
    {
      id: 'royal',
      label: '왕실 남색',
      colors: { paper: '#18203a', border: '#9fa9c4', inner: '#46507a', ink: '#e9ecf5', text: '#cfd5e6', muted: '#9aa3bd', accent: '#b9c3dd' },
    },
  ],
  blocks: [
    {
      kind: 'frame',
      padding: '12px',
      children: [
        {
          kind: 'frame',
          padding: '34px 28px 32px',
          align: 'center',
          children: [
            { kind: 'seal', field: 'seal', size: 76, ring: 'accent', style: { size: 34, lineHeight: 1, color: 'accent' } },
            { kind: 'field', field: 'cap', style: { size: 10, letterSpacing: 5, color: 'accent', marginTop: 22, marginBottom: 14 } },
            { kind: 'field', field: 'title', style: { size: 28, lineHeight: 1.35, letterSpacing: 2, color: 'ink', marginBottom: 10 } },
            { kind: 'field', field: 'motto', style: { size: 13, lineHeight: 1.7, color: 'muted', italic: true, marginBottom: 22 } },
            { kind: 'rule', widthPercent: 40, color: 'accent', marginBottom: 22 },
            { kind: 'image', maxWidth: 300, marginBottom: 22 },
            { kind: 'field', field: 'body', style: { size: 14, lineHeight: 2.1, color: 'text' } },
            { kind: 'field', field: 'signature', style: { size: 12, letterSpacing: 2, color: 'accent', marginTop: 30 } },
            { kind: 'text', text: '✦   ✦   ✦', style: { size: 12, color: 'accent', marginTop: 20 } },
          ],
        },
      ],
    },
  ],
}
