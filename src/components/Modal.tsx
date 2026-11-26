import { useEffect, useId, useRef, type ReactNode } from 'react'
import './Modal.css'

interface ModalProps {
  title: string
  eyebrow?: string
  onClose(): void
  children: ReactNode
  /** 넓은 창 (코드 보기 등) */
  wide?: boolean
}

/** 목업의 modal-overlay / modal-card. Esc·배경 클릭으로 닫힌다. */
export function Modal({ title, eyebrow, onClose, children, wide = false }: ModalProps) {
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = cardRef.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.modal-x)')
    first?.focus()
    return () => previous?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={wide ? 'modal-card wide' : 'modal-card'} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={cardRef}>
        <button type="button" className="modal-x" aria-label="닫기" onClick={onClose}>
          ×
        </button>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
