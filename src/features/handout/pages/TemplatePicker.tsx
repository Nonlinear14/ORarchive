import { useMemo } from 'react'
import { Icon } from '../../../components/Icon'
import { HandoutCanvas } from '../canvas/HandoutCanvas'
import { createHandoutContent, handoutTemplates, type HandoutTemplate } from '../templates'
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

/** 기본 템플릿 4종. 고르면 그 템플릿으로 핸드아웃을 만들어 템플릿 에디터를 연다 */
export function TemplatePicker() {
  const { create, busy, error } = useCreateHandout()
  return (
    <>
      {error && (
        <div className="callout danger gallery-error" role="alert">
          <Icon name="alert" />
          <span>핸드아웃을 만들지 못했어요: {error}</span>
        </div>
      )}
      <div className="template-grid">
        {handoutTemplates.map((template) => (
          <TemplateStartCard
            key={template.id}
            template={template}
            busy={busy === template.id}
            disabled={busy !== null}
            onStart={() => void create(template.id)}
          />
        ))}
      </div>
    </>
  )
}
