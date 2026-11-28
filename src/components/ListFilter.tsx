/** 목록 검색창 옆 종류 선택 (전체 / …). 고른 값은 기억하지 않는다 — 목록에 들어올 때마다 "전체" */
export function ListFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange(value: T): void
}) {
  return (
    <div className="segmented list-filter" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}
