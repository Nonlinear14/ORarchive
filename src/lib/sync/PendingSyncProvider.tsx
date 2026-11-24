import { useEffect, useMemo, type ReactNode } from 'react'
import { useAuth } from '../auth/context'
import { createBackgroundSync } from '../backgroundSync'
import { createDocumentRepository } from '../documents'
import { BackgroundSyncContext, useSyncServices } from './context'

/**
 * 로그인한 동안 앱 전역에서 대기 변경을 보내는 백그라운드 동기화를 돌린다.
 * 사용자가 바뀌거나 로그아웃하면 이전 사용자의 동기화를 정리한다(리스너·타이머 포함).
 */
export function PendingSyncProvider({ children }: { children: ReactNode }) {
  const { client, user } = useAuth()
  const { store, cache, locks } = useSyncServices()
  const userId = user?.id ?? null

  const sync = useMemo(
    () =>
      client && userId
        ? createBackgroundSync({ userId, repo: createDocumentRepository(client), store, cache, locks })
        : null,
    [client, userId, store, cache, locks],
  )

  useEffect(() => {
    if (!sync) return
    sync.start()
    return () => sync.dispose()
  }, [sync])

  return <BackgroundSyncContext value={sync}>{children}</BackgroundSyncContext>
}
