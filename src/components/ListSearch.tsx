import { Icon } from './Icon'

/** 목록 위 이름 검색창 (템플릿 선택창과 같은 모양 · 입력하는 대로 거른다). 검색어는 기억하지 않는다 */
export function ListSearch({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return (
    <label className="searchbar list-search">
      <Icon name="search" />
      <span className="sr-only">{label}</span>
      <input type="search" placeholder="이름으로 검색" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
