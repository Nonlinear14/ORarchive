import { useNavigate } from 'react-router'
import { PageHeading } from '../../../../components/PageHeading'
import '../roll20Log.css'
import { ImportLogDialog } from './ImportLogDialog'

/**
 * /studio/log/roll20 — 로그 아카이브 › Roll20 로그 편집: 로그 등록 창을 띄운다 (핸드아웃 편집과 같은 방식).
 * 등록하면 그 로그의 편집기가 열린다. 저장된 로그는 로그 목록에서 연다.
 */
export default function Roll20LogStartPage() {
  const navigate = useNavigate()
  const close = () => {
    // 앱 안에서 왔으면 이전 화면으로, 바로 들어왔으면 로그 목록으로
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/logs', { replace: true })
  }
  return (
    <>
      <PageHeading
        title="Roll20 로그 편집"
        eyebrow="LOG ARCHIVE / ROLL20"
        description="Roll20 채팅 아카이브를 불러와 다듬고, HTML 파일이나 블로그용 코드로 내보내세요. 저장된 로그는 로그 목록에서 열 수 있어요."
      />
      <ImportLogDialog onClose={close} />
    </>
  )
}
