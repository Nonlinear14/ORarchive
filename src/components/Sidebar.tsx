import { Link, NavLink } from 'react-router'
import { useAuth } from '../lib/auth/context'
import { avatarUrl, displayName } from '../lib/auth/helpers'
import { toggleTheme, useTheme } from '../lib/theme'
import { navSections, type NavSection } from '../routes'
import { Avatar } from './Avatar'
import { SidebarBrand } from './Brand'
import { Icon } from './Icon'
import './Sidebar.css'

function SidebarProfile() {
  const { user, profile } = useAuth()

  if (!user) {
    return (
      <Link to="/login" className="profile-mini" title="로그인">
        <div className="avatar">F</div>
        <div>
          <strong>게스트</strong>
          <small>로그인하고 기기 간 동기화</small>
        </div>
        <Icon name="chev" />
      </Link>
    )
  }

  const name = displayName(user, profile)
  return (
    <Link to="/settings" className="profile-mini" title={`${name} · 계정 설정`}>
      <Avatar name={name} url={avatarUrl(user, profile)} />
      <div className="profile-mini-text">
        <strong>{name}</strong>
        <small>{user.email ?? 'Google 계정'}</small>
      </div>
      <Icon name="chev" />
    </Link>
  )
}

function ThemeToggle() {
  const theme = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      className="nav-sub theme-toggle"
      onClick={toggleTheme}
      title="라이트모드/다크모드 전환"
    >
      <span>라이트모드/다크모드</span>
      <span className="switch" aria-hidden="true">
        <span className="switch-knob" />
      </span>
      <span className="sr-only">{dark ? '지금은 다크모드' : '지금은 라이트모드'}</span>
    </button>
  )
}

function SectionNav({ section }: { section: NavSection }) {
  // 하위 메뉴가 없으면 제목 자체가 링크
  if (section.route)
    return (
      <div className="nav-section">
        <NavLink to={section.route.path} className="nav-title nav-title-link" title={section.label}>
          <Icon name={section.icon} />
          <span>{section.label}</span>
        </NavLink>
      </div>
    )

  const headingId = `nav-${section.label.replace(/\s+/g, '-')}`
  return (
    <div className="nav-section" role="group" aria-labelledby={headingId}>
      <div className="nav-title" id={headingId}>
        <Icon name={section.icon} />
        <span>{section.label}</span>
      </div>
      {section.children?.map((route) => (
        <NavLink key={route.path} to={route.path} end className="nav-sub" title={route.label}>
          <Icon name={route.icon} />
          <span>{route.label}</span>
        </NavLink>
      ))}
      {section.themeToggle && <ThemeToggle />}
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <SidebarBrand />
      <nav className="side-content" aria-label="주 메뉴">
        {navSections.map((section) => (
          <SectionNav key={section.label} section={section} />
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
          <div className="quota-foot">사용량 표시는 준비 중입니다</div>
        </div>
        <SidebarProfile />
      </div>
    </aside>
  )
}
