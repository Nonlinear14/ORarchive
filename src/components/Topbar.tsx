import { Link, useLocation } from 'react-router'
import { pageLabel } from '../routes'
import { MobileBrand } from './Brand'
import { Icon } from './Icon'
import './Topbar.css'

export function Topbar() {
  const { pathname } = useLocation()

  return (
    <header className="topbar">
      <MobileBrand />
      <nav className="crumbs" aria-label="현재 위치">
        <span>Workspace</span>
        <Icon name="chev" />
        <strong aria-current="page">{pageLabel(pathname)}</strong>
      </nav>
      <div className="top-actions">
        <button type="button" className="search-trigger" aria-label="검색" title="검색은 준비 중입니다">
          <Icon name="search" />
          <span>작품, 캐릭터, 프로젝트 검색...</span>
          <span className="key">⌘ K</span>
        </button>
        <button type="button" className="iconbtn" aria-label="알림" title="알림은 준비 중입니다">
          <Icon name="bell" />
        </button>
        <Link to="/login" className="mini-avatar" aria-label="로그인" title="로그인">
          F
        </Link>
      </div>
    </header>
  )
}
