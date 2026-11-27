import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import {
  blockKind,
  DEFAULT_LINE_HEIGHT,
  LINE_STYLES,
  MAX_LETTER_SPACING,
  MAX_LINE_HEIGHT,
  MIN_LETTER_SPACING,
  MIN_LINE_HEIGHT,
  lineSegments,
  MAX_FONT_SIZE,
  MAX_THICKNESS,
  MIN_FONT_SIZE,
  MIN_RULE_LENGTH,
  MIN_THICKNESS,
  MAX_SPACE,
  MIN_SPACE,
  ruleLength,
  type Align,
  type HandoutLayout,
  type LayoutBlock,
  type LineStyle,
  type TextBlock,
  type VAlign,
  VALIGNS,
} from '../layout'
import { removeBlock, setBackground, setBlockValign, setSpaceHeight, setBlockImage, setBlockRule, setBlockStyle, type LayoutEdit } from '../layoutEdits'
import { normalizeHex, validateImageUrl, type HandoutImage } from '../model'

/** 이미지에서 사용자가 고친 부분. url 은 validateImageUrl 로 검사한 주소 */
interface ImagePatch {
  url?: string
  alt?: string
}

interface PanelProps {
  /** 보기 (검사·정규화한 값) */
  layout: HandoutLayout
  /** 고른 블록들 (같은 종류, 하나 이상이면 편집 옵션) */
  selection: LayoutBlock[]
  /** 저장된 content 에 적용할 편집 — 고친 경로만 바뀐다 (layoutEdits.ts). group 이 같으면 되돌리기 한 번으로 묶인다 */
  onEdit(edit: LayoutEdit, group?: string): void
  canUndo: boolean
  canRedo: boolean
  onUndo(): void
  onRedo(): void
  /** 템플릿 처음 모양으로 (확인 창을 거친다) */
  onReset(): void
  onAddText(): void
  onAddImage(): void
  onAddRule(): void
  onAddSpace(): void
  onRemoved(): void
}

/**
 * 색 고르기 (로그 에디터와 같은 방식): 동그라미를 누르면 '색 고르기'와 '기본 색으로'가 나온다.
 * 색 고르기 창에서는 끌면서 골라도 저장하지 않고, 창을 닫으며 고른 색이 정해질 때(change: Enter 등) 한 번만 적용한다.
 * HEX 를 직접 넣어 적용할 수도 있다.
 */
function ColorField({ label, value, onChange, onReset }: { label: string; value: string; onChange(hex: string): void; onReset?: () => void }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 색 고르기 창에서 고른 색이 정해질 때(change) 한 번만 적용 — 끄는 동안(input)은 저장하지 않는다
  useEffect(() => {
    const el = pickRef.current
    if (!el) return
    const onPicked = () => {
      const hex = normalizeHex(el.value)
      if (!hex) return
      setDraft(hex)
      setError(null)
      setOpen(false)
      if (hex !== value) onChange(hex)
    }
    el.addEventListener('change', onPicked)
    return () => el.removeEventListener('change', onPicked)
  }, [open, value, onChange])

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
        <div className="color-wrap" ref={wrapRef}>
          <button
            type="button"
            className="color-dot"
            style={{ background: value }}
            aria-label={`${label} (${value})`}
            aria-expanded={open}
            title={`${label} 고르기`}
            onClick={() => setOpen((v) => !v)}
          />
          {open && (
            <div className="color-pop" role="dialog" aria-label={label}>
              <label className="color-pick">
                <input ref={pickRef} type="color" defaultValue={value} aria-label={`${label} 고르기`} />
                <span>색 고르기</span>
              </label>
              {onReset && (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    onReset()
                    setOpen(false)
                  }}
                >
                  기본 색으로
                </button>
              )}
            </div>
          )}
        </div>
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
      <ColorField
        key={layout.background}
        label="배경색"
        value={layout.background}
        onChange={(hex) => onEdit((stored) => setBackground(stored, hex))}
        onReset={() => onEdit((stored) => setBackground(stored, undefined))}
      />
    </div>
  )
}

/** − 숫자 + (1px 단위, 범위 밖 값은 범위로 맞춘다) */
function NumberStepper({
  value,
  min,
  max,
  step = 1,
  unit = 'px',
  label,
  less,
  more,
  onChange,
}: {
  value: number
  min: number
  max: number
  /** 1 · 0.5 · 0.1 */
  step?: number
  unit?: string
  label: string
  less: string
  more: string
  onChange(value: number): void
}) {
  const id = useId()
  const decimals = step < 1 ? String(step).split('.')[1].length : 0
  const show = (n: number) => (decimals ? n.toFixed(decimals).replace(/\.?0+$/, '') : String(n))
  const [draft, setDraft] = useState(show(value))
  // step 단위로 맞추고 범위 안으로 (부동소수 오차 없이)
  const clamp = (n: number) => Number(Math.min(max, Math.max(min, Math.round(n / step) * step)).toFixed(decimals))
  const set = (n: number) => {
    if (!Number.isFinite(n)) return setDraft(show(value))
    const next = clamp(n)
    setDraft(show(next))
    if (next !== value) onChange(next)
  }
  return (
    <div className="size-stepper">
      <button type="button" className="btn small icon-only" aria-label={less} disabled={value <= min} onClick={() => set(value - step)}>
        −
      </button>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field-input size-input"
        inputMode={decimals || min < 0 ? 'decimal' : 'numeric'}
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(decimals || min < 0 ? /[^0-9.-]/g : /[^0-9]/g, ''))}
        onBlur={() => (draft && draft !== '-' ? set(Number(draft)) : setDraft(show(value)))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (draft && draft !== '-') set(Number(draft))
          }
        }}
      />
      <span className="size-unit">{unit}</span>
      <button type="button" className="btn small icon-only" aria-label={more} disabled={value >= max} onClick={() => set(value + step)}>
        +
      </button>
    </div>
  )
}

const ALIGNS: [Align, string][] = [
  ['left', '왼쪽'],
  ['center', '가운데'],
  ['right', '오른쪽'],
]

function AlignIcon({ align }: { align: Align }) {
  const x = (w: number) => (align === 'left' ? 2 : align === 'right' ? 14 - w : (16 - w) / 2)
  return (
    <svg viewBox="0 0 16 14" width="14" height="12" aria-hidden="true">
      {[12, 8, 12, 6].map((w, i) => (
        <rect key={i} x={x(w)} y={1 + i * 3.4} width={w} height="1.6" rx="0.8" fill="currentColor" />
      ))}
    </svg>
  )
}

const VALIGN_LABELS: Record<VAlign, string> = { top: '위', middle: '가운데', bottom: '아래' }

function VAlignIcon({ valign }: { valign: VAlign }) {
  const y = valign === 'top' ? 2 : valign === 'middle' ? 5 : 8
  return (
    <svg viewBox="0 0 16 14" width="14" height="12" aria-hidden="true">
      <rect x="1" y={valign === 'top' ? 0.5 : valign === 'bottom' ? 12 : 6.2} width="14" height="1.4" rx="0.7" fill="currentColor" opacity="0.45" />
      <rect x="5" y={y - 1.5} width="6" height="5" rx="1" fill="currentColor" />
    </svg>
  )
}

/** 세로 정렬: 2열 줄에서 더 낮은 블록이 놓이는 자리 */
function VAlignTools({ block, editAll }: { block: TextBlock | Extract<LayoutBlock, { type: 'image' }>; editAll: EditAll }) {
  const current = block.valign ?? 'middle'
  return (
    <>
      <span className="field-label sub" id={`valign-${block.id}`}>
        세로 정렬
      </span>
      <div className="align-tools" role="group" aria-labelledby={`valign-${block.id}`}>
        {VALIGNS.map((value) => {
          const active = current === value
          return (
            <button
              key={value}
              type="button"
              className={active ? 'btn small active' : 'btn small'}
              aria-pressed={active}
              aria-label={`세로 ${VALIGN_LABELS[value]} 정렬`}
              title={`${VALIGN_LABELS[value]} 정렬 (2열 줄에서 보여요)`}
              onClick={() => !active && editAll((id) => setBlockValign(id, value))}
            >
              <VAlignIcon valign={value} /> {VALIGN_LABELS[value]}
            </button>
          )
        })}
      </div>
    </>
  )
}

function TextSection({ block, all, editAll }: { block: TextBlock; all: LayoutBlock[]; editAll: EditAll }) {
  const style = block.style
  // 여러 개를 고르면: 하나라도 꺼져 있으면 모두 켜고, 모두 켜져 있으면 모두 끈다
  const allBold = all.every((b) => b.type === 'text' && b.style.bold)
  const allItalic = all.every((b) => b.type === 'text' && b.style.italic)
  return (
    <div className="panel-section">
      <span className="field-label">글상자 편집</span>
      <span className="field-label sub">글자 색</span>
      <ColorField key={`${block.id}:${style.color}`} label="글자 색" value={style.color} onChange={(color) => editAll((id) => setBlockStyle(id, { color }))} />
      <span className="field-label sub">꾸밈 · 크기</span>
      <div className="text-tools">
        <button
          type="button"
          className={allBold ? 'btn small icon-only active' : 'btn small icon-only'}
          aria-pressed={allBold}
          aria-label="굵게"
          title="굵게"
          onClick={() => editAll((id) => setBlockStyle(id, { bold: allBold ? undefined : true }))}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className={allItalic ? 'btn small icon-only active' : 'btn small icon-only'}
          aria-pressed={allItalic}
          aria-label="기울임"
          title="기울임"
          onClick={() => editAll((id) => setBlockStyle(id, { italic: allItalic ? undefined : true }))}
        >
          <i style={{ fontFamily: 'Georgia, serif' }}>I</i>
        </button>
        <NumberStepper
          key={`${block.id}:${style.size}`}
          value={style.size}
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          label="글자 크기 (px)"
          less="글자 작게"
          more="글자 크게"
          onChange={(size) => editAll((id) => setBlockStyle(id, { size }))}
        />
      </div>
      <div className="rule-tools">
        <span className="rule-tool-label">자간</span>
        <NumberStepper
          key={`${block.id}:ls:${style.letterSpacing ?? 0}`}
          value={style.letterSpacing ?? 0}
          min={MIN_LETTER_SPACING}
          max={MAX_LETTER_SPACING}
          step={0.5}
          label="자간 (px)"
          less="자간 좁게"
          more="자간 넓게"
          onChange={(letterSpacing) => editAll((id) => setBlockStyle(id, { letterSpacing }))}
        />
        <span className="rule-tool-label">행간</span>
        <NumberStepper
          key={`${block.id}:lh:${style.lineHeight ?? 1.5}`}
          value={style.lineHeight ?? DEFAULT_LINE_HEIGHT}
          min={MIN_LINE_HEIGHT}
          max={MAX_LINE_HEIGHT}
          step={0.1}
          unit="배"
          label="행간 (글자 크기의 배수)"
          less="행간 좁게"
          more="행간 넓게"
          onChange={(lineHeight) => editAll((id) => setBlockStyle(id, { lineHeight }))}
        />
      </div>
      <span className="field-label sub" id={`align-${block.id}`}>
        가로 정렬
      </span>
      <div className="align-tools" role="group" aria-labelledby={`align-${block.id}`}>
        {ALIGNS.map(([value, label]) => {
          const active = (style.align ?? 'center') === value
          return (
            <button
              key={value}
              type="button"
              className={active ? 'btn small active' : 'btn small'}
              aria-pressed={active}
              aria-label={`${label} 정렬`}
              title={`${label} 정렬`}
              onClick={() => !active && editAll((id) => setBlockStyle(id, { align: value }))}
            >
              <AlignIcon align={value} /> {label}
            </button>
          )
        })}
      </div>
      <VAlignTools block={block} editAll={editAll} />
    </div>
  )
}

function BlockSection({ selection, onEdit, onAddText, onAddImage, onAddRule, onAddSpace, onRemoved }: PanelProps) {
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
        <button type="button" className="btn small" onClick={onAddRule}>
          <span className="rule-icon" aria-hidden="true" /> 구분선 추가
        </button>
        <button type="button" className="btn small" onClick={onAddSpace}>
          <span className="space-icon" aria-hidden="true" /> 공백 추가
        </button>
      </div>
      <button
        type="button"
        className="btn small danger block"
        disabled={selection.length === 0}
        onClick={() => {
          if (selection.length === 0) return
          onEdit((stored) => selection.reduce((acc, b) => removeBlock(b.id)(acc), stored))
          onRemoved()
        }}
      >
        <Icon name="trash" /> 선택한 블록 삭제
      </button>
      <p className="field-help">
        미리보기에서 블록을 고르고 손잡이(⠿)를 끌어 옮겨요. 다른 블록의 왼쪽·오른쪽 끝에 놓으면 한 줄에 2열로 놓여요 (구분선 · 공백은 2열에 놓을 수 없어요).
      </p>
    </div>
  )
}

function ImageForm({ image, onApply, onRemove }: {
  /** 보이는 이미지 (검사·정규화한 주소 — 저장된 표기와 다를 수 있다) */
  image: HandoutImage | null
  /** 고친 주소 (검사한 값) */
  onApply(patch: ImagePatch): void
  onRemove(): void
}) {
  const urlId = useId()
  const [url, setUrl] = useState(image?.url ?? '')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    // 주소를 고쳤을 때만 저장한다. 보이는 주소와 같은 곳이면 저장된 표기를 그대로 둔다
    const check = validateImageUrl(url)
    if (!check.ok) {
      setError(check.error)
      return
    }
    setError(null)
    if (check.url !== image?.url) onApply({ url: check.url })
    else setUrl(check.url)
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
      {error && (
        <p className="field-error" role="alert">
          {error}
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

function ImageSection({ block, editAll }: { block: Extract<LayoutBlock, { type: 'image' }>; editAll: EditAll }) {
  const image = block.url ? { url: block.url, alt: block.alt ?? '' } : null
  return (
    <div className="panel-section">
      <span className="field-label">이미지 편집</span>
      <ImageForm
        key={`${block.id}\n${image ? image.url : 'none'}`}
        image={image}
        onApply={(patch) => editAll((id) => setBlockImage(id, patch))}
        // 이미지를 빼면 빈 이미지 블록(이미지 고르기)으로 — 구분선으로 되돌아가지 않는다
        onRemove={() => editAll((id) => setBlockImage(id, { url: undefined, alt: undefined, rule: undefined }))}
      />
      <VAlignTools block={block} editAll={editAll} />
      <p className="field-help">
        Roll20 에는 공개된 https 이미지만 보여요. 이미지 올리기는 아직 지원하지 않으니, 공개 주소를 붙여 넣어 주세요.
      </p>
    </div>
  )
}

const LINE_LABELS: Record<LineStyle, string> = { solid: '실선', dotted: '점선', dashdot: '1점 쇄선', dashdotdot: '2점 쇄선' }

function LineIcon({ style }: { style: LineStyle }) {
  const segs = lineSegments(36, style, 2)
  const starts = segs.map((_, i) => segs.slice(0, i).reduce((sum, seg) => sum + seg.w, 0))
  return (
    <svg viewBox="0 0 36 4" width="36" height="4" aria-hidden="true">
      {segs.map((seg, i) => (seg.on ? <rect key={i} x={starts[i]} y="1" width={seg.w} height="2" fill="currentColor" /> : null))}
    </svg>
  )
}

function RuleSection({ block, contentWidth, editAll }: { block: Extract<LayoutBlock, { type: 'image' }>; contentWidth: number; editAll: EditAll }) {
  const rule = block.rule!
  const current = rule.style ?? 'solid'
  const length = ruleLength(rule, contentWidth)
  const thickness = rule.thickness ?? 1
  return (
    <div className="panel-section">
      <span className="field-label">구분선 편집</span>
      <span className="field-label sub">선 색</span>
      <ColorField key={`${block.id}:${rule.color}`} label="구분선 색" value={rule.color} onChange={(color) => editAll((id) => setBlockRule(id, { color }))} />
      <span className="field-label sub">길이 · 굵기</span>
      <div className="rule-tools">
        <span className="rule-tool-label">길이</span>
        <NumberStepper
          key={`${block.id}:len:${length}`}
          value={length}
          min={MIN_RULE_LENGTH}
          max={contentWidth}
          label="구분선 길이 (px)"
          less="구분선 짧게"
          more="구분선 길게"
          onChange={(value) => editAll((id) => setBlockRule(id, { length: value }))}
        />
        <span className="rule-tool-label">굵기</span>
        <NumberStepper
          key={`${block.id}:t:${thickness}`}
          value={thickness}
          min={MIN_THICKNESS}
          max={MAX_THICKNESS}
          label="구분선 굵기 (px)"
          less="구분선 얇게"
          more="구분선 굵게"
          onChange={(value) => editAll((id) => setBlockRule(id, { thickness: value }))}
        />
      </div>
      <span className="field-label sub" id={`line-${block.id}`}>
        스타일
      </span>
      <div className="line-styles" role="group" aria-labelledby={`line-${block.id}`}>
        {LINE_STYLES.map((style) => {
          const active = style === current
          return (
            <button
              key={style}
              type="button"
              className={active ? 'btn small active' : 'btn small'}
              aria-pressed={active}
              title={LINE_LABELS[style]}
              onClick={() => !active && editAll((id) => setBlockRule(id, { style }))}
            >
              <LineIcon style={style} />
              <span>{LINE_LABELS[style]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 고른 블록에 맞는 편집 옵션: 글상자 · 이미지 · 구분선 */
const KIND_LABELS = { text: '글상자', image: '이미지', rule: '구분선', space: '공백' } as const

/** 고른 블록에 맞는 편집 옵션: 글상자 · 이미지 · 구분선 · 공백. 여러 개를 고르면 바꾼 값을 모두에 (되돌리기 한 번) */
function EditSection({ selection, layout, onEdit }: PanelProps) {
  const first = selection[0]
  if (!first)
    return (
      <div className="panel-section">
        <span className="field-label">편집</span>
        <p className="field-help tight">
          미리보기에서 블록을 고르면 여기에 편집 옵션이 나와요. Ctrl(Mac 은 Cmd)을 누른 채 누르면 같은 종류의 블록을 여러 개 고를 수 있어요.
        </p>
      </div>
    )
  const editAll: EditAll = (make) => onEdit((stored) => selection.reduce((acc, b) => make(b.id)(acc), stored))
  const kind = blockKind(first)
  const count =
    selection.length > 1 ? (
      <p className="multi-count" role="status">
        {KIND_LABELS[kind]} {selection.length}개 선택됨 · 바꾼 값은 모두에 적용돼요
      </p>
    ) : null
  let body: ReactNode
  if (first.type === 'text') body = <TextSection block={first} all={selection} editAll={editAll} />
  else if (first.type === 'space')
    body = (
      <div className="panel-section">
        <span className="field-label">공백 편집</span>
        <div className="rule-tools">
          <span className="rule-tool-label">높이</span>
          <NumberStepper
            key={`${first.id}:${first.height}`}
            value={first.height}
            min={MIN_SPACE}
            max={MAX_SPACE}
            label="공백 높이 (px)"
            less="공백 낮게"
            more="공백 높게"
            onChange={(height) => editAll((id) => setSpaceHeight(id, height))}
          />
        </div>
      </div>
    )
  else if (kind === 'rule') body = <RuleSection block={first} contentWidth={layout.contentWidth} editAll={editAll} />
  else body = <ImageSection block={first} editAll={editAll} />
  return (
    <>
      {count}
      {body}
    </>
  )
}

type EditAll = (make: (id: string) => LayoutEdit) => void

/** 오른쪽 디자인 설정: 되돌리기 · 다시 실행 · 배경색 · 블록 추가·삭제 · 고른 블록의 편집 옵션 */
export function DesignPanel(props: PanelProps) {
  return (
    <>
      <div className="panel-section history-tools" role="group" aria-label="되돌리기 · 다시 실행">
        <button type="button" className="btn small" disabled={!props.canUndo} onClick={props.onUndo} title="되돌리기 (Ctrl+Z)">
          <Icon name="undo" /> 되돌리기
        </button>
        <button type="button" className="btn small" disabled={!props.canRedo} onClick={props.onRedo} title="다시 실행 (Ctrl+Shift+Z · Ctrl+Y)">
          <Icon name="redo" /> 다시 실행
        </button>
        <button type="button" className="btn small reset-btn" onClick={props.onReset} title="모든 편집 전의 템플릿 처음 모양으로">
          초기화
        </button>
      </div>
      <BackgroundSection {...props} />
      <BlockSection {...props} />
      <EditSection {...props} />
    </>
  )
}
