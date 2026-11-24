import { Link } from 'react-router'

export function Brandmark() {
  return (
    <div className="brandmark" aria-hidden="true">
      ✧
    </div>
  )
}

export function SidebarBrand() {
  return (
    <Link to="/" className="brand" aria-label="FOLIO 대시보드로 이동">
      <Brandmark />
      <div className="brandtext">
        <div className="brandname">FOLIO</div>
        <div className="brandsub">TRPG WORKSPACE</div>
      </div>
    </Link>
  )
}

export function MobileBrand() {
  return (
    <Link to="/" className="mobile-brand" aria-label="FOLIO 대시보드로 이동">
      <Brandmark />
      FOLIO
    </Link>
  )
}
