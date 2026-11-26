import { useEffect } from 'react'
import type { DocumentRecord } from '../../lib/documents'
import type { ConflictChoice } from '../../lib/documentSync'
import { formatRelativeTime } from '../../lib/format'
import { Icon } from '../Icon'
import './DocumentEditor.css'

interface ConflictBannerProps {
  server: DocumentRecord | null
  onResolve(choice: ConflictChoice): void
}

/** 휴대폰 화면 (하단 메뉴가 보이는 너비). ConflictBanner 는 여기서 화면 아래에 고정된다 (DocumentEditor.css) */
const MOBILE_QUERY = '(max-width: 750px)'

/**
 * 다른 기기와 충돌했을 때 어느 쪽을 남길지 고르게 한다 (useDocument 의 conflict).
 * PC 에서는 편집 화면 머리 아래에 붙고, 휴대폰에서는 화면 아래(하단 메뉴 위)에 고정돼 스크롤해도 보인다.
 */
export function ConflictBanner({ server, onResolve }: ConflictBannerProps) {
  // 휴대폰: 입력 중이던 칸에서 커서를 빼 키보드를 내린다 (키보드가 안내를 가리지 않게). 입력한 글자는 그대로 남는다.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia(MOBILE_QUERY).matches) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active.matches('[contenteditable]:not([contenteditable="false"]), input, textarea')) active.blur()
  }, [])

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
