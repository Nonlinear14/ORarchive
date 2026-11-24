import { Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { AuthRedirects } from './lib/auth/AuthRedirects'
import { PendingSyncProvider } from './lib/sync/PendingSyncProvider'
import { DashboardPage } from './pages/DashboardPage'
import { DocumentPage } from './pages/DocumentPage'
import { LibraryPage } from './pages/LibraryPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { SettingsPage } from './pages/SettingsPage'
import { navRoutes } from './routes'

/** 실제 화면이 있는 경로 (나머지 내비 경로는 '준비 중' 자리표시) */
const implemented = new Set(['/', '/library', '/settings'])

export function App() {
  return (
    <PendingSyncProvider>
      <AuthRedirects />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route index element={<DashboardPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/documents/:id" element={<DocumentPage />} />
            {navRoutes
              .filter((route) => !implemented.has(route.path))
              .map((route) => (
                <Route key={route.path} path={route.path} element={<PlaceholderPage route={route} />} />
              ))}
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </PendingSyncProvider>
  )
}
