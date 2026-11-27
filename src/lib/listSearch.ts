/** 이름(제목 없음 포함)에 검색어가 들어 있는가 (대소문자 무시) */
export function matchesTitle(title: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || (title.trim() || '제목 없음').toLowerCase().includes(q)
}
