import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { getTemplate, newHandoutDocument } from '../features/handout/templates'
import type { DocumentType } from '../lib/database.types'
import { defaultTitle, documentPath, documentTypeLabels, documentTypes } from '../lib/documents'
import { useRepository } from '../lib/useRepository'
import { Icon } from './Icon'
import { Modal } from './Modal'

/** 핸드아웃을 바로 만들 때 쓰는 기본 템플릿 */
const DEFAULT_HANDOUT = newHandoutDocument('moonlit')

interface NewDocumentDialogProps {
  initialType?: DocumentType
  onClose(): void
}

/** 유형을 골라 새 문서를 만들고 바로 연다. 핸드아웃은 기본 템플릿으로 만들어 스튜디오를 연다 */
export function NewDocumentDialog({ initialType = 'handout', onClose }: NewDocumentDialogProps) {
  const repo = useRepository()
  const navigate = useNavigate()
  const [type, setType] = useState<DocumentType>(initialType)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const doc =
        type === 'handout'
          ? await repo.create({ type, title: title.trim() || DEFAULT_HANDOUT.title, content: DEFAULT_HANDOUT.content })
          : await repo.create({ type, title: title.trim() || defaultTitle(type) })
      navigate(documentPath(doc.type, doc.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="새 문서" eyebrow="NEW DOCUMENT" onClose={onClose}>
      <form onSubmit={submit}>
        <fieldset className="type-picker">
          <legend className="field-label">유형</legend>
          {documentTypes.map((value) => (
            <label key={value} className={value === type ? 'type-option active' : 'type-option'}>
              <input
                type="radio"
                name="doc-type"
                value={value}
                checked={value === type}
                onChange={() => setType(value)}
              />
              {documentTypeLabels[value]}
            </label>
          ))}
        </fieldset>
        <label className="field-label" htmlFor="new-doc-title">
          제목
        </label>
        <input
          id="new-doc-title"
          className="field-input"
          value={title}
          maxLength={200}
          placeholder={type === 'handout' ? DEFAULT_HANDOUT.title : defaultTitle(type)}
          onChange={(event) => setTitle(event.target.value)}
        />
        {type === 'handout' && (
          <p className="field-help">
            ‘{getTemplate('moonlit').name}’ 템플릿으로 시작해요. 스튜디오에서 언제든 바꿀 수 있어요.{' '}
            <Link to="/templates" className="text-link">
              템플릿 갤러리에서 고르기 <Icon name="arrow" />
            </Link>
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            문서를 만들지 못했어요: {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? '만드는 중…' : '만들기'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
