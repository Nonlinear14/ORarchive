import { useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../../../../components/Icon'
import { Modal } from '../../../../components/Modal'
import { documentPath } from '../../../../lib/documents'
import { errorMessageOf } from '../../../../lib/documentSync'
import { useRepository } from '../../../../lib/useRepository'
import { CCFOLIA_LOG_FORMAT, serializeCcfLog } from '../model'
import { avatarsFromJson } from '../avatars'
import { parseCcfoliaFile, type CcfParseResult } from '../parse'

/** 편집본 크기 한도 (Roll20 로그와 같다) */
const MAX_CONTENT_BYTES = 8 * 1024 * 1024

/** 새 코코포리아 로그 불러오기: "로그 출력"으로 저장한 HTML 파일 또는 JSON 파일 (붙여넣기 없음) */
export function ImportCcfoliaDialog({ onClose }: { onClose(): void }) {
  const repo = useRepository()
  const navigate = useNavigate()
  const [reading, setReading] = useState(false)
  const [result, setResult] = useState<CcfParseResult | null>(null)
  const [fileName, setFileName] = useState<string | undefined>()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function readFile(file: File | undefined) {
    if (!file) return
    if (!/\.(html?|json)$/i.test(file.name) && file.type !== 'text/html' && file.type !== 'application/json') {
      setError('HTML 파일(.html)이나 JSON 파일(.json)만 올릴 수 있어요.')
      return
    }
    const html = await file.text()
    setError(null)
    setResult(null)
    setReading(true)
    setTimeout(() => {
      try {
        const parsed = parseCcfoliaFile(html, file.name)
        setResult(parsed)
        setFileName(file.name)
        setTitle(parsed.title ?? '')
      } catch (err) {
        setError(errorMessageOf(err))
      } finally {
        setReading(false)
      }
    }, 0)
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragging(false)
    void readFile(event.dataTransfer.files[0])
  }

  async function create() {
    if (!result) return
    setSaving(true)
    setError(null)
    // JSON 로그의 프로필 이미지는 저널 크기로 줄여 캐릭터 설정에 넣는다
    let characters = result.content.characters
    if (result.avatars) {
      const shrunk = await avatarsFromJson(result.avatars)
      characters = { ...characters }
      for (const [speaker, avatar] of Object.entries(shrunk.avatars)) characters[speaker] = { ...characters[speaker], avatar }
    }
    const content = serializeCcfLog({ ...result.content, characters })
    if (JSON.stringify(content).length > MAX_CONTENT_BYTES) {
      setError('로그가 너무 커서 저장할 수 없어요. 탭별로 나눠 저장한 파일을 불러와 주세요.')
      setSaving(false)
      return
    }
    try {
      const doc = await repo.create({ type: 'log', title: title.trim() || '코코포리아 로그', content })
      navigate(documentPath(doc.type, doc.id, CCFOLIA_LOG_FORMAT))
    } catch (err) {
      setError(errorMessageOf(err))
      setSaving(false)
    }
  }

  const n = (v: number) => v.toLocaleString('ko-KR')
  return (
    <Modal title="코코포리아 로그 불러오기" eyebrow="LOG ARCHIVE / CCFOLIA" onClose={onClose} wide>
      <label
        className={dragging ? 'dropzone dragging' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Icon name="upload" />
        <b>로그 HTML · JSON 파일을 끌어다 놓거나 눌러서 고르세요</b>
        <small>코코포리아 방 메뉴의 "로그 출력"으로 저장한 파일 (모든 탭 / 탭 하나 모두 돼요). ZIP 파일은 받지 않아요</small>
        <input type="file" accept=".html,.htm,.json,text/html,application/json" className="sr-only" aria-label="코코포리아 로그 파일" onChange={(e) => void readFile(e.target.files?.[0])} />
      </label>

      {reading && <p className="field-help" role="status">로그를 읽는 중이에요… 메시지가 많으면 몇 초 걸려요.</p>}
      {error && (
        <div className="callout danger" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      )}
      {result && (
        <div className="import-summary callout good-callout" role="status">
          <Icon name="check" />
          <div>
            <b>{fileName}</b>
            <span>
              메시지 {n(result.stats.messages)}개 · 캐릭터 {n(result.stats.speakers)}명 · 탭 {n(result.stats.tabs)}개 · 주사위 {n(result.stats.rolls)}개 · system{' '}
              {n(result.stats.system)}개
            </span>
            {result.avatars && (
              <span className="ext-line">
                <Icon name="check" /> 프로필 이미지 {n(Object.keys(result.avatars).length)}명 — 캐릭터마다 가장 많이 쓴 이미지를 저널로 넣어요.
              </span>
            )}
          </div>
        </div>
      )}
      {result && (
        <>
          <label className="field-label import-name" htmlFor="import-title">
            로그 이름
          </label>
          <input id="import-title" className="field-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button type="button" className="btn primary" disabled={!result || saving} onClick={() => void create()}>
          {saving ? '불러오는 중…' : '불러오기'}
        </button>
      </div>
      <p className="field-help">원본 파일은 서버에 올리지 않아요. 불러온 편집본만 내 계정에 비공개로 저장돼요.</p>
    </Modal>
  )
}
