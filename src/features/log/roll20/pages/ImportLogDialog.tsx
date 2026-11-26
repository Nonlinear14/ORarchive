import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../../../../components/Icon'
import { Modal } from '../../../../components/Modal'
import { documentPath } from '../../../../lib/documents'
import { errorMessageOf } from '../../../../lib/documentSync'
import { useRepository } from '../../../../lib/useRepository'
import { RULE_SUGGESTIONS, serializeLog } from '../model'
import { parseRoll20Log, type ParseResult } from '../parse'

/** 편집본 크기 한도. 이보다 크면 자동 저장이 느려지고 무료 DB 용량을 많이 써서 막는다 */
const MAX_CONTENT_BYTES = 8 * 1024 * 1024

type Tab = 'file' | 'paste'

function Summary({ result, fileName }: { result: ParseResult; fileName?: string }) {
  const { stats } = result
  const n = (v: number) => v.toLocaleString('ko-KR')
  return (
    <div className="import-summary callout good-callout" role="status">
      <Icon name="check" />
      <div>
        <b>{fileName ?? '붙여 넣은 로그'}</b>
        <span>
          메시지 {n(stats.messages)}개 · 화자 {n(stats.speakers)}명 · 귓속말 {n(stats.whispers)}개 · 숨긴 메시지 {n(stats.hidden)}개 ·{' '}
          {stats.sheetCss ? '시트 판정 디자인 찾음' : '시트 판정 디자인 없음 (기본 모양)'}
        </span>
        {stats.brokenAvatars > 0 && (
          <span className="warn-line">
            <Icon name="alert" /> 저널 {n(stats.brokenAvatars)}개가 PC 폴더 경로예요. 불러온 뒤 캐릭터 설정에서 주소를 넣을 수 있어요.
          </span>
        )}
        {stats.brokenImages > 0 && (
          <span className="warn-line">
            <Icon name="alert" /> 메시지 속 이미지 {n(stats.brokenImages)}개도 PC 폴더 경로라 내보낸 파일에서 보이지 않아요. 'HTML만'으로 저장한 파일을 쓰면 원래 주소가 남아요.
          </span>
        )}
      </div>
    </div>
  )
}

/** 새 Roll20 로그 불러오기: HTML 파일 올리기 / 채팅 아카이브 붙여넣기 */
export function ImportLogDialog({ onClose }: { onClose(): void }) {
  const repo = useRepository()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('file')
  const [reading, setReading] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [fileName, setFileName] = useState<string | undefined>()
  const [title, setTitle] = useState('')
  const [rule, setRule] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function read(html: string, name?: string) {
    setError(null)
    setResult(null)
    setReading(true)
    // 큰 로그는 읽는 데 시간이 걸린다 — '읽는 중' 표시가 먼저 그려지도록 다음 틱에 읽는다
    setTimeout(() => {
      try {
        const parsed = parseRoll20Log(html, name)
        setResult(parsed)
        setFileName(name)
        setTitle(parsed.title ?? '')
        setRule(parsed.content.rule)
      } catch (err) {
        setError(errorMessageOf(err))
      } finally {
        setReading(false)
      }
    }, 0)
  }

  async function readFile(file: File | undefined) {
    if (!file) return
    if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') {
      setError('HTML 파일(.html)만 올릴 수 있어요.')
      return
    }
    read(await file.text(), file.name)
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragging(false)
    void readFile(event.dataTransfer.files[0])
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const html = event.clipboardData.getData('text/html')
    const text = event.clipboardData.getData('text/plain')
    event.preventDefault()
    // 페이지에서 복사하면 text/html, 페이지 소스를 복사하면 글자(text/plain)로 HTML 이 들어온다
    const source = html || (/<div[^>]+class="[^"]*message/.test(text) ? text : '')
    if (!source) {
      setError('채팅 내용을 찾지 못했어요. 채팅 아카이브 페이지에서 Ctrl+A 로 전체 선택한 뒤 복사해 주세요.')
      return
    }
    read(source)
  }

  async function create() {
    if (!result) return
    const content = serializeLog({ ...result.content, rule: rule.trim() })
    if (JSON.stringify(content).length > MAX_CONTENT_BYTES) {
      setError('로그가 너무 커서 저장할 수 없어요. 채팅 아카이브를 기간별로 나눠서 불러와 주세요.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const doc = await repo.create({ type: 'log', title: title.trim() || 'Roll20 로그', content })
      navigate(documentPath(doc.type, doc.id))
    } catch (err) {
      setError(errorMessageOf(err))
      setSaving(false)
    }
  }

  return (
    <Modal title="Roll20 로그 불러오기" eyebrow="LOG EDITOR / ROLL20" onClose={onClose} wide>
      <div className="segmented import-tabs" role="tablist" aria-label="불러오는 방법">
        <button type="button" role="tab" aria-selected={tab === 'file'} className={tab === 'file' ? 'active' : ''} onClick={() => setTab('file')}>
          <Icon name="upload" /> HTML 파일 올리기
        </button>
        <button type="button" role="tab" aria-selected={tab === 'paste'} className={tab === 'paste' ? 'active' : ''} onClick={() => setTab('paste')}>
          <Icon name="paste" /> 붙여넣기
        </button>
      </div>

      {tab === 'file' ? (
        <div role="tabpanel" aria-label="HTML 파일 올리기">
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
            <b>저장한 채팅 로그 HTML 파일을 끌어다 놓거나 눌러서 고르세요</b>
            <small>Roll20 채팅 아카이브에서 Ctrl+S → 파일 형식 '웹페이지, HTML만'으로 저장한 파일</small>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              className="sr-only"
              aria-label="채팅 로그 HTML 파일"
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
          </label>
          <p className="field-help">
            '웹페이지, 전체'로 저장하면 저널 이미지 주소가 PC 폴더 경로로 바뀌어 다른 사람에게 보이지 않아요. 'HTML만'으로 저장하면 원래 이미지 주소가 그대로 남아요.
          </p>
        </div>
      ) : (
        <div role="tabpanel" aria-label="붙여넣기">
          <ol className="import-steps">
            <li>
              Roll20 채팅 아카이브를 열고 <b>Show on One Page</b>를 누릅니다.
            </li>
            <li>
              페이지에서 <b>Ctrl+A</b>로 전체 선택한 뒤 <b>Ctrl+C</b>로 복사합니다.
            </li>
            <li>
              아래 칸을 누르고 <b>Ctrl+V</b>로 붙여 넣습니다.
            </li>
          </ol>
          <textarea className="pastezone" aria-label="채팅 로그 붙여넣기" placeholder="여기를 누르고 Ctrl+V" value="" onChange={() => {}} onPaste={onPaste} />
          <p className="field-help">
            브라우저 확장 프로그램이 채팅 모양을 바꾸고 있다면 끄고 복사해 주세요. 붙여넣기로는 시트 판정 디자인이 함께 오지 않아 기본 모양으로 보여요.
          </p>
        </div>
      )}

      {reading && <p className="field-help" role="status">로그를 읽는 중이에요… 메시지가 많으면 몇 초 걸려요.</p>}
      {error && (
        <div className="callout danger" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      )}
      {result && <Summary result={result} fileName={fileName} />}

      {result && (
        <>
          <label className="field-label import-name" htmlFor="import-title">
            로그 이름
          </label>
          <input id="import-title" className="field-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          <label className="field-label import-name" htmlFor="import-rule">
            룰
          </label>
          <input
            id="import-rule"
            className="field-input"
            value={rule}
            maxLength={60}
            list="rule-suggestions"
            placeholder="예: 크툴루의 부름 (비우면 '기타')"
            onChange={(e) => setRule(e.target.value)}
          />
          <datalist id="rule-suggestions">
            {RULE_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <p className="field-help">{result.content.rule ? `시트 판정 양식으로 '${result.content.rule}'을(를) 찾았어요. 바꿀 수 있어요.` : '룰을 알아내지 못했어요. 직접 입력하거나 비워 두세요.'}</p>
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
