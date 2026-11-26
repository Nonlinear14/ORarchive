import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { Icon } from '../../../../components/Icon'
import { copyText } from '../../../../lib/clipboard'
import { downloadTextFile } from '../../../../lib/download'
import type { ToastTone } from '../../../../lib/useToast'
import {
  countMatches,
  removeSpeakerMessages,
  replaceAll,
  setCharacter,
  setOption,
  type LogEdit,
} from '../edits'
import { logBlogCode, logFileName, logHtmlFile } from '../export'
import { isWebUrl, speakersOf, type LogOptions, type Roll20LogContent } from '../model'

interface PanelProps {
  content: Roll20LogContent
  title: string
  apply(op: LogEdit): void
  notify(message: string, tone?: ToastTone): void
}

/** 입력이 끝났을 때(포커스가 빠지거나 Enter) 한 번만 반영하는 글자 칸 */
function CommitInput({
  value,
  onCommit,
  label,
  placeholder,
}: {
  value: string
  onCommit(value: string): void
  label: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }
  return (
    <input
      className="field-input"
      aria-label={label}
      placeholder={placeholder}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}

/** 색 고르기: 고르기 창을 닫을 때(change) 한 번만 반영 */
function ColorInput({ value, label, onCommit }: { value: string; label: string; onCommit(value: string): void }) {
  const ref = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onChange = () => commit.current(el.value)
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [])
  return <input ref={ref} type="color" className="char-color" aria-label={label} defaultValue={value} key={value} />
}

function CharacterRow({
  speaker,
  count,
  avatar,
  content,
  apply,
}: {
  speaker: string
  count: number
  avatar?: string
  content: Roll20LogContent
  apply(op: LogEdit): void
}) {
  const setting = content.characters[speaker] ?? {}
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const shown = setting.avatar?.trim() || avatar
  const broken = !!shown && !isWebUrl(shown)
  return (
    <div className={setting.hidden ? 'char-row is-hidden' : 'char-row'}>
      <div className="char-main">
        {shown && !broken ? (
          <img className="char-av" src={shown} alt="" />
        ) : (
          <span className={broken ? 'char-av broken' : 'char-av'} aria-hidden="true">
            {broken ? '?' : speaker.slice(0, 1)}
          </span>
        )}
        <div className="char-name">
          <CommitInput
            value={setting.name ?? speaker}
            label={`${speaker} 표시 이름`}
            onCommit={(name) => apply(setCharacter(speaker, 'name', name.trim() === speaker || !name.trim() ? undefined : name.trim()))}
          />
          <small>
            메시지 {count.toLocaleString('ko-KR')}개{setting.hidden ? ' · 숨김' : ''}
          </small>
        </div>
        <ColorInput
          value={setting.color ?? '#000000'}
          label={`${speaker} 이름 색`}
          onCommit={(color) => apply(setCharacter(speaker, 'color', color === '#000000' ? undefined : color))}
        />
        <button
          type="button"
          className="row-icon"
          aria-expanded={open}
          aria-label={`${speaker} 설정 더 보기`}
          title="아바타 · 숨기기 · 삭제"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="more" />
        </button>
      </div>
      {broken && !open && (
        <div className="char-warn">
          <Icon name="alert" />
          <span>아바타가 PC 폴더 경로라 다른 사람에게 안 보여요.</span>
          <button type="button" className="text-link" onClick={() => setOpen(true)}>
            주소 넣기
          </button>
        </div>
      )}
      {open && (
        <div className="char-more">
          <span className="field-label">아바타 이미지 주소</span>
          <CommitInput
            value={setting.avatar ?? ''}
            label={`${speaker} 아바타 주소`}
            placeholder="https://… (비우면 원래 아바타)"
            onCommit={(url) => apply(setCharacter(speaker, 'avatar', url.trim() && isWebUrl(url) ? url.trim() : undefined))}
          />
          <p className="field-help">https:// 로 시작하는 이미지 주소만 쓸 수 있어요. 비우면 원래 아바타로 돌아가요.</p>
          <div className="char-more-actions">
            <button type="button" className="btn small" onClick={() => apply(setCharacter(speaker, 'hidden', !setting.hidden))}>
              <Icon name="eyeoff" /> {setting.hidden ? '메시지 다시 보이기' : '이 캐릭터 메시지 숨기기'}
            </button>
            <button type="button" className="btn small danger" onClick={() => setConfirming(true)}>
              <Icon name="trash" /> 메시지 모두 삭제
            </button>
          </div>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title="이 캐릭터의 메시지를 모두 지울까요?"
          message={
            <>
              <b>{setting.name ?? speaker}</b>의 메시지 {count.toLocaleString('ko-KR')}개를 로그에서 지웁니다. 되돌리기로 다시 살릴 수 있어요.
            </>
          }
          confirmLabel="모두 삭제"
          danger
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            apply(removeSpeakerMessages(speaker))
            setConfirming(false)
          }}
        />
      )}
    </div>
  )
}

function Toggle({
  label,
  sub,
  count,
  checked,
  onChange,
}: {
  label: string
  sub?: string
  count?: number
  checked: boolean
  onChange(value: boolean): void
}) {
  return (
    <label className="opt-row">
      <span>
        <b>{label}</b>
        {sub && <small>{sub}</small>}
      </span>
      {count !== undefined && <em className="opt-count">{count.toLocaleString('ko-KR')}개</em>}
      <input type="checkbox" role="switch" className="opt-switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange(value: T): void
}) {
  return (
    <>
      <div className="seg-label">{label}</div>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </>
  )
}

function Section({ label, extra, children }: { label: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="panel-section">
      <span className="field-label">
        {label} {extra}
      </span>
      {children}
    </div>
  )
}

export function LogPanel({ content, title, apply, notify }: PanelProps) {
  const speakers = speakersOf(content)
  const { options } = content
  const [find, setFind] = useState('')
  const [replacement, setReplacement] = useState('')
  const matches = countMatches(content.messages, find)
  const set = <K extends keyof LogOptions>(key: K) => (value: LogOptions[K]) => apply(setOption(key, value))
  const count = (pred: (m: Roll20LogContent['messages'][number]) => boolean) => content.messages.filter(pred).length

  return (
    <aside className="panel right-panel log-panel" aria-label="로그 설정">
      <div className="panel-top">
        <h2>로그 설정</h2>
        <Icon name="settings" />
      </div>

      <Section label="캐릭터" extra={<em className="opt-count">{speakers.length}명</em>}>
        {speakers.length === 0 && <p className="field-help">이름이 있는 메시지가 없어요.</p>}
        {speakers.map((s) => (
          <CharacterRow key={s.speaker} {...s} content={content} apply={apply} />
        ))}
        <p className="field-help">이름을 바꾸면 그 캐릭터의 모든 메시지에 한꺼번에 적용돼요.</p>
      </Section>

      <Section label="일괄 정리">
        <Toggle
          label="숨긴 메시지 지우기"
          sub="This message has been hidden."
          count={count((m) => m.kind === 'hidden')}
          checked={options.removeHidden}
          onChange={set('removeHidden')}
        />
        <Toggle label="귓속말 숨기기" count={count((m) => m.kind === 'whisper')} checked={options.hideWhispers} onChange={set('hideWhispers')} />
        <Toggle
          label="주사위 결과 숨기기"
          sub="/r 굴림과 시트 판정"
          count={count((m) => m.kind === 'roll' || (m.html ?? '').includes('sheet-rolltemplate'))}
          checked={options.hideRolls}
          onChange={set('hideRolls')}
        />
        <Toggle label="연속 이름 정리" sub="같은 사람이 이어 말하면 이름을 한 번만" checked={options.collapseNames} onChange={set('collapseNames')} />
        <Toggle label="시간 표시" checked={options.showTime} onChange={set('showTime')} />
      </Section>

      <Section label="찾아 바꾸기">
        <div className="fr-grid">
          <input className="field-input" aria-label="찾을 글자" placeholder="찾을 글자" value={find} onChange={(e) => setFind(e.target.value)} />
          <input
            className="field-input"
            aria-label="바꿀 글자"
            placeholder="바꿀 글자"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
        </div>
        <div className="fr-foot">
          <span className="field-help" role="status">
            {find ? `${matches.toLocaleString('ko-KR')}곳 찾음` : '수정할 수 있는 대사에서만 찾아요'}
          </span>
          <button
            type="button"
            className="btn small"
            disabled={matches === 0}
            onClick={() => {
              apply(replaceAll(find, replacement))
              notify(`${matches.toLocaleString('ko-KR')}곳을 바꿨어요.`)
            }}
          >
            모두 바꾸기
          </button>
        </div>
      </Section>

      <Section label="표시">
        <Segmented
          label="아바타"
          value={options.avatarShape}
          options={[
            ['square', '사각형'],
            ['circle', '원형'],
            ['none', '숨김'],
          ]}
          onChange={set('avatarShape')}
        />
        <Segmented
          label="내 메시지 배경"
          value={options.myBg}
          options={[
            ['roll20', 'Roll20 기본'],
            ['same', '다른 사람과 같게'],
          ]}
          onChange={set('myBg')}
        />
        <Segmented
          label="구분선"
          value={options.divider ? 'show' : 'hide'}
          options={[
            ['show', '표시'],
            ['hide', '숨김'],
          ]}
          onChange={(v) => apply(setOption('divider', v === 'show'))}
        />
      </Section>

      <Section label="내보내기">
        <button
          type="button"
          className="btn primary log-export"
          onClick={() => downloadTextFile(logFileName(title), logHtmlFile(content, title))}
        >
          <Icon name="download" /> HTML 파일 저장
        </button>
        <button
          type="button"
          className="btn log-export"
          onClick={() => {
            const code = logBlogCode(content)
            copyText(code).then(
              () => notify('블로그용 코드를 복사했어요. 블로그 글쓰기의 HTML 편집 모드에 붙여 넣으세요.'),
              () => notify('클립보드 접근을 차단했어요. 브라우저의 클립보드 권한을 확인해 주세요.', 'error'),
            )
          }}
        >
          <Icon name="code" /> 블로그용 코드 복사
        </button>
        <p className="field-help">
          HTML 파일은 바로 열어 볼 수 있는 완성된 페이지예요. 블로그용 코드는 티스토리 등의 HTML 편집 모드에 붙여 넣어요. 시트 판정 디자인도 함께 들어가요.
        </p>
      </Section>

      <div className="panel-section">
        <div className="callout">
          <Icon name="lock" /> <span>원본 파일은 서버에 올리지 않아요. 편집본만 내 계정에 비공개로 저장돼요.</span>
        </div>
      </div>
    </aside>
  )
}
