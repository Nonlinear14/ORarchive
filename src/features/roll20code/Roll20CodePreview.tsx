import { useDocumentContent } from '../../lib/useDocumentContent'
import { ChatPreview } from './editor/ChatPreview'
import { resolveRoll20Code } from './model'
import './roll20Code.css'

const NO_ANSWERS = {}

/** 저장된 롤꾸코드 미리보기 (목록 카드 · 템플릿 선택 창) */
export function Roll20CodePreview({ id }: { id: string }) {
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
  return <Roll20CodeThumb code={resolveRoll20Code(content).code} />
}

/** 카드 안 작은 Roll20 채팅 미리보기 */
export function Roll20CodeThumb({ code }: { code: string }) {
  return (
    <div className="r20-thumb" aria-hidden="true">
      <ChatPreview code={code} answers={NO_ANSWERS} />
    </div>
  )
}
