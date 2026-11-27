import { TopBrand } from './Brand'
import { PendingIndicator } from './PendingIndicator'
import { ProfileMenu } from './ProfileMenu'
import './Topbar.css'

export function Topbar() {
  return (
    <header className="topbar">
      <TopBrand />
      <div className="top-actions">
        <PendingIndicator />
        <ProfileMenu />
      </div>
    </header>
  )
}
