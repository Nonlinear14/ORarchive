import { useId, useState, type FormEvent } from 'react'
import { Icon } from '../../../components/Icon'
import { MAX_FONT_SIZE, MIN_FONT_SIZE, type HandoutLayout, type LayoutBlock, type TextBlock } from '../layout'
import { removeBlock, setBackground, setBlockImage, setBlockRule, setBlockStyle, type LayoutEdit } from '../layoutEdits'
import { MAX_ALT_LENGTH, normalizeHex, validateImageUrl, type HandoutImage } from '../model'

/** 이미지에서 사용자가 고친 부분. url 은 validateImageUrl 로 검사한 주소 */
interface ImagePatch {
  url?: string
  alt?: string
}

interface PanelProps {
  /** 보기 (검사·정규화한 값) */
  layout: HandoutLayout
  selected: LayoutBlock | null
  /** 저장된 content 에 적용할 편집 — 고친 경로만 바뀐다 (layoutEdits.ts) */
  onEdit(edit: LayoutEdit): void
  onAddText(): void
  onAddImage(): void
  onAddRule(): void
  onRemoved(): void
}

/** 색 고르기: 지금 색 동그라미(누르면 색 고르기 창) + HEX 입력 */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange(hex: string): void }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const apply = (event?: FormEvent) => {
    event?.preventDefault()
    const hex = normalizeHex(draft)
    if (!hex) {
      setError('#RRGGBB 형식의 색을 입력해 주세요. (예: #9b3b2f)')
      return
    }
    setError(null)
    setDraft(hex)
    if (hex !== value) onChange(hex)
  }
  return (
    <>
      <form className="color-field" onSubmit={apply}>
        <label className="color-dot" style={{ background: value }} title={`${label} 고르기`}>
          <input
            type="color"
            aria-label={`${label} 고르기`}
            value={value}
            onChange={(event) => {
              setDraft(event.target.value)
              setError(null)
              onChange(event.target.value)
            }}
          />
        </label>
        <label className="sr-only" htmlFor={id}>
          {label} HEX 코드
        </label>
        <input
          id={id}
          className="field-input hex-input"
          value={draft}
          maxLength={9}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
          onBlur={() => apply()}
        />
        <button type="submit" className="btn small">
          적용
        </button>
      </form>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

function BackgroundSection({ layout, onEdit }: PanelProps) {
  return (
    <div className="panel-section">
      <span className="field-label">배경색</span>
      <ColorField key={layout.background} label="배경색" value={layout.background} onChange={(hex) => onEdit((stored) => setBackground(stored, hex))} />
    </div>
  )
}

function SizeStepper({ value, onChange }: { value: number; onChange(size: number): void }) {
  const id = useId()
  const [draft, setDraft] = useState(String(value))
  const clamp = (n: number) => Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(n)))
  const set = (n: number) => {
    const next = clamp(n)
    setDraft(String(next))
    if (next !== value) onChange(next)
  }
  return (
    <div className="size-stepper">
      <button type="button" className="btn small icon-only" aria-label="글자 작게" disabled={value <= MIN_FONT_SIZE} onClick={() => set(value - 1)}>
        −
      </button>
      <label className="sr-only" htmlFor={id}>
        글자 크기 (px)
      </label>
      <input
        id={id}
        className="field-input size-input"
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
        onBlur={() => (draft ? set(Number(draft)) : setDraft(String(value)))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (draft) set(Number(draft))
          }
        }}
      />
      <span className="size-unit">px</span>
      <button type="button" className="btn small icon-only" aria-label="글자 크게" disabled={value >= MAX_FONT_SIZE} onClick={() => set(value + 1)}>
        +
      </button>
    </div>
  )
}

function TextSection({ block, onEdit }: { block: TextBlock; onEdit(edit: LayoutEdit): void }) {
  const style = block.style
  return (
    <div className="panel-section">
      <span className="field-label">글상자 편집</span>
      <span className="field-label sub">글자 색</span>
      <ColorField key={`${block.id}:${style.color}`} label="글자 색" value={style.color} onChange={(color) => onEdit(setBlockStyle(block.id, { color }))} />
      <span className="field-label sub">꾸밈 · 크기</span>
      <div className="text-tools">
        <button
          type="button"
          className={style.bold ? 'btn small icon-only active' : 'btn small icon-only'}
          aria-pressed={!!style.bold}
          aria-label="굵게"
          title="굵게"
          onClick={() => onEdit(setBlockStyle(block.id, { bold: style.bold ? undefined : true }))}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className={style.italic ? 'btn small icon-only active' : 'btn small icon-only'}
          aria-pressed={!!style.italic}
          aria-label="기울임"
          title="기울임"
          onClick={() => onEdit(setBlockStyle(block.id, { italic: style.italic ? undefined : true }))}
        >
          <i style={{ fontFamily: 'Georgia, serif' }}>I</i>
        </button>
        <SizeStepper key={`${block.id}:${style.size}`} value={style.size} onChange={(size) => onEdit(setBlockStyle(block.id, { size }))} />
      </div>
    </div>
  )
}

function BlockSection({ selected, onEdit, onAddText, onAddImage, onAddRule, onRemoved }: PanelProps) {
  return (
    <div className="panel-section">
      <span className="field-label">블록 추가</span>
      <div className="block-add">
        <button type="button" className="btn small" onClick={onAddText}>
          <Icon name="plus" /> 글상자 추가
        </button>
        <button type="button" className="btn small" onClick={onAddImage}>
          <Icon name="image" /> 이미지 추가
        </button>
        <button type="button" className="btn small wide" onClick={onAddRule}>
          <span className="rule-icon" aria-hidden="true" /> 구분선 추가
        </button>
      </div>
      <button
        type="button"
        className="btn small danger block"
        disabled={!selected}
        onClick={() => {
          if (!selected) return
          onEdit(removeBlock(selected.id))
          onRemoved()
        }}
      >
        <Icon name="trash" /> 선택한 블록 삭제
      </button>
      <p className="field-help">
        미리보기에서 블록을 고르고 손잡이(⠿)를 끌어 옮겨요. 다른 블록의 왼쪽·오른쪽 끝에 놓으면 한 줄에 2열로 놓여요.
      </p>
    </div>
  )
}

function ImageForm({ image, onApply, onRemove }: {
  /** 보이는 이미지 (검사·정규화한 주소 — 저장된 표기와 다를 수 있다) */
  image: HandoutImage | null
  /** 고친 부분만 (주소 · 대체 텍스트) */
  onApply(patch: ImagePatch): void
  onRemove(): void
}) {
  const urlId = useId()
  const altId = useId()
  const altErrorId = useId()
  const [url, setUrl] = useState(image?.url ?? '')
  const [alt, setAlt] = useState(image?.alt ?? '')
  const [error, setError] = useState<string | null>(null)
  const [altError, setAltError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    // 고친 칸만 저장한다. 고치지 않은 칸(입력 값 = 보이는 값)은 저장된 값을 한 글자도 바꾸지 않는다 —
    // 보이는 주소는 정규화한 값이라, 고치지 않은 주소를 다시 쓰면 저장된 표기가 바뀐다.
    // 주소 검사·정규화와 대체 텍스트 길이 제한은 새로 입력한 값에만 건다 (자르지 않고 알려 준다)
    const urlEdited = !image || url !== image.url
    const altEdited = !image || alt !== image.alt
    const urlCheck = urlEdited ? validateImageUrl(url) : null
    const nextError = urlCheck && !urlCheck.ok ? urlCheck.error : null
    const nextAltError =
      altEdited && alt.length > MAX_ALT_LENGTH
        ? `대체 텍스트는 ${MAX_ALT_LENGTH}자까지 넣을 수 있어요. 지금 ${alt.length.toLocaleString('ko-KR')}자예요 — 줄여 주세요.`
        : null
    setError(nextError)
    setAltError(nextAltError)
    if (nextError || nextAltError) return
    const patch: ImagePatch = {}
    if (urlCheck?.ok) {
      // 표기만 다르고 보이는 주소와 같은 곳이면 저장된 주소를 그대로 둔다 (입력 칸만 보이는 주소로 되돌린다)
      if (urlCheck.url !== image?.url) patch.url = urlCheck.url
      else setUrl(urlCheck.url)
    }
    if (altEdited) patch.alt = alt
    if (patch.url !== undefined || patch.alt !== undefined) onApply(patch)
  }

  return (
    <form onSubmit={submit} noValidate>
      <label className="field-label sub" htmlFor={urlId}>
        이미지 주소 (https)
      </label>
      <input
        id={urlId}
        className="field-input"
        type="url"
        inputMode="url"
        value={url}
        placeholder="https://example.com/map.png"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setUrl(event.target.value)
          setError(null)
        }}
      />
      <label className="field-label sub" htmlFor={altId}>
        대체 텍스트
      </label>
      {/* maxLength 를 쓰지 않는다: 붙여 넣은 글을 브라우저가 몰래 자르고, 이미 저장된 긴 글은 넘겨도 안 되므로 — 적용할 때 검사해 알린다 */}
      <input
        id={altId}
        className="field-input"
        value={alt}
        placeholder="이미지 설명 (예: 저택 지도)"
        aria-invalid={altError ? true : undefined}
        aria-describedby={altError ? altErrorId : undefined}
        onChange={(event) => {
          setAlt(event.target.value)
          setAltError(null)
        }}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {altError && (
        <p className="field-error" role="alert" id={altErrorId}>
          {altError}
        </p>
      )}
      <div className="panel-actions">
        <button type="submit" className="btn small">
          <Icon name="image" /> {image ? '이미지 바꾸기' : '이미지 넣기'}
        </button>
        {image && (
          <button type="button" className="btn small danger" onClick={onRemove}>
            이미지 빼기
          </button>
        )}
      </div>
    </form>
  )
}


function ImageSection({ block, onEdit }: { block: Extract<LayoutBlock, { type: 'image' }>; onEdit(edit: LayoutEdit): void }) {
  const image = block.url ? { url: block.url, alt: block.alt ?? '' } : null
  return (
    <div className="panel-section">
      <span className="field-label">이미지 편집</span>
      <ImageForm
        key={`${block.id}\n${image ? `${image.url}\n${image.alt}` : 'none'}`}
        image={image}
        onApply={(patch) => onEdit(setBlockImage(block.id, patch))}
        // 이미지를 빼면 빈 이미지 블록(이미지 고르기)으로 — 구분선으로 되돌아가지 않는다
        onRemove={() => onEdit(setBlockImage(block.id, { url: undefined, alt: undefined, rule: undefined }))}
      />
      <p className="field-help">
        Roll20 에는 공개된 https 이미지만 보여요. 이미지 올리기는 아직 지원하지 않으니, 공개 주소를 붙여 넣어 주세요.
      </p>
    </div>
  )
}

function RuleSection({ block, onEdit }: { block: Extract<LayoutBlock, { type: 'image' }>; onEdit(edit: LayoutEdit): void }) {
  const rule = block.rule!
  return (
    <div className="panel-section">
      <span className="field-label">구분선 편집</span>
      <span className="field-label sub">선 색</span>
      <ColorField key={`${block.id}:${rule.color}`} label="구분선 색" value={rule.color} onChange={(color) => onEdit(setBlockRule(block.id, { color }))} />
    </div>
  )
}

/** 고른 블록에 맞는 편집 옵션: 글상자 · 이미지 · 구분선 */
function EditSection({ selected, onEdit }: PanelProps) {
  if (selected?.type === 'text') return <TextSection block={selected} onEdit={onEdit} />
  if (selected?.type === 'image') {
    if (selected.rule && !selected.url) return <RuleSection block={selected} onEdit={onEdit} />
    return <ImageSection block={selected} onEdit={onEdit} />
  }
  return (
    <div className="panel-section">
      <span className="field-label">편집</span>
      <p className="field-help tight">미리보기에서 블록을 고르면 여기에 편집 옵션이 나와요. 글상자는 글자 색 · 굵게 · 기울임 · 크기, 이미지는 주소, 구분선은 선 색.</p>
    </div>
  )
}

/** 오른쪽 디자인 설정: 배경색 · 블록 추가·삭제 · 고른 블록의 편집 옵션 */
export function DesignPanel(props: PanelProps) {
  return (
    <>
      <BackgroundSection {...props} />
      <BlockSection {...props} />
      <EditSection {...props} />
    </>
  )
}
