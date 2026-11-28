import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { PendingItem } from '../lib/backgroundSync'
import { formatRelativeTime } from '../lib/format'
import { documentPath } from '../lib/documents'
import { usePendingChanges } from '../lib/sync/context'
import { Icon } from './Icon'
import './PendingIndicator.css'

function stateView(item: PendingItem): { label: string; tone: string } {
  if (item.conflict === 'changed') return { label: '충돌 · 선택 필요', tone: 'red' }
  if (item.conflict === 'deleted') return { label: '서버에서 삭제됨', tone: 'red' }
  if (item.unsaved) return { label: '저장하지 않음 · 열어서 저장', tone: 'gold' }
  return { label: '전송 대기', tone: 'gold' }
}

/**
 * 상단바: 아직 서버에 반영되지 않은 변경(닫힌 탭이 남긴 것 포함) 수와 목록.
 * 충돌한 변경은 문서 화면에서 어느 쪽을 남길지 고르고, 서버에서 삭제된 문서의 변경은 문서 화면(복구 화면)에서
 * 내용을 확인한 뒤 새 문서로 복구·복사·버리기를 고른다. 여기서 바로 버리지는 않는다.
 */
/**
 * 핸드아웃 · 롤꾸코드는 그 편집기로 바로 연다. 그 밖(로그 · 종류를 모르는 이전 기록)은 문서 주소로 —
 * 문서 주소가 내용을 보고 맞는 편집기로 넘긴다 (Roll20 로그 / 코코포리아 로그 / 아주 예전 형식 로그)
 */
const openPath = (item: PendingItem) =>
  item.docType === 'handout' || item.docType === 'roll20code' ? documentPath(item.docType, item.docId) : `/documents/${item.docId}`

export function PendingIndicator() {
  const { items } = usePendingChanges()
  const [open, setOpen] = useState(false)
  const popId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (items.length === 0) return null

  const hasConflict = items.some((item) => item.conflict !== null)
  const label = `동기화되지 않은 변경 ${items.length}개`

  return (
    <div className="pending-menu" ref={rootRef}>
      <button
        type="button"
        className={hasConflict ? 'pending-trigger danger' : 'pending-trigger'}
        aria-label={label}
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={hasConflict ? 'alert' : 'offline'} />
        <span className="pending-trigger-text">{label}</span>
        <span className="pending-count" aria-hidden="true">
          {items.length}
        </span>
      </button>
      {open && (
        <div className="pending-pop" id={popId} role="region" aria-label="동기화되지 않은 변경 목록">
          <p className="pending-pop-head">
            이 기기에만 저장된 변경이에요. 연결되면 자동으로 보내고, 다른 기기와 충돌했거나 서버에서 삭제된 문서의 변경은
            문서를 열어 선택해 주세요.
          </p>
          <ul className="pending-list">
            {items.map((item) => {
              const view = stateView(item)
              return (
                <li key={item.key} className="pending-row">
                  <Link to={openPath(item)} className="pending-link" onClick={() => setOpen(false)}>
                    <strong>{item.title.trim() || '제목 없음'}</strong>
                    <small>{formatRelativeTime(new Date(item.savedAt).toISOString())} 편집</small>
                  </Link>
                  <span className={`tag ${view.tone}`}>{view.label}</span>
                  {item.conflict === 'deleted' && (
                    <Link to={openPath(item)} className="text-link" onClick={() => setOpen(false)}>
                      열어서 복구
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
