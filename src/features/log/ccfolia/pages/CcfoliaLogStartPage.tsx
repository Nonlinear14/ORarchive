import { useNavigate } from 'react-router'
import { PageHeading } from '../../../../components/PageHeading'
import '../../roll20/roll20Log.css'
import { ImportCcfoliaDialog } from './ImportCcfoliaDialog'

/** /studio/log/ccfolia — 로그 아카이브 › 코코포리아 로그 편집: 로그 불러오기 창을 띄운다 (Roll20 로그 편집과 같은 방식) */
export default function CcfoliaLogStartPage() {
  const navigate = useNavigate()
  const close = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/logs', { replace: true })
  }
  return (
    <>
      <PageHeading
        title="코코포리아 로그 편집"
        eyebrow="LOG ARCHIVE / CCFOLIA"
        description="코코포리아 로그를 불러와 다듬고, HTML 파일이나 블로그용 코드로 내보내세요. 저장된 로그는 로그 목록에서 열 수 있어요."
      />
      <ImportCcfoliaDialog onClose={close} />
    </>
  )
}
