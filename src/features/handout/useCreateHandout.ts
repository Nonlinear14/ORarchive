import { useState } from 'react'
import { useNavigate } from 'react-router'
import { documentPath } from '../../lib/documents'
import { errorMessageOf } from '../../lib/documentSync'
import { useRepository } from '../../lib/useRepository'
import type { TemplateId } from './model'
import { newHandoutDocument } from './templates'

/** 템플릿으로 핸드아웃 문서를 만들고(기존 저장소 사용) 스튜디오를 연다 */
export function useCreateHandout() {
  const repo = useRepository()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<TemplateId | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function create(templateId: TemplateId) {
    if (busy) return
    setBusy(templateId)
    setError(null)
    try {
      const doc = await repo.create({ type: 'handout', ...newHandoutDocument(templateId) })
      navigate(documentPath(doc.type, doc.id))
    } catch (err) {
      setError(errorMessageOf(err))
      setBusy(null)
    }
  }

  return { create, busy, error }
}
