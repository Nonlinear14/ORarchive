import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmLabel: string
  /** 입력해야 확인 버튼이 켜지는 문구 (계정 삭제처럼 되돌릴 수 없는 작업용) */
  requireText?: string
  danger?: boolean
  onConfirm(): Promise<void>
  onClose(): void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  requireText,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const ready = !requireText || typed.trim() === requireText

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={busy ? () => {} : onClose}>
      <div className="confirm-message">{message}</div>
      {requireText && (
        <div className="confirm-type">
          <label className="field-label" htmlFor="confirm-text">
            확인을 위해 &lsquo;{requireText}&rsquo;를 입력하세요
          </label>
          <input
            id="confirm-text"
            className="field-input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
          />
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          취소
        </button>
        <button
          type="button"
          className={danger ? 'btn danger solid' : 'btn primary'}
          onClick={confirm}
          disabled={busy || !ready}
        >
          {busy ? '처리 중…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
