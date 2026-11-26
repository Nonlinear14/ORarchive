import type { HandoutTemplate } from './types'

/** 숲의 기록 — 자연 연대기 (덩굴 장식 · 날짜 줄 · 세로 막대가 있는 일지 본문) */
export const forest: HandoutTemplate = {
  id: 'forest',
  name: '숲의 기록',
  kind: '판타지 · 자연',
  categories: ['판타지'],
  description: '덩굴 장식과 날짜 줄, 세로 막대가 있는 여행 일지. 탐험 기록·전승·식물 도감에 어울려요.',
  layoutNotes: ['자연 연대기 · 일지 본문', '덩굴 장식과 날짜 줄', '왼쪽 세로 막대'],
  width: 430,
  defaultFont: 'serif',
  fields: [
    { key: 'cap', label: '머리 문구', placeholder: '머리 문구', optional: true, defaultText: 'THE FOREST CHRONICLE' },
    { key: 'title', label: '제목', placeholder: '제목을 입력하세요', defaultText: '잃어버린 연대기' },
    { key: 'date', label: '날짜', placeholder: '날짜와 장소 (선택)', optional: true, defaultText: '세 번째 달, 이슬비 내리던 밤' },
    {
      key: 'body',
      label: '본문',
      placeholder: '기록을 입력하세요',
      multiline: true,
      defaultText:
        '오래된 떡갈나무의 뿌리 아래에서 이끼로 덮인 석판을 찾았다.\n\n석판의 문자는 달빛이 닿을 때만 읽혔고,\n그 첫 문장은 우리 일행의 이름이었다.',
    },
    { key: 'signature', label: '서명', placeholder: '서명 (선택)', optional: true, defaultText: '— 떡갈나무 아래에서, 이른' },
  ],
  themes: [
    {
      id: 'moss',
      label: '이끼',
      colors: { paper: '#dfe7d9', border: '#8fa48c', inner: '#b4c4ae', ink: '#2f4a38', text: '#3a5243', muted: '#6c8471', accent: '#5f7f4f' },
    },
    {
      id: 'birch',
      label: '자작나무',
      colors: { paper: '#f1efe4', border: '#a9ad94', inner: '#ccd0bb', ink: '#3c4a35', text: '#4a5643', muted: '#7d866f', accent: '#7a8d4c' },
    },
    {
      id: 'dusk',
      label: '해 질 녘 숲',
      colors: { paper: '#213029', border: '#7f9a83', inner: '#3d5245', ink: '#e3ead8', text: '#cfd9c6', muted: '#93a894', accent: '#a7c08a' },
    },
  ],
  blocks: [
    {
      kind: 'frame',
      padding: '30px 30px 30px',
      align: 'left',
      children: [
        { kind: 'text', text: '❦ ─── ✧ ─── ❦', style: { size: 14, letterSpacing: 2, color: 'accent', align: 'center', marginBottom: 18 } },
        { kind: 'field', field: 'cap', style: { size: 10, letterSpacing: 4, color: 'muted', align: 'center' } },
        { kind: 'field', field: 'title', style: { size: 28, lineHeight: 1.35, color: 'ink', align: 'center', marginTop: 8, marginBottom: 6 } },
        { kind: 'field', field: 'date', style: { size: 12, lineHeight: 1.6, color: 'muted', italic: true, align: 'center', marginBottom: 22 } },
        { kind: 'image', maxWidth: 360, marginBottom: 20 },
        {
          kind: 'aside',
          bar: 'accent',
          barWidth: 3,
          gap: 16,
          children: [{ kind: 'field', field: 'body', style: { size: 14, lineHeight: 2.1, color: 'text', align: 'left' } }],
        },
        { kind: 'field', field: 'signature', style: { size: 12, lineHeight: 1.6, color: 'muted', italic: true, align: 'right', marginTop: 22 } },
        {
          kind: 'text',
          text: 'FROM THE CHRONICLES OF THE GREEN',
          style: { size: 8, letterSpacing: 3, color: 'muted', align: 'center', marginTop: 26 },
        },
      ],
    },
  ],
}
