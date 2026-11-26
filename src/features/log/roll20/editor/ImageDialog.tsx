import { useState, type DragEvent } from 'react'
import { Icon } from '../../../../components/Icon'
import { Modal } from '../../../../components/Modal'
import { isUsableAvatar, isWebUrl } from '../model'
import { imageFileToLogImage } from './avatarImage'

/** 로그 속 이미지 바꾸기: 이미지 파일(끌어다 놓기·고르기) 또는 외부 링크 주소 */
export function ImageDialog({ current, onApply, onClose }: { current: string; onApply(src: string): void; onClose(): void }) {
  const [url, setUrl] = useState(isWebUrl(current) ? current : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function fromFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      onApply(await imageFileToLogImage(file))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragging(false)
    void fromFile(e.dataTransfer.files[0])
  }

  return (
    <Modal title="이미지 바꾸기" eyebrow="LOG EDITOR / IMAGE" onClose={onClose}>
      <div className="image-current">
        {isUsableAvatar(current) ? <img src={current} alt="" /> : <span className="char-av broken">?</span>}
        <span>{isUsableAvatar(current) ? '지금 이미지' : '지금 이미지는 PC 폴더 경로라 다른 사람에게 보이지 않아요.'}</span>
      </div>
      <span className="field-label">이미지 파일</span>
      <label
        className={dragging ? 'dropzone small-drop dragging' : 'dropzone small-drop'}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Icon name="upload" />
        <b>{busy ? '이미지를 줄이는 중…' : '이미지 파일을 끌어다 놓거나 눌러서 고르세요'}</b>
        <small>긴 쪽을 800px 이하로 줄여 로그 안에 함께 저장해요. 내보낸 파일에도 그대로 들어가요.</small>
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="sr-only"
          aria-label="바꿀 이미지 파일"
          onChange={(e) => void fromFile(e.target.files?.[0])}
        />
      </label>
      <span className="field-label avatar-link-label">외부 링크 주소</span>
      <div className="inline-form">
        <input className="field-input" aria-label="바꿀 이미지 주소" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (!isWebUrl(url)) {
              setError('https:// 로 시작하는 이미지 주소를 넣어 주세요.')
              return
            }
            onApply(url.trim())
            onClose()
          }}
        >
          적용
        </button>
      </div>
      <p className="field-help">일부 블로그는 로그 안에 저장한 이미지를 막을 수 있어요. 그럴 때는 외부 링크 주소를 써 주세요.</p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          닫기
        </button>
      </div>
    </Modal>
  )
}
