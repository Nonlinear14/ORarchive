import { useMemo } from 'react'
import type { DocumentContent } from '../../lib/documents'
import { HandoutCanvas } from './canvas/HandoutCanvas'
import { resolveHandout } from './templates'
import './pages/TemplateGalleryPage.css'

/** 저장된 핸드아웃을 줄여 그린 읽기 전용 미리보기 (홈 화면 카드용). 저장 값은 건드리지 않는다 */
export default function HandoutThumbnail({ content }: { content: DocumentContent }) {
  const view = useMemo(() => resolveHandout(content), [content])
  return (
    <div className={`template-preview tp-${view.templateId}`} aria-hidden="true">
      <div className="template-preview-scale">
        <HandoutCanvas content={view} />
      </div>
    </div>
  )
}
