import { useEffect, useState } from 'react'
import type { DocumentContent } from './documents'
import { useRepository } from './useRepository'

/**
 * 카드 미리보기용 본문 (읽기 전용). 목록에는 본문이 없어서 카드마다 따로 불러온다.
 * undefined: 불러오는 중 · null: 불러오지 못함
 */
export function useDocumentContent(id: string) {
  const repo = useRepository()
  const [content, setContent] = useState<DocumentContent | null | undefined>(undefined)
  useEffect(() => {
    let active = true
    repo
      .get(id)
      .then((doc) => active && setContent(doc?.content ?? null))
      .catch(() => active && setContent(null))
    return () => {
      active = false
    }
  }, [repo, id])
  return content
}
