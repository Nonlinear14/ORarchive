import { useNavigate } from 'react-router'
import { PageHeading } from '../../../components/PageHeading'
import { TemplatePickerDialog } from './TemplatePicker'

/** /studio/handout — 템플릿 에디터 메뉴: 템플릿 선택 창을 띄운다. 고르면 새 핸드아웃을 만들어 편집기를 연다 */
export default function TemplateEditorPage() {
  const navigate = useNavigate()
  const close = () => {
    // 앱 안에서 왔으면 이전 화면으로, 바로 들어왔으면 템플릿 아카이브로
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/templates', { replace: true })
  }
  return (
    <>
      <PageHeading
        title="템플릿 에디터"
        eyebrow="STUDIO / TEMPLATE EDITOR"
        description="템플릿을 골라 새 핸드아웃을 만드세요. 만들어 둔 핸드아웃은 템플릿 아카이브에서 열 수 있어요."
      />
      <TemplatePickerDialog onClose={close} />
    </>
  )
}
