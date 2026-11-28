import type { SaveStatus } from '../lib/documentSync'
import { Icon, type IconName } from './Icon'

const statusView: Record<SaveStatus, { label: string; tone: string; icon: IconName }> = {
  saving: { label: '저장 중', tone: '', icon: 'cloud' },
  saved: { label: '저장됨', tone: 'good', icon: 'cloud' },
  offline: { label: '오프라인', tone: 'gold', icon: 'offline' },
  error: { label: '저장 실패', tone: 'red', icon: 'alert' },
  conflict: { label: '충돌 발생', tone: 'red', icon: 'alert' },
  unsaved: { label: '저장하지 않은 변경 있음', tone: 'gold', icon: 'edit' },
}

/** 목업의 `tag good` 스타일 저장 상태 칩 */
export function SaveStatusChip({ status }: { status: SaveStatus }) {
  const view = statusView[status]
  return (
    <span className={view.tone ? `tag ${view.tone}` : 'tag'} role="status" aria-live="polite" data-status={status}>
      <Icon name={view.icon} /> {view.label}
    </span>
  )
}
