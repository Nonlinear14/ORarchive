/**
 * 핸드아웃 템플릿 정의.
 *
 * 템플릿의 레이아웃은 블록 트리(Block[]) 하나로 적는다. 같은 트리를 두 렌더러가 해석한다.
 * - React 캔버스 (canvas/HandoutCanvas.tsx): 필드 블록을 직접 편집할 수 있는 contenteditable 로 그린다.
 * - Roll20 HTML (roll20.ts): 표(table) 기반 · 모든 스타일 인라인 · class/style 태그 없는 마크업으로 만든다.
 * 그래서 캔버스에서 보는 모양과 Roll20 에 붙여 넣은 모양이 같은 정의에서 나온다.
 */
import type { FontChoice, TemplateId } from '../model'

export type TemplateCategory = '고딕' | '미스터리' | '판타지'
export const templateCategories: TemplateCategory[] = ['고딕', '미스터리', '판타지']

/** 테마 색. accent 는 사용자가 고른 강조 색으로 바뀔 수 있다 */
export interface ThemeColors {
  /** 종이(배경) */
  paper: string
  /** 바깥 테두리 */
  border: string
  /** 안쪽 테두리 · 보조 선 */
  inner: string
  /** 제목 */
  ink: string
  /** 본문 */
  text: string
  /** 보조 글자 (머리말·꼬리말) */
  muted: string
  /** 장식 · 강조 */
  accent: string
}
export type ColorKey = keyof ThemeColors

export interface ThemeDef {
  id: string
  label: string
  colors: ThemeColors
}

export interface FieldDef {
  key: string
  label: string
  placeholder: string
  /** 줄바꿈 허용 (본문). 아니면 Enter 가 다음 칸으로 이동한다 */
  multiline?: boolean
  /** 비어 있으면 Roll20 출력에서 뺀다 (아니면 빈 칸 자리를 남긴다) */
  optional?: boolean
  defaultText: string
}

export interface TextStyle {
  size: number
  /** 배수 (예: 2.2) — 생략하면 1.4 */
  lineHeight?: number
  color: ColorKey
  align?: 'left' | 'center' | 'right'
  letterSpacing?: number
  bold?: boolean
  italic?: boolean
  /** 고정폭 글꼴 (조사 기록의 서류 칸) */
  mono?: boolean
  marginTop?: number
  marginBottom?: number
  /** 도장처럼 테두리를 두른 글자 */
  boxed?: boolean
}

export interface BorderSpec {
  width: number
  color: ColorKey
  /** 테두리는 한 겹 · 실선이나 점선만 (2026-11-26) */
  style?: 'solid' | 'dotted'
}

export type Block =
  /** 테두리·여백이 있는 상자 (Roll20 에서는 표 한 칸) */
  | {
      kind: 'frame'
      padding: string
      border?: BorderSpec
      borderBottom?: BorderSpec
      align?: 'left' | 'center'
      children: Block[]
    }
  /** 편집 가능한 필드 */
  | { kind: 'field'; field: string; style: TextStyle }
  /** 고정 장식 글자 */
  | { kind: 'text'; text: string; style: TextStyle }
  /** 가로 구분선 */
  | { kind: 'rule'; widthPercent: number; color: ColorKey; marginTop?: number; marginBottom?: number }
  /** 사용자가 넣은 이미지 자리 (이미지가 없으면 아무것도 그리지 않는다) */
  | { kind: 'image'; maxWidth: number; marginBottom: number }
  /** 원형 인장 (가운데 필드 하나) */
  | { kind: 'seal'; field: string; size: number; ring: ColorKey; style: TextStyle }
  /** 이름표 + 필드 값 표 (서류 머리칸) */
  | { kind: 'meta'; rows: { label: string; field: string }[]; labelColor: ColorKey; lineColor: ColorKey; style: TextStyle }
  /** 좌우 두 칸 */
  | { kind: 'split'; left: Block[]; right: Block[] }
  /** 왼쪽 세로 막대가 있는 단락 */
  | { kind: 'aside'; bar: ColorKey; barWidth: number; gap: number; children: Block[] }

export interface HandoutTemplate {
  id: TemplateId
  name: string
  /** 갤러리 카드 부제 */
  kind: string
  categories: TemplateCategory[]
  description: string
  /** 디자인 패널에 보이는 레이아웃 설명 */
  layoutNotes: string[]
  /** 캔버스·Roll20 표의 폭(px) */
  width: number
  fields: FieldDef[]
  themes: ThemeDef[]
  defaultFont: FontChoice
  blocks: Block[]
}
