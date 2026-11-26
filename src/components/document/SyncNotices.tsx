import type { ConflictChoice, SyncSnapshot } from '../../lib/documentSync'
import { ConflictBanner } from './ConflictBanner'

type SyncNoticesProps = Pick<SyncSnapshot, 'conflict' | 'status' | 'errorMessage' | 'offlineCopy'> & {
  onResolve(choice: ConflictChoice): void
}

/** 편집 화면 머리 아래의 동기화 안내: 충돌 선택 · 저장 실패 · 오프라인 사본 · 오프라인 */
export function SyncNotices({ conflict, status, errorMessage, offlineCopy, onResolve }: SyncNoticesProps) {
  return (
    <>
      {conflict && <ConflictBanner server={conflict.server} onResolve={onResolve} />}
      {status === 'error' && errorMessage && (
        <p className="field-error" role="alert">
          저장하지 못했어요: {errorMessage}
        </p>
      )}
      {offlineCopy && (
        <p className="field-help">
          서버에 연결하지 못해 이 기기에 마지막으로 저장해 둔 사본을 보여 주고 있어요. 연결되면 서버 버전을 다시 확인합니다.
        </p>
      )}
      {status === 'offline' && (
        <p className="field-help">오프라인 상태예요. 변경 내용은 이 기기에 보관했다가 연결되면 자동으로 저장합니다.</p>
      )}
    </>
  )
}
