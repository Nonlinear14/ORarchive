import type { KindChipValue } from '../components/DocumentList'
import type { DocumentSummary } from './documents'

/** 템플릿 목록의 유형 칩: 핸드아웃(녹색) · 롤꾸코드(갈색, 문서 종류가 생기면 사용) */
export const templateKindChips = {
  handout: { label: '핸드아웃', tone: 'green' },
  roll20code: { label: '롤꾸코드', tone: 'brown' },
} satisfies Record<string, KindChipValue>

/** 로그 플랫폼 칩: content.format 으로 구분 (지금까지의 로그는 모두 Roll20) */
export function logPlatformChip(doc: Pick<DocumentSummary, 'format'>): KindChipValue {
  return doc.format?.startsWith('ccfolia') ? { label: '코코포리아', tone: 'brown' } : { label: 'Roll20', tone: 'green' }
}
