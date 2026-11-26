import { useId, useState, type FormEvent } from 'react'
import { Icon } from '../../../components/Icon'
import {
  removeImage,
  setAccent,
  setFont,
  setImage,
  setTheme,
  switchTemplate,
  type HandoutEdit,
  type ImagePatch,
} from '../edits'
import {
  fontChoices,
  fontLabels,
  fontStacks,
  MAX_ALT_LENGTH,
  normalizeHex,
  validateImageUrl,
  type HandoutContent,
  type HandoutImage,
} from '../model'
import { accentPalette, handoutTemplates, resolveLook } from '../templates'

interface PanelProps {
  /** 보기 (검사·정규화한 값). 보여 주고 "이미 고른 값인가" 비교하는 데만 쓴다 */
  content: HandoutContent
  /** 저장된 content 에 적용할 편집 — 고친 경로만 바뀐다 (edits.ts) */
  onEdit(edit: HandoutEdit): void
}

function TemplateSection({ content, onEdit }: PanelProps) {
  return (
    <div className="panel-section">
      <span className="field-label" id="studio-template-label">
        템플릿
      </span>
      <div className="template-switch" role="group" aria-labelledby="studio-template-label">
        {handoutTemplates.map((template) => {
          const active = template.id === content.templateId
          return (
            <button
              key={template.id}
              type="button"
              className={active ? 'template-option active' : 'template-option'}
              aria-pressed={active}
              onClick={() => !active && onEdit((stored) => switchTemplate(stored, template.id))}
            >
              <span
                className="template-option-dot"
                style={{ background: template.themes[0].colors.paper, borderColor: template.themes[0].colors.border }}
                aria-hidden="true"
              />
              <span>
                <b>{template.name}</b>
                <small>{template.kind}</small>
              </span>
            </button>
          )
        })}
      </div>
      <p className="field-help">
        템플릿을 바꿔도 입력한 글은 지워지지 않아요. 새 템플릿에 없는 칸의 글은 숨겨 두었다가 그 칸이 있는 템플릿으로 돌아오면 다시 보여요.
      </p>
    </div>
  )
}

function ThemeSection({ content, onEdit }: PanelProps) {
  const look = resolveLook(content)
  return (
    <div className="panel-section">
      <span className="field-label" id="studio-theme-label">
        테마
      </span>
      <div className="swatches" role="group" aria-labelledby="studio-theme-label">
        {look.template.themes.map((theme) => {
          const active = theme.id === look.theme.id
          return (
            <button
              key={theme.id}
              type="button"
              className={active ? 'swatch selected' : 'swatch'}
              aria-pressed={active}
              aria-label={`${theme.label} 테마`}
              title={theme.label}
              data-theme-id={theme.id}
              style={{ background: theme.colors.paper, outlineColor: theme.colors.border }}
              // 이미 보이는 테마를 다시 눌러도 저장된 값은 건드리지 않는다 (템플릿에 없는 저장 테마를 첫 테마로 그리는 중이어도)
              onClick={() => !active && onEdit((stored) => setTheme(stored, theme.id))}
            />
          )
        })}
      </div>
      <p className="field-help">
        {look.theme.label} · 테마를 바꿔도 입력한 내용은 그대로 유지됩니다.
      </p>
    </div>
  )
}

function AccentSection({ content, onEdit }: PanelProps) {
  const inputId = useId()
  // 보이는 강조 색: 정규화한 '#rrggbb', 저장된 값이 없거나 쓸 수 없으면 undefined (테마 기본값)
  const current = content.style.accent
  const [draft, setDraft] = useState(current ?? '')
  const [error, setError] = useState<string | null>(null)

  const choose = (accent: string | undefined) => {
    setError(null)
    setDraft(accent ?? '')
    // 보이는 색이 그대로면 저장된 값은 건드리지 않는다: 같은 색을 다시 고름 · 고치지 않은 입력 칸에서 포커스가 빠짐(blur → apply) ·
    // 표기만 다른 같은 색(저장된 '#ABC' 와 '#aabbcc') · 쓸 수 없는 저장 값을 그리던 테마 기본값을 다시 고름
    if (accent !== current) onEdit((stored) => setAccent(stored, accent))
  }

  function apply(event?: FormEvent) {
    event?.preventDefault()
    if (!draft.trim()) {
      choose(undefined)
      return
    }
    const hex = normalizeHex(draft)
    if (!hex) {
      setError('#RRGGBB 형식의 색을 입력해 주세요. (예: #9b3b2f)')
      return
    }
    choose(hex)
  }

  return (
    <div className="panel-section">
      <span className="field-label" id="studio-accent-label">
        강조 색
      </span>
      <div className="swatches" role="group" aria-labelledby="studio-accent-label">
        <button
          type="button"
          className={current ? 'swatch swatch-default' : 'swatch swatch-default selected'}
          aria-pressed={!current}
          aria-label="테마 기본 강조 색"
          title="테마 기본값"
          onClick={() => choose(undefined)}
        >
          <span aria-hidden="true">A</span>
        </button>
        {accentPalette.map((item) => (
          <button
            key={item.color}
            type="button"
            className={current === item.color ? 'swatch selected' : 'swatch'}
            aria-pressed={current === item.color}
            aria-label={`강조 색 ${item.label}`}
            title={item.label}
            style={{ background: item.color }}
            onClick={() => choose(item.color)}
          />
        ))}
      </div>
      <form className="inline-form" onSubmit={apply}>
        <label className="sr-only" htmlFor={inputId}>
          강조 색 직접 입력 (hex)
        </label>
        <span className="hex-preview" style={{ background: normalizeHex(draft) ?? 'transparent' }} aria-hidden="true" />
        <input
          id={inputId}
          className="field-input"
          value={draft}
          maxLength={7}
          placeholder="#9b3b2f"
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
    </div>
  )
}

function FontSection({ content, onEdit }: PanelProps) {
  const look = resolveLook(content)
  return (
    <div className="panel-section">
      <span className="field-label" id="studio-font-label">
        글꼴
      </span>
      <div className="segmented font-switch" role="group" aria-labelledby="studio-font-label">
        {fontChoices.map((font) => (
          <button
            key={font}
            type="button"
            className={look.font === font ? 'active' : ''}
            aria-pressed={look.font === font}
            style={{ fontFamily: fontStacks[font] }}
            // 이미 보이는 글꼴을 다시 누르면 아무것도 바꾸지 않는다 (템플릿 기본 글꼴을 쓰는 중이면 그대로 기본값으로 둔다)
            onClick={() => look.font !== font && onEdit((stored) => setFont(stored, font))}
          >
            {fontLabels[font]}
          </button>
        ))}
      </div>
      <p className="field-help">
        글꼴은 보는 사람의 컴퓨터에 설치된 글꼴로 표시되어 미리보기와 조금 다를 수 있어요.
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

function ImageSection({ content, onEdit }: PanelProps) {
  const image = content.image
  return (
    <div className="panel-section">
      <span className="field-label">이미지 (선택)</span>
      <ImageForm
        // 바깥에서 이미지가 바뀌면(템플릿·서버 버전) 입력 칸을 새 값으로 다시 시작한다
        key={image ? `${image.url}\n${image.alt}` : 'none'}
        image={image}
        onApply={(patch) => onEdit((stored) => setImage(stored, patch))}
        onRemove={() => onEdit(removeImage)}
      />
      <p className="field-help">
        Roll20 에는 공개된 https 이미지만 보여요. 이미지 올리기는 아직 지원하지 않으니, 공개 주소를 붙여 넣어 주세요.
      </p>
    </div>
  )
}

/** 오른쪽 디자인 설정: 템플릿 · 테마 · 강조 색 · 글꼴 · 이미지 */
export function DesignPanel({ content, onEdit }: PanelProps) {
  return (
    <>
      <TemplateSection content={content} onEdit={onEdit} />
      <ThemeSection content={content} onEdit={onEdit} />
      <AccentSection key={content.style.accent ?? ''} content={content} onEdit={onEdit} />
      <FontSection content={content} onEdit={onEdit} />
      <ImageSection content={content} onEdit={onEdit} />
    </>
  )
}
