import { useState, type RefObject } from 'react'
import { Icon } from '../../../components/Icon'
import { copyRich } from '../../../lib/clipboard'
import type { ToastTone } from '../../../lib/useToast'
import { blockRoll20Html, blockRoll20Text } from '../blockRoll20'
import { downloadDataUrl, handoutJpg } from '../exportImage'
import type { HandoutLayout } from '../layout'
import { handoutFileName } from '../roll20'

const COPY_OK = '롤꾸를 복사했습니다. Roll20 핸드아웃의 내용 칸에 Ctrl+V 로 붙여 넣으세요.'
const COPY_FAIL = '클립보드 접근을 차단했습니다. 브라우저의 클립보드 권한을 확인해 주세요.'

interface ExportBarProps {
  layout: HandoutLayout
  title: string
  /** 화면 밖에 그린 읽기 전용 캔버스 (이미지 파일로 찍는다) */
  snapshot: RefObject<HTMLDivElement | null>
  notify(message: string, tone?: ToastTone): void
}

/** 미리보기 아래 내보내기: 롤꾸 복사 · 이미지 파일 저장(JPG) */
export function ExportBar({ layout, title, snapshot, notify }: ExportBarProps) {
  const [saving, setSaving] = useState(false)

  function copyForRoll20() {
    // 클릭 핸들러 안에서 await 없이 바로 부른다 — 대체 복사가 사용자 활성화 안에서 돌아야 한다
    copyRich(blockRoll20Html(layout), blockRoll20Text(layout)).then(
      () => notify(COPY_OK),
      () => notify(COPY_FAIL, 'error'),
    )
  }

  async function saveJpg() {
    const node = snapshot.current?.querySelector<HTMLElement>('.hc-frame')
    if (!node || saving) return
    setSaving(true)
    try {
      const { dataUrl, skippedImages } = await handoutJpg(node, layout.background)
      const fileName = handoutFileName(title).replace(/\.html$/, '.jpg')
      downloadDataUrl(fileName, dataUrl)
      notify(
        skippedImages
          ? `${fileName} 파일을 저장했습니다. 다른 사이트에서 막아 둔 이미지 ${skippedImages}개는 빼고 저장했어요.`
          : `${fileName} 파일을 저장했습니다.`,
      )
    } catch {
      notify('이미지 파일을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="export-bar" role="group" aria-label="내보내기">
      <button type="button" className="btn primary" data-action="copy-roll20" onClick={copyForRoll20}>
        <Icon name="copy" /> 롤꾸 복사
      </button>
      <button type="button" className="btn" onClick={() => void saveJpg()} disabled={saving}>
        <Icon name="download" /> {saving ? '이미지 만드는 중…' : '이미지 파일 저장 (JPG)'}
      </button>
      <p className="field-help tight">
        롤꾸 복사: Roll20 핸드아웃의 내용 칸에 Ctrl+V 로 붙여 넣으면 디자인이 그대로 들어가요. 글꼴은 Pretendard 가 설치된 컴퓨터에서만
        Pretendard 로 보여요.
      </p>
    </div>
  )
}
