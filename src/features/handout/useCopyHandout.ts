import { useState } from 'react'
import { useNavigate } from 'react-router'
import { documentPath } from '../../lib/documents'
import { errorMessageOf } from '../../lib/documentSync'
import { useRepository } from '../../lib/useRepository'

const TITLE_MAX = 200
const COPY_SUFFIX = ' (사본)'

/** 사본 제목: 원래 제목 + " (사본)". DB 제한(200자)을 넘지 않게 원래 제목 쪽을 줄인다 */
export function copyTitle(title: string): string {
  const base = title.trim() || '제목 없음'
  const room = TITLE_MAX - Array.from(COPY_SUFFIX).length
  return Array.from(base).slice(0, room).join('') + COPY_SUFFIX
}

/**
 * "이 템플릿 사용하기": 핸드아웃을 복사해 새 핸드아웃을 만들고 템플릿 에디터를 연다. 원본은 건드리지 않는다.
 * 복사할 내용은 서버의 최신 행을 다시 읽어 저장된 값 그대로 쓴다 (정규화한 보기가 아니라).
 */
export function useCopyHandout() {
  const repo = useRepository()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function copy(id: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const source = await repo.get(id)
      if (!source || source.deleted_at || source.type !== 'handout') throw new Error('원본 핸드아웃을 찾을 수 없어요.')
      const doc = await repo.create({ type: 'handout', title: copyTitle(source.title), content: source.content })
      navigate(documentPath(doc.type, doc.id))
    } catch (err) {
      setError(errorMessageOf(err))
      setBusy(false)
    }
  }

  return { copy, busy, error }
}
