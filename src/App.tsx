import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { LoadingState } from './components/LoadingState'
import { RequireAuth } from './components/RequireAuth'
import { AuthRedirects } from './lib/auth/AuthRedirects'
import { PendingSyncProvider } from './lib/sync/PendingSyncProvider'
import { HomePage } from './pages/HomePage'
import { DocumentPage } from './pages/DocumentPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { SettingsPage } from './pages/SettingsPage'
import { navRoutes } from './routes'

// 스튜디오 화면은 처음 열 때 불러온다 (첫 화면 번들을 가볍게)
const HandoutArchivePage = lazy(() => import('./features/handout/pages/HandoutArchivePage'))
const TemplateEditorPage = lazy(() => import('./features/handout/pages/TemplateEditorPage'))
const LogListPage = lazy(() => import('./features/log/pages/LogListPage'))
const Roll20LogStartPage = lazy(() => import('./features/log/roll20/pages/Roll20LogStartPage'))
const Roll20LogEditorPage = lazy(() => import('./features/log/roll20/editor/Roll20LogEditorPage'))
const CcfoliaLogStartPage = lazy(() => import('./features/log/ccfolia/pages/CcfoliaLogStartPage'))
const CcfoliaLogEditorPage = lazy(() => import('./features/log/ccfolia/editor/CcfoliaLogEditorPage'))
const HandoutStudioPage = lazy(() => import('./features/handout/studio/HandoutStudioPage'))
const Roll20CodeStartPage = lazy(() => import('./features/roll20code/pages/Roll20CodeStartPage'))
const Roll20CodeEditorPage = lazy(() => import('./features/roll20code/editor/Roll20CodeEditorPage'))

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState label="화면을 불러오는 중…" />}>{children}</Suspense>
}

/** 실제 화면이 있는 경로 (나머지 내비 경로는 '준비 중' 자리표시) */
const implemented = new Set(['/', '/settings', '/templates', '/studio/handout', '/studio/roll20code', '/logs', '/studio/log/roll20', '/studio/log/ccfolia'])

export function App() {
  return (
    <PendingSyncProvider>
      <AuthRedirects />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route index element={<HomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/documents/:id" element={<DocumentPage />} />
            <Route path="/templates" element={<Lazy><HandoutArchivePage /></Lazy>} />
            <Route path="/studio/handout" element={<Lazy><TemplateEditorPage /></Lazy>} />
            <Route path="/studio/handout/:id" element={<Lazy><HandoutStudioPage /></Lazy>} />
            <Route path="/studio/roll20code" element={<Lazy><Roll20CodeStartPage /></Lazy>} />
            <Route path="/studio/roll20code/:id" element={<Lazy><Roll20CodeEditorPage /></Lazy>} />
            <Route path="/logs" element={<Lazy><LogListPage /></Lazy>} />
            <Route path="/studio/log/roll20" element={<Lazy><Roll20LogStartPage /></Lazy>} />
            <Route path="/studio/log/roll20/:id" element={<Lazy><Roll20LogEditorPage /></Lazy>} />
            <Route path="/studio/log/ccfolia" element={<Lazy><CcfoliaLogStartPage /></Lazy>} />
            <Route path="/studio/log/ccfolia/:id" element={<Lazy><CcfoliaLogEditorPage /></Lazy>} />
            {/* 예전 주소 */}
            <Route path="/studio/log" element={<Navigate to="/logs" replace />} />
            <Route path="/templates/roll20" element={<Navigate to="/templates" replace />} />
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
