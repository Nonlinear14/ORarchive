import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { App } from '../App'
import { AuthProvider } from '../lib/auth/AuthProvider'
import { createMemoryDocumentCache } from '../lib/documentCache'
import { createMemoryLocks } from '../lib/locks'
import { createMemoryPendingStore } from '../lib/pendingStore'
import type { FolioClient } from '../lib/supabase'
import { SyncServicesContext, type SyncServices } from '../lib/sync/context'

/** 현재 라우터 위치를 테스트에서 읽을 수 있게 노출한다 */
function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location" hidden>{location.pathname + location.search}</output>
}

interface RenderAppOptions {
  client: FolioClient | null
  basename?: string
  /** 로컬 동기화 저장소. 생략하면 렌더마다 새 메모리 구현 (테스트끼리 기록이 섞이지 않게) */
  services?: SyncServices
}

export function createTestServices(): SyncServices {
  return { store: createMemoryPendingStore(), cache: createMemoryDocumentCache(), locks: createMemoryLocks() }
}

/** 실제 앱 트리(AuthProvider + 라우터 + App)를 메모리 라우터로 렌더한다 */
export function renderApp(path: string, { client, basename, services = createTestServices() }: RenderAppOptions) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <>
            <App />
            <LocationProbe />
          </>
        ),
      },
    ],
    { initialEntries: [path], basename },
  )
  const result = render(
    <StrictMode>
      <SyncServicesContext value={services}>
        <AuthProvider client={client}>
          <RouterProvider router={router} />
        </AuthProvider>
      </SyncServicesContext>
    </StrictMode>,
  )
  return { ...result, services, router }
}
