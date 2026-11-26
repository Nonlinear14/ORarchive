import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../../components/Icon'
import { PageHeading } from '../../../components/PageHeading'
import { HandoutCanvas } from '../canvas/HandoutCanvas'
import { createHandoutContent, handoutTemplates, templateCategories, type HandoutTemplate, type TemplateCategory } from '../templates'
import { useCreateHandout } from '../useCreateHandout'
import './TemplateGalleryPage.css'

type Filter = '전체' | TemplateCategory
const filters: Filter[] = ['전체', ...templateCategories]

function TemplateCard({ template, busy, disabled, onStart }: {
  template: HandoutTemplate
  busy: boolean
  disabled: boolean
  onStart(): void
}) {
  const content = useMemo(() => createHandoutContent(template.id), [template.id])
  return (
    <article className="template-card" aria-labelledby={`tpl-${template.id}`}>
      <div className={`template-preview tp-${template.id}`} aria-hidden="true">
        <div className="template-preview-scale">
          <HandoutCanvas content={content} />
        </div>
      </div>
      <div className="template-info">
        <strong id={`tpl-${template.id}`}>{template.name}</strong>
        <small>{template.kind}</small>
        <p>{template.description}</p>
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

/** /templates — 템플릿 아카이브 > 핸드아웃 (기본 템플릿 갤러리). 고르면 그 템플릿으로 핸드아웃을 만들어 스튜디오를 연다 */
export default function TemplateGalleryPage() {
  const [filter, setFilter] = useState<Filter>('전체')
  const { create, busy, error } = useCreateHandout()
  const visible = handoutTemplates.filter((t) => filter === '전체' || t.categories.includes(filter))

  return (
    <>
      <PageHeading
        title="핸드아웃 템플릿"
        eyebrow="TEMPLATE ARCHIVE / HANDOUT"
        description="취향에 맞는 디자인을 골라 내 핸드아웃으로 시작해 보세요."
        action={
          <Link to="/studio/handout" className="btn">
            <Icon name="handout" /> 내 핸드아웃
          </Link>
        }
      />
      <div className="filters" role="group" aria-label="분류 필터">
        {filters.map((key) => (
          <button
            key={key}
            type="button"
            className={filter === key ? 'filter active' : 'filter'}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="section-top">
        <div>
          <h2>기본 템플릿</h2>
          <p>모든 템플릿은 글자 · 테마 · 강조 색 · 글꼴을 바꿔 쓸 수 있어요.</p>
        </div>
        <span className="tag">{visible.length}개의 템플릿</span>
      </div>
      {error && (
        <div className="callout danger gallery-error" role="alert">
          <Icon name="alert" />
          <span>핸드아웃을 만들지 못했어요: {error}</span>
        </div>
      )}
      <div className="template-grid">
        {visible.map((template) => (
          <TemplateCard
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
