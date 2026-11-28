import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'
import { ThemeButton } from './ThemeButton'
import { Topbar } from './Topbar'
import './AppShell.css'

export function AppShell() {
  return (
    <div className="app">
      <Topbar />
      <div className="app-body">
        <Sidebar />
        <div className="main">
          <main className="stage">
            <Outlet />
          </main>
        </div>
      </div>
      <ThemeButton />
    </div>
  )
}
