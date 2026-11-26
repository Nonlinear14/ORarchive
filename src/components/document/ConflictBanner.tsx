import type { DocumentRecord } from '../../lib/documents'
import type { ConflictChoice } from '../../lib/documentSync'
import { formatRelativeTime } from '../../lib/format'
import { Icon } from '../Icon'
import './DocumentEditor.css'

interface ConflictBannerProps {
  server: DocumentRecord | null
  onResolve(choice: ConflictChoice): void
}

/** 다른 기기와 충돌했을 때 어느 쪽을 남길지 고르게 한다 (useDocument 의 conflict) */
export function ConflictBanner({ server, onResolve }: ConflictBannerProps) {
  return (
    <div className="callout danger conflict-banner" role="alert">
      <Icon name="alert" />
      <div>
        <b>다른 기기에서 이 문서가 먼저 수정되었어요.</b>
        <p>
          {server
            ? `서버 버전(${formatRelativeTime(server.updated_at)} 저장)과 지금 화면의 내용이 다릅니다. 어느 쪽을 남길지 골라 주세요.`
            : '다른 기기에서 이 문서를 삭제했어요.'}
        </p>
        <div className="conflict-actions">
          <button type="button" className="btn small" onClick={() => onResolve('server')}>
            서버 버전 불러오기
          </button>
          {server && (
            <button type="button" className="btn small danger solid" onClick={() => onResolve('mine')}>
              내 변경으로 덮어쓰기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
