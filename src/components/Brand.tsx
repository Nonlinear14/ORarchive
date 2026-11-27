import { Link } from 'react-router'

/** 주사위 눈 5 — 금색 주사위를 시계 방향으로 45도 돌린 사이트 아이콘 (직접 그린 도형, 눈은 사이드바 색) */
const INSET = 18
const SIDE = 100 - INSET * 2
const PIPS = [
  [0.286, 0.286],
  [0.714, 0.286],
  [0.5, 0.5],
  [0.286, 0.714],
  [0.714, 0.714],
]

function DiceIcon() {
  const at = (t: number) => INSET + SIDE * t
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g transform="rotate(45 50 50)">
        <rect x={INSET} y={INSET} width={SIDE} height={SIDE} rx={12} className="die-body" />
        {PIPS.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={at(x)} cy={at(y)} r={SIDE * 0.072} className="die-pip" />
        ))}
      </g>
    </svg>
  )
}

export function Brandmark() {
  return (
    <div className="brandmark" aria-hidden="true">
      <DiceIcon />
    </div>
  )
}

/** 상단바 왼쪽: 사이트 아이콘 · 이름 (PC 는 부제도). 누르면 홈 */
export function TopBrand() {
  return (
    <Link to="/" className="top-brand" aria-label="ORarchive 홈으로 이동">
      <Brandmark />
      <span className="brandname">ORarchive</span>
      <span className="brandsub">ORPG를 위한 툴 아카이브</span>
    </Link>
  )
}
