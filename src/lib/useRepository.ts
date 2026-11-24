import { useMemo } from 'react'
import { useAuth } from './auth/context'
import { createDocumentRepository, type DocumentRepository } from './documents'

/** 로그인된 화면(RequireAuth 아래)에서만 사용한다 */
export function useRepository(): DocumentRepository {
  const { client } = useAuth()
  const repo = useMemo(() => (client ? createDocumentRepository(client) : null), [client])
  if (!repo) throw new Error('서버 연결 설정이 없습니다.')
  return repo
}
