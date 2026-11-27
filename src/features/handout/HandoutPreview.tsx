import { useDocumentContent } from '../../lib/useDocumentContent'
import HandoutThumbnail from './HandoutThumbnail'

/** 저장된 핸드아웃 미리보기 (내용을 불러와 줄여 그린다) */
export function HandoutPreview({ id }: { id: string }) {
  const content = useDocumentContent(id)
  if (content === undefined)
    return (
      <div className="recent-preview-empty" aria-hidden="true">
        <span>불러오는 중…</span>
      </div>
    )
  if (content === null)
    return (
      <div className="recent-preview-empty" aria-hidden="true">
        <span>미리보기를 불러오지 못했어요</span>
      </div>
    )
  return <HandoutThumbnail content={content} />
}

