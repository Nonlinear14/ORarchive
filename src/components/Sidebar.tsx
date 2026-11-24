import { Link, NavLink } from 'react-router'
import { navGroups } from '../routes'
import { SidebarBrand } from './Brand'
import { Icon } from './Icon'
import './Sidebar.css'

export function Sidebar() {
  return (
    <aside className="sidebar">
      <SidebarBrand />
      <nav className="side-content" aria-label="주 메뉴">
        {navGroups.map((group) => (
          <div key={group.heading}>
            <div className="nav-heading">{group.heading}</div>
            {group.routes.map((route) => (
              <NavLink
                key={route.path}
                to={route.path}
                end={route.path === '/'}
                className="nav-item"
                title={route.label}
              >
                <Icon name={route.icon} />
                <span>{route.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="side-footer">
        <div className="quota">
          <div className="quota-title">
            <span>내 클라우드 공간</span>
            <small>준비 중</small>
          </div>
          <div className="progress" aria-hidden="true">
            <div />
          </div>
          <div className="quota-foot">로그인 후 사용량이 표시됩니다</div>
        </div>
        <Link to="/login" className="profile-mini" title="로그인">
          <div className="avatar">F</div>
          <div>
            <strong>게스트</strong>
            <small>로그인하고 기기 간 동기화</small>
          </div>
          <Icon name="chev" />
        </Link>
      </div>
    </aside>
  )
}
