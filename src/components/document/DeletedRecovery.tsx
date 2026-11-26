import { useState } from 'react'
import { useNavigate } from 'react-router'
import { documentTypeLabels, type DocumentDraft, type DocumentRecord } from '../../lib/documents'
import { errorMessageOf, type RecoverSource } from '../../lib/documentSync'
import { ConfirmDialog } from '../ConfirmDialog'
import { Icon } from '../Icon'
import './DocumentEditor.css'

interface DeletedRecoveryProps {
  doc: DocumentRecord | null
  draft: DocumentDraft
  source: RecoverSource
  /** 읽기 전용으로 보여 주고 "내용 복사"로 복사할 본문 (문서 유형마다 다르게 만든다) */
  bodyText: string
  /** 복구한 새 문서를 열 경로 */
  restorePath(id: string): string
  onRestore(): Promise<string>
  onDiscard(): Promise<void>
}

/**
 * 서버에서 삭제된 문서. 이 기기에 남아 있는 내용(서버에 반영되지 않은 변경, 또는 마지막 사본)을
 * 읽기 전용으로 보여 주고, 새 문서로 복구 · 내용 복사 · (확인 후) 버리기를 고르게 한다.
 */
export function DeletedRecovery({ doc, draft, source, bodyText, restorePath, onRestore, onDiscard }: DeletedRecoveryProps) {
  const navigate = useNavigate()
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [confirming, setConfirming] = useState(false)
  const pending = source === 'pending'
  const typeLabel = doc ? documentTypeLabels[doc.type] : '문서'

  async function restore() {
    setRestoring(true)
    setRestoreError(null)
    try {
      const id = await onRestore()
      navigate(restorePath(id), { replace: true })
    } catch (error) {
      setRestoreError(errorMessageOf(error))
      setRestoring(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(bodyText ? `${draft.title}\n\n${bodyText}` : draft.title)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <article className="doc-editor doc-recover">
      <title>{`${draft.title || '제목 없음'} · ORarchive`}</title>
      <div className="callout danger recover-banner" role="alert">
        <Icon name="alert" />
        <div>
          <b>서버에서 삭제된 문서입니다</b>
          <p>
            {pending
              ? '다른 곳에서 이 문서를 삭제했어요. 아래는 이 기기에만 남아 있는, 서버에 반영되지 않은 변경이에요. 새 문서로 복구하거나 내용을 복사해 두세요.'
              : '아래는 이 기기에 마지막으로 저장해 둔 사본이에요. 필요하면 새 문서로 복구하거나 내용을 복사해 두세요.'}
          </p>
          <div className="conflict-actions">
            <button type="button" className="btn small primary" onClick={() => void restore()} disabled={restoring}>
              {restoring ? '복구하는 중…' : '새 문서로 복구'}
            </button>
            <button type="button" className="btn small" onClick={() => void copy()}>
              내용 복사
            </button>
            <button
              type="button"
              className="btn small danger"
              onClick={() => setConfirming(true)}
              disabled={restoring}
            >
              {pending ? '변경 버리기' : '사본 지우기'}
            </button>
          </div>
        </div>
      </div>
      {restoreError && (
        <p className="field-error" role="alert">
          새 문서로 복구하지 못했어요: {restoreError} 내용은 이 기기에 그대로 남아 있어요.
        </p>
      )}
      {copyState !== 'idle' && (
        <p className={copyState === 'copied' ? 'field-help' : 'field-error'} role="status">
          {copyState === 'copied'
            ? '제목과 본문을 클립보드에 복사했어요.'
            : '복사하지 못했어요. 아래 내용을 직접 선택해 복사해 주세요.'}
        </p>
      )}

      <div className="editor-header">
        <div className="doc-title-wrap">
          <div className="eyebrow">DOCUMENT / {typeLabel} · 삭제됨</div>
          <label className="sr-only" htmlFor="doc-title">
            문서 제목
          </label>
          <input id="doc-title" className="doc-title" value={draft.title} placeholder="제목 없음" readOnly />
          <p>{pending ? '서버에 반영되지 않은 변경 · 읽기 전용' : '이 기기에 저장해 둔 사본 · 읽기 전용'}</p>
        </div>
      </div>
      <section className="doc-body">
        <label className="field-label" htmlFor="doc-text">
          본문
        </label>
        <textarea id="doc-text" className="field-textarea doc-text" value={bodyText} readOnly />
      </section>

      {confirming && (
        <ConfirmDialog
          title={pending ? '변경을 버릴까요?' : '사본을 지울까요?'}
          message={
            pending
              ? '이 기기에만 남아 있는 변경이 영구히 사라져요. 서버에도 없는 내용이라 되돌릴 수 없어요.'
              : '이 기기에 저장해 둔 사본을 지워요. 되돌릴 수 없어요.'
          }
          confirmLabel={pending ? '버리기' : '지우기'}
          danger
          onConfirm={async () => {
            await onDiscard()
            setConfirming(false)
            setCopyState('idle')
            setRestoreError(null)
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </article>
  )
}
