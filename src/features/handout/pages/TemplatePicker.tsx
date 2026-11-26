import { useMemo, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { HandoutCanvas } from '../canvas/HandoutCanvas'
import { createHandoutContent, handoutTemplates, type HandoutTemplate } from '../templates'
import { matchesTemplate } from '../templateSearch'
import { useCreateHandout } from '../useCreateHandout'
import './TemplateGalleryPage.css'

function TemplateStartCard({ template, busy, disabled, onStart }: {
  template: HandoutTemplate
  busy: boolean
  disabled: boolean
  onStart(): void
}) {
  const content = useMemo(() => createHandoutContent(template.id), [template.id])
  return (
    <article className="template-card compact" aria-labelledby={`tpl-${template.id}`}>
      <div className={`template-preview tp-${template.id}`} aria-hidden="true">
        <div className="template-preview-scale">
          <HandoutCanvas content={content} />
        </div>
      </div>
      <div className="template-info">
        <strong id={`tpl-${template.id}`}>{template.name}</strong>
        <small>{template.kind}</small>
        <div className="template-themes" aria-label={`테마 ${template.themes.length}가지`}>
          {template.themes.map((theme) => (
            <span
              key={theme.id}
              className="theme-dot"
              title={theme.label}
              style={{ background: theme.colors.paper, borderColor: theme.colors.border }}
            />
          ))}
        </div>
        <button
          type="button"
          className="btn primary small template-start"
          onClick={onStart}
          disabled={disabled}
          aria-label={`${template.name} 템플릿으로 시작`}
        >
          {busy ? '만드는 중…' : '이 템플릿으로 시작'}
        </button>
      </div>
    </article>
  )
}

/** 기본 템플릿 목록 + 검색. 고르면 그 템플릿으로 핸드아웃을 만들어 템플릿 에디터를 연다 */
export function TemplatePicker() {
  const { create, busy, error } = useCreateHandout()
  const [query, setQuery] = useState('')
  const visible = handoutTemplates.filter((template) => matchesTemplate(template, query))
  return (
    <>
      <label className="searchbar picker-search">
        <Icon name="search" />
        <span className="sr-only">템플릿 검색</span>
        <input
          type="search"
          placeholder="이름, 분류, 설명으로 템플릿 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {error && (
        <div className="callout danger gallery-error" role="alert">
          <Icon name="alert" />
          <span>핸드아웃을 만들지 못했어요: {error}</span>
        </div>
      )}
      {visible.length === 0 ? (
        <div className="picker-empty" role="status">
          맞는 템플릿이 없어요. 다른 검색어로 찾아보세요.
        </div>
      ) : (
        <div className="template-grid">
          {visible.map((template) => (
            <TemplateStartCard
              key={template.id}
              template={template}
              busy={busy === template.id}
              disabled={busy !== null}
              onStart={() => void create(template.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}

/** 템플릿 선택 창 (템플릿 에디터 메뉴 · 핸드아웃 화면의 새 핸드아웃 버튼) */
export function TemplatePickerDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="템플릿 선택" eyebrow="TEMPLATE EDITOR" onClose={onClose} wide>
      <p>고른 템플릿으로 새 핸드아웃을 만들고 바로 편집기를 열어요.</p>
      <div className="picker-in-modal">
        <TemplatePicker />
      </div>
    </Modal>
  )
}
