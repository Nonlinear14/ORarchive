import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { copyRich, copyText } from '../../../lib/clipboard'
import { downloadTextFile } from '../../../lib/download'
import type { ToastTone } from '../../../lib/useToast'
import type { HandoutContent } from '../model'
import { handoutDocumentHtml, handoutFileName, roll20Html, roll20Text } from '../roll20'

const COPY_OK = 'Roll20용 핸드아웃을 복사했습니다. Roll20 핸드아웃의 내용 칸에 Ctrl+V 로 붙여 넣으세요.'
const COPY_FAIL =
  '클립보드 접근을 차단했습니다. 브라우저의 클립보드 권한을 확인하거나, HTML 코드 보기에서 직접 복사해 주세요.'

interface ExportPanelProps {
  content: HandoutContent
  title: string
  notify(message: string, tone?: ToastTone): void
}

function HtmlCodeModal({ html, onClose, notify }: { html: string; onClose(): void; notify: ExportPanelProps['notify'] }) {
  return (
    <Modal title="HTML 코드 보기" eyebrow="ROLL20 HTML · 읽기 전용" onClose={onClose} wide>
      <p className="field-help">
        Roll20 에 붙여 넣는 것과 같은 코드예요. 표 기반 레이아웃에 모든 스타일이 인라인으로 들어 있어요.
      </p>
      <textarea className="field-textarea code-preview" value={html} readOnly aria-label="HTML 코드" spellCheck={false} />
      <div className="modal-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            copyText(html).then(
              () => notify('HTML 코드를 복사했습니다.'),
              () => notify('클립보드 접근을 차단했습니다. 코드를 직접 선택해 복사해 주세요.', 'error'),
            )
          }}
        >
          <Icon name="copy" /> 코드 복사
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          확인
        </button>
      </div>
    </Modal>
  )
}

/** 내보내기: Roll20 서식 복사 · HTML 코드 보기 · HTML 파일 저장 */
export function ExportPanel({ content, title, notify }: ExportPanelProps) {
  const [codeOpen, setCodeOpen] = useState(false)

  function copyForRoll20() {
    // 클릭 핸들러 안에서 await 없이 바로 부른다 — 대체 복사가 사용자 활성화 안에서 돌아야 한다
    copyRich(roll20Html(content), roll20Text(content)).then(
      () => notify(COPY_OK),
      () => notify(COPY_FAIL, 'error'),
    )
  }

  function saveFile() {
    const fileName = handoutFileName(title)
    downloadTextFile(fileName, handoutDocumentHtml(content, title))
    notify(`${fileName} 파일을 저장했습니다.`)
  }

  return (
    <div className="panel-section">
      <span className="field-label">내보내기</span>
      <button type="button" className="btn primary block" data-action="copy-roll20" onClick={copyForRoll20}>
        <Icon name="copy" /> Roll20에 복사
      </button>
      <p className="field-help tight">
        Roll20 핸드아웃의 내용 칸에 Ctrl+V로 붙여넣으면 디자인이 그대로 들어갑니다.
        {content.image && ' 이미지는 공개 https 주소일 때만 보여요.'}
      </p>
      <button type="button" className="btn block" onClick={() => setCodeOpen(true)}>
        <Icon name="code" /> HTML 코드 보기
      </button>
      <button type="button" className="btn block" onClick={saveFile}>
        <Icon name="download" /> HTML 파일 저장
      </button>
      {codeOpen && <HtmlCodeModal html={roll20Html(content)} onClose={() => setCodeOpen(false)} notify={notify} />}
    </div>
  )
}
