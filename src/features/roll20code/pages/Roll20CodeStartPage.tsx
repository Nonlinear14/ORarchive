import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../../../components/Icon'
import { ListSearch } from '../../../components/ListSearch'
import { LoadingState } from '../../../components/LoadingState'
import { Modal } from '../../../components/Modal'
import { PageHeading } from '../../../components/PageHeading'
import { documentPath } from '../../../lib/documents'
import { errorMessageOf } from '../../../lib/documentSync'
import { matchesTitle } from '../../../lib/listSearch'
import { useMyDocuments } from '../../../lib/useMyDocuments'
import { useRepository } from '../../../lib/useRepository'
import { copyTitle } from '../../handout/useCopyHandout'
import '../../handout/pages/TemplateGalleryPage.css'
import { ROLL20_CODE_STARTERS, roll20CodeContent } from '../model'
import { Roll20CodePreview, Roll20CodeThumb } from '../Roll20CodePreview'
import '../roll20Code.css'

function PickCard({ id, title, preview, busy, disabled, onUse }: { id: string; title: string; preview: React.ReactNode; busy: boolean; disabled: boolean; onUse(): void }) {
  return (
    <article className="template-card compact pick-card" aria-labelledby={`pick-${id}`}>
      {preview}
      <div className="template-info">
        <strong id={`pick-${id}`}>{title}</strong>
        <button type="button" className="btn primary small template-start" onClick={onUse} disabled={disabled} aria-label={`${title} — 이 템플릿 사용하기`}>
          <Icon name="copy" /> {busy ? '사본을 만드는 중…' : '이 템플릿 사용하기'}
        </button>
      </div>
    </article>
  )
}

/** 롤꾸 선택: 기본 제공 롤꾸 + 내 롤꾸코드 → 사본을 만들어 편집기를 연다 (원본은 그대로) */
export function Roll20CodePicker() {
  const repo = useRepository()
  const navigate = useNavigate()
  const { status, docs, error, reload } = useMyDocuments()
  const [query, setQuery] = useState('')
  const [using, setUsing] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const mine = docs.filter((d) => d.type === 'roll20code' && matchesTitle(d.title, query))
  const starters = ROLL20_CODE_STARTERS.filter((s) => matchesTitle(s.title, query))

  async function create(key: string, make: () => Promise<{ title: string; content: ReturnType<typeof roll20CodeContent> }>) {
    if (using) return
    setUsing(key)
    setFailed(null)
    try {
      const { title, content } = await make()
      const doc = await repo.create({ type: 'roll20code', title, content })
      navigate(documentPath(doc.type, doc.id))
    } catch (err) {
      setFailed(errorMessageOf(err))
      setUsing(null)
    }
  }

  return (
    <>
      <ListSearch label="롤꾸 검색" value={query} onChange={setQuery} />
      {failed && (
        <div className="callout danger gallery-error" role="alert">
          <Icon name="alert" />
          <span>롤꾸를 만들지 못했어요: {failed}</span>
        </div>
      )}
      <h3 className="picker-group">기본 제공 롤꾸</h3>
      {starters.length === 0 ? (
        <div className="picker-empty" role="status">
          이름이 맞는 기본 롤꾸가 없어요.
        </div>
      ) : (
        <div className="template-grid">
          {starters.map((s) => (
            <PickCard
              key={s.id}
              id={`starter-${s.id}`}
              title={s.title}
              busy={using === `starter-${s.id}`}
              disabled={using !== null}
              preview={<Roll20CodeThumb code={s.code} />}
              onUse={() => void create(`starter-${s.id}`, async () => ({ title: s.title, content: roll20CodeContent(s.code) }))}
            />
          ))}
        </div>
      )}
      <h3 className="picker-group">내 롤꾸코드</h3>
      {status === 'loading' && <LoadingState label="내 롤꾸코드를 불러오는 중…" />}
      {status === 'error' && (
        <div className="callout danger" role="alert">
          <Icon name="alert" />
          <span>
            목록을 불러오지 못했어요. ({error}){' '}
            <button type="button" className="text-link" onClick={reload}>
              다시 시도
            </button>
          </span>
        </div>
      )}
      {status === 'ready' && mine.length === 0 && (
        <div className="picker-empty" role="status">
          {query.trim() ? '이름이 맞는 롤꾸코드가 없어요.' : '아직 만든 롤꾸코드가 없어요. 위 기본 롤꾸로 시작해 보세요.'}
        </div>
      )}
      {status === 'ready' && mine.length > 0 && (
        <div className="template-grid">
          {mine.map((d) => (
            <PickCard
              key={d.id}
              id={d.id}
              title={d.title.trim() || '제목 없음'}
              busy={using === d.id}
              disabled={using !== null}
              preview={<Roll20CodePreview id={d.id} />}
              onUse={() =>
                void create(d.id, async () => {
                  const source = await repo.get(d.id)
                  if (!source || source.deleted_at || source.type !== 'roll20code') throw new Error('원본 롤꾸코드를 찾을 수 없어요.')
                  return { title: copyTitle(source.title), content: source.content as ReturnType<typeof roll20CodeContent> }
                })
              }
            />
          ))}
        </div>
      )}
    </>
  )
}

export function Roll20CodePickerDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="롤꾸 선택" eyebrow="ROLL20 CODE EDITOR" onClose={onClose} wide>
      <p>기본 제공 롤꾸나 내 롤꾸코드를 골라 사본으로 새 롤꾸코드를 만들고 바로 편집기를 열어요. 원본은 그대로 남아요.</p>
      <div className="picker-in-modal">
        <Roll20CodePicker />
      </div>
    </Modal>
  )
}

/** /studio/roll20code — 템플릿 아카이브 › 롤꾸코드 편집: 롤꾸 선택 창을 띄운다 */
export default function Roll20CodeStartPage() {
  const navigate = useNavigate()
  const close = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/templates', { replace: true })
  }
  return (
    <>
      <PageHeading
        title="롤꾸코드 편집"
        eyebrow="TEMPLATE ARCHIVE / ROLL20 CODE EDITOR"
        description="Roll20 채팅에 보내는 꾸민 메시지(롤꾸)를 고르고, 글자와 색을 바꿔 복사하세요."
      />
      <Roll20CodePickerDialog onClose={close} />
    </>
  )
}
