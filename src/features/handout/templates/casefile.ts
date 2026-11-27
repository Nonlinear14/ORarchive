import type { HandoutTemplate } from './types'

/** 오래된 조사 기록 — 1920년대 사건 파일 (머리띠 · 기밀 도장 · 서류 칸 · 왼쪽 정렬 보고서) */
export const casefile: HandoutTemplate = {
  id: 'casefile',
  name: '오래된 조사 기록',
  kind: '미스터리 · 기록',
  categories: ['미스터리'],
  description: '사건 번호·일자·담당자 칸이 있는 1920년대 조사 보고서. 단서와 증언 정리에 좋아요.',
  layoutNotes: ['사건 파일 · 왼쪽 정렬', '서류 머리칸 (번호·일자·담당)', '기밀 도장'],
  width: 450,
  defaultFont: 'serif',
  fields: [
    { key: 'cap', label: '분류', placeholder: '분류 (예: CASE FILE)', optional: true, defaultText: 'CASE FILE / 1927' },
    { key: 'title', label: '사건명', placeholder: '사건명을 입력하세요', defaultText: '아컴 부두 실종 사건' },
    { key: 'caseNo', label: '사건 번호', placeholder: '사건 번호', defaultText: '№ 1927-0413' },
    { key: 'date', label: '일자', placeholder: '일자', defaultText: '1927년 4월 13일' },
    { key: 'agent', label: '담당', placeholder: '담당 조사관', defaultText: 'H. 웨이트 조사관' },
    {
      key: 'body',
      label: '본문',
      placeholder: '조사 내용을 입력하세요',
      multiline: true,
      defaultText:
        '실종자: 부두 노동자 3명\n마지막 목격: 자정 무렵, 7번 창고 앞\n\n현장에는 바닷물에 젖은 발자국이 창고 안쪽으로만 이어져 있었다.\n나오는 발자국은 없었다.',
    },
    { key: 'signature', label: '서명', placeholder: '보고자 서명 (선택)', optional: true, defaultText: '— 보고자 H. W.' },
  ],
  themes: [
    {
      id: 'manila',
      label: '마닐라 서류',
      colors: { paper: '#e4d6b8', border: '#8c7650', inner: '#b9a47c', ink: '#2e2a22', text: '#3b352b', muted: '#7a6a4e', accent: '#9b3b2f' },
    },
    {
      id: 'ash',
      label: '잿빛 사본',
      colors: { paper: '#dedbd2', border: '#77736a', inner: '#a9a499', ink: '#26282a', text: '#34373a', muted: '#6c6e70', accent: '#8a2f2f' },
    },
    {
      id: 'midnight',
      label: '심야 기록',
      colors: { paper: '#1f2428', border: '#6f6a5e', inner: '#4c4a44', ink: '#e6dcc6', text: '#d9cfb8', muted: '#a39a86', accent: '#c2574a' },
    },
  ],
  blocks: [
    {
      kind: 'frame',
      padding: '0',
      children: [
        {
          kind: 'frame',
          padding: '14px 20px',
          borderBottom: { width: 1, color: 'inner' },
          children: [
            {
              kind: 'split',
              left: [{ kind: 'field', field: 'cap', style: { size: 11, letterSpacing: 3, color: 'ink', bold: true, mono: true, align: 'left' } }],
              right: [
                {
                  kind: 'text',
                  text: 'CONFIDENTIAL',
                  style: { size: 10, letterSpacing: 3, color: 'accent', bold: true, mono: true, align: 'right', boxed: true },
                },
              ],
            },
          ],
        },
        {
          kind: 'frame',
          padding: '22px 24px 26px',
          align: 'left',
          children: [
            { kind: 'field', field: 'title', style: { size: 24, lineHeight: 1.35, color: 'ink', bold: true, align: 'left', marginBottom: 16 } },
            {
              kind: 'meta',
              labelColor: 'muted',
              lineColor: 'inner',
              style: { size: 12, lineHeight: 1.6, color: 'ink', mono: true, align: 'left' },
              rows: [
                { label: '사건 번호', field: 'caseNo' },
                { label: '일자', field: 'date' },
                { label: '담당', field: 'agent' },
              ],
            },
            { kind: 'rule', widthPercent: 100, color: 'inner', marginTop: 18, marginBottom: 18 },
            { kind: 'image', maxWidth: 380, marginBottom: 18 },
            { kind: 'field', field: 'body', style: { size: 14, lineHeight: 2, color: 'text', align: 'left' } },
            { kind: 'field', field: 'signature', style: { size: 12, lineHeight: 1.6, color: 'muted', italic: true, align: 'right', marginTop: 24 } },
            {
              kind: 'text',
              text: 'PROPERTY OF THE BUREAU · DO NOT COPY',
              style: { size: 8, letterSpacing: 2, color: 'muted', mono: true, align: 'center', marginTop: 28 },
            },
          ],
        },
      ],
    },
  ],
}
