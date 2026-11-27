import { toggleSidebar, useSidebarCollapsed } from '../lib/sidebar'
import { TopBrand } from './Brand'
import { Icon } from './Icon'
import { PendingIndicator } from './PendingIndicator'
import { ProfileMenu } from './ProfileMenu'
import './Topbar.css'

export function Topbar() {
  const collapsed = useSidebarCollapsed()

  return (
    <header className="topbar">
      <TopBrand />
      <div className="top-actions">
        <PendingIndicator />
        <button
          type="button"
          className="iconbtn side-toggle"
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-expanded={!collapsed}
          onClick={toggleSidebar}
        >
          <Icon name="sidebar" />
        </button>
        <ProfileMenu />
      </div>
    </header>
  )
}
