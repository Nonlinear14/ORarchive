/**
 * 최근에 연 문서 기록 (홈 화면 "최근 조회" 용).
 * 기기별 기록이라 브라우저 localStorage 에만 두고, 서버에는 보내지 않는다. 사용자별로 키를 나눈다.
 * 문서 내용은 저장하지 않는다 — id 와 종류, 연 시각만 남긴다.
 */
export type RecentKind = 'handout' | 'roll20code' | 'character'

export interface RecentView {
  id: string
  kind: RecentKind
  /** 마지막으로 연 시각 (ms) */
  at: number
}

/** 템플릿 아카이브 묶음에 들어가는 종류 */
export const templateKinds: RecentKind[] = ['handout', 'roll20code']

const MAX_ENTRIES = 30
const kinds = new Set<RecentKind>(['handout', 'roll20code', 'character'])

export const recentStorageKey = (userId: string) => `folio-recent:${userId}`

function isRecentView(value: unknown): value is RecentView {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && typeof v.at === 'number' && kinds.has(v.kind as RecentKind)
}

/** 최근 연 순서(새것 먼저). 저장 값이 깨져 있으면 빈 목록 */
export function readRecentViews(userId: string): RecentView[] {
  try {
    const raw = localStorage.getItem(recentStorageKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isRecentView).sort((a, b) => b.at - a.at) : []
  } catch {
    return []
  }
}

/** 문서를 열었다고 기록한다. 같은 문서는 맨 앞으로 옮긴다 */
export function recordRecentView(userId: string, id: string, kind: RecentKind, at = Date.now()) {
  const next = [{ id, kind, at }, ...readRecentViews(userId).filter((entry) => entry.id !== id)].slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(recentStorageKey(userId), JSON.stringify(next))
  } catch {
    // 저장 불가 — 최근 기록만 남지 않을 뿐 다른 기능에는 영향 없음
  }
}

/** 해당 종류 중 최근 연 것부터 limit 개 */
export function recentOf(views: RecentView[], wanted: RecentKind[], limit: number): RecentView[] {
  return views.filter((entry) => wanted.includes(entry.kind)).slice(0, limit)
}
