import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { Icon } from '../../../../components/Icon'
import { Modal } from '../../../../components/Modal'
import type { ToastTone } from '../../../../lib/useToast'
import { countMatches, removeSpeakerMessages, replaceAll, setCharacter, setOption, type LogEdit } from '../edits'
import { type ColorKey, type DetectedColors } from '../detectColors'
import { DESC_KEY, WHISPER_KEY, isUsableAvatar, isWhisperGroup, whispersHidden, isWebUrl, speakersOf, type CharacterSetting, type LogOptions, type Roll20LogContent } from '../model'
import { displayName, extensionSetsDescItalic } from '../render'
import { imageFileToAvatar } from './avatarImage'

interface PanelProps {
  content: Roll20LogContent
  apply(op: LogEdit): void
  notify(message: string, tone?: ToastTone): void
  /** 미리보기에서 읽은 원래 색 (고른 색이 없을 때 동그라미에 보여 준다) */
  detected?: DetectedColors
}

const COLOR_LABELS: Record<ColorKey, string> = { color: '이름', bg: '배경', text: '대사' }

/** 색 동그라미: 누르면 색 고르기와 '기본 색으로'가 나온다 */
function ColorRound({
  speaker,
  name,
  colorKey,
  value,
  detected,
  apply,
}: {
  speaker: string
  /** 화면에 보이는 이름 (desc 서술 등) */
  name: string
  colorKey: ColorKey
  /** 사용자가 고른 색 (저장된 값) */
  value: string | undefined
  /** 불러온 로그의 원래 색 (고른 색이 없을 때 보여 준다) */
  detected?: string
  apply(op: LogEdit): void
}) {
  const shown = value ?? detected
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const label = `${name} ${COLOR_LABELS[colorKey]} 색`

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

  // 색 고르기 창을 닫을 때(change) 한 번만 반영 — 끌며 고르는 동안 저장이 쌓이지 않게
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onChange = () => apply(setCharacter(speaker, colorKey, el.value))
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [open, apply, speaker, colorKey])

  return (
    <div className="color-round" ref={wrapRef}>
      <button
        type="button"
        className={shown ? 'round' : 'round is-default'}
        style={shown ? { background: shown } : undefined}
        aria-label={`${label}${value ? ` (${value})` : detected ? ` (${detected}, 원래 색)` : ' (기본)'}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      <small>{COLOR_LABELS[colorKey]}</small>
      {open && (
        <div className="color-pop" role="dialog" aria-label={label}>
          <label className="color-pick">
            <input ref={inputRef} type="color" defaultValue={shown ?? (colorKey === 'bg' ? '#f1f1f1' : '#000000')} aria-label={`${label} 고르기`} />
            <span>색 고르기</span>
          </label>
          <button
            type="button"
            className="btn small"
            disabled={!value}
            onClick={() => {
              apply(setCharacter(speaker, colorKey, undefined))
              setOpen(false)
            }}
          >
            기본 색으로
          </button>
        </div>
      )}
    </div>
  )
}

/** 저널 바꾸기: 이미지 파일 불러오기(줄여서 로그 안에 저장) 또는 링크 주소 */
function AvatarDialog({
  speaker,
  name,
  setting,
  original,
  apply,
  onClose,
}: {
  speaker: string
  name: string
  setting: CharacterSetting
  original?: string
  apply(op: LogEdit): void
  onClose(): void
}) {
  const [url, setUrl] = useState(setting.avatar && isWebUrl(setting.avatar) ? setting.avatar : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const current = setting.avatar || original

  async function fromFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      apply(setCharacter(speaker, 'avatar', await imageFileToAvatar(file)))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={`${name} 저널`} eyebrow="LOG EDITOR / CHARACTER" onClose={onClose}>
      <div className="avatar-current">
        {current && isUsableAvatar(current) ? <img src={current} alt="" /> : <span className="char-av broken">?</span>}
        <span>{current && !isUsableAvatar(current) ? '지금 저널은 PC 폴더 경로라 다른 사람에게 보이지 않아요.' : '지금 저널'}</span>
      </div>
      <span className="field-label">이미지 파일 불러오기</span>
      <label className="dropzone small-drop">
        <Icon name="upload" />
        <b>{busy ? '이미지를 줄이는 중…' : '이미지 파일 고르기'}</b>
        <small>96×96 크기로 줄여 로그 안에 함께 저장해요. 내보낸 파일에도 그대로 들어가요.</small>
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="sr-only"
          aria-label="저널 이미지 파일"
          onChange={(e) => void fromFile(e.target.files?.[0])}
        />
      </label>
      <span className="field-label avatar-link-label">링크 주소 붙여넣기</span>
      <div className="inline-form">
        <input className="field-input" aria-label="저널 이미지 주소" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (!isWebUrl(url)) {
              setError('https:// 로 시작하는 이미지 주소를 넣어 주세요.')
              return
            }
            apply(setCharacter(speaker, 'avatar', url.trim()))
            onClose()
          }}
        >
          적용
        </button>
      </div>
      <p className="field-help">일부 블로그는 로그 안에 저장한 이미지를 막을 수 있어요. 그럴 때는 링크 주소를 써 주세요.</p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="btn"
          disabled={!setting.avatar}
          onClick={() => {
            apply(setCharacter(speaker, 'avatar', undefined))
            onClose()
          }}
        >
          원래 저널로
        </button>
        <button type="button" className="btn" onClick={onClose}>
          닫기
        </button>
      </div>
    </Modal>
  )
}

function CharacterRow({
  speaker,
  count,
  avatar,
  content,
  detected,
  apply,
}: {
  speaker: string
  count: number
  avatar?: string
  content: Roll20LogContent
  detected?: Partial<Record<ColorKey, string>>
  apply(op: LogEdit): void
}) {
  const setting = content.characters[speaker] ?? {}
  const name = displayName(content, speaker)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const shown = setting.avatar?.trim() || avatar
  const broken = !!shown && !isUsableAvatar(shown)
  return (
    <div className={setting.hidden ? 'char-row is-hidden' : 'char-row'}>
      <div className="char-main">
        <button type="button" className="char-av-btn" aria-label={`${name} 저널 바꾸기`} title="저널 바꾸기" onClick={() => setAvatarOpen(true)}>
          {shown && !broken ? (
            <img className="char-av" src={shown} alt="" />
          ) : (
            <span className={broken ? 'char-av broken' : 'char-av'} aria-hidden="true">
              {broken ? '?' : name.slice(0, 1)}
            </span>
          )}
        </button>
        <div className="char-body">
          <b className="char-name">{name}</b>
          <div className="char-colors">
            {(['color', 'bg', 'text'] as const).map((key) => (
              <ColorRound key={key} speaker={speaker} name={name} colorKey={key} value={setting[key]} detected={detected?.[key]} apply={apply} />
            ))}
          </div>
        </div>
      </div>
      {broken && (
        <div className="char-warn">
          <Icon name="alert" />
          <span>저널이 PC 폴더 경로라 다른 사람에게 안 보여요.</span>
          <button type="button" className="text-link" onClick={() => setAvatarOpen(true)}>
            바꾸기
          </button>
        </div>
      )}
      <div className="char-foot">
        <label className="mini-toggle">
          <input
            type="checkbox"
            role="switch"
            className="opt-switch"
            checked={!!setting.hidden}
            aria-label={`${name} 메시지 숨기기`}
            onChange={(e) => apply(setCharacter(speaker, 'hidden', e.target.checked))}
          />
          <span aria-hidden="true">메시지 숨기기</span>
        </label>
        <button type="button" className="btn small danger" aria-label={`${name} 메시지 모두 삭제`} title="이 캐릭터의 메시지 모두 삭제" onClick={() => setConfirming(true)}>
          <Icon name="trash" /> 모두 삭제
        </button>
      </div>
      {avatarOpen && (
        <AvatarDialog speaker={speaker} name={name} setting={setting} original={avatar} apply={apply} onClose={() => setAvatarOpen(false)} />
      )}
      {confirming && (
        <ConfirmDialog
          title="이 캐릭터의 메시지를 모두 지울까요?"
          message={
            <>
              <b>{name}</b>의 메시지 {count.toLocaleString('ko-KR')}개를 로그에서 지웁니다. 되돌리기로 다시 살릴 수 있어요.
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

/** desc 서술: 캐릭터 목록 맨 위. 배경색·대사색만 (저널·이름·숨기기·삭제 없음) */
function DescRow({
  content,
  detected,
  apply,
}: {
  content: Roll20LogContent
  detected?: Partial<Record<ColorKey, string>>
  apply(op: LogEdit): void
}) {
  const setting = content.characters[DESC_KEY] ?? {}
  return (
    <div className="char-row desc-row">
      <div className="char-main">
        <span className="char-av desc-av" aria-hidden="true">
          desc
        </span>
        <div className="char-body">
          <b className="char-name">desc 서술</b>
          <div className="char-colors">
            {(['bg', 'text'] as const).map((key) => (
              <ColorRound key={key} speaker={DESC_KEY} name="desc 서술" colorKey={key} value={setting[key]} detected={detected?.[key]} apply={apply} />
            ))}
          </div>
        </div>
      </div>
      <div className="char-foot">
        <label className="mini-toggle">
          <input
            type="checkbox"
            role="switch"
            className="opt-switch"
            checked={setting.italic !== false}
            aria-label="desc 서술 기울이기"
            onChange={(e) => apply(setCharacter(DESC_KEY, 'italic', e.target.checked ? undefined : false))}
          />
          <span aria-hidden="true">기울이기</span>
        </label>
        {extensionSetsDescItalic(content) && <small className="char-note">확장 프로그램 설정이 우선 적용돼요</small>}
      </div>
    </div>
  )
}

/**
 * 귓속말: desc 서술 아래. /w 귓속말과 /gr GM 굴림을 묶어 배경 · 이름 · 대사 색과 숨기기를 정한다.
 * 고른 색은 캐릭터 설정보다 우선한다. 로그에 귓속말이 있을 때만 보인다.
 */
function WhisperRow({
  content,
  count,
  detected,
  apply,
}: {
  content: Roll20LogContent
  count: number
  detected?: Partial<Record<ColorKey, string>>
  apply(op: LogEdit): void
}) {
  const setting = content.characters[WHISPER_KEY] ?? {}
  const hidden = whispersHidden(content)
  return (
    <div className={hidden ? 'char-row desc-row whisper-row is-hidden' : 'char-row desc-row whisper-row'}>
      <div className="char-main">
        <span className="char-av desc-av whisper-av" aria-hidden="true">
          귓
        </span>
        <div className="char-body">
          <b className="char-name">
            귓속말 <em className="opt-count">{count.toLocaleString('ko-KR')}개</em>
          </b>
          <div className="char-colors">
            {(['color', 'bg', 'text'] as const).map((key) => (
              <ColorRound key={key} speaker={WHISPER_KEY} name="귓속말" colorKey={key} value={setting[key]} detected={detected?.[key]} apply={apply} />
            ))}
          </div>
        </div>
      </div>
      <div className="char-foot">
        <label className="mini-toggle">
          <input
            type="checkbox"
            role="switch"
            className="opt-switch"
            checked={hidden}
            aria-label="귓속말 메시지 숨기기"
            onChange={(e) => {
              const on = e.target.checked
              // 예전 '귓속말 숨기기'(전체 다듬기)가 켜진 로그는 끌 때 그 설정도 함께 끈다 (한 번에 되돌리기)
              apply((stored) => {
                const next = setCharacter(WHISPER_KEY, 'hidden', on)(stored)
                return !on && content.options.hideWhispers ? setOption('hideWhispers', false)(next) : next
              })
            }}
          />
          <span aria-hidden="true">메시지 숨기기</span>
        </label>
        <small className="char-note">캐릭터 색보다 우선</small>
      </div>
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

export function LogPanel({ content, apply, notify, detected }: PanelProps) {
  const speakers = speakersOf(content)
  const { options } = content
  const [find, setFind] = useState('')
  const [replacement, setReplacement] = useState('')
  const matches = countMatches(content.messages, find)
  const set = <K extends keyof LogOptions>(key: K) => (value: LogOptions[K]) => apply(setOption(key, value))
  const count = (pred: (m: Roll20LogContent['messages'][number]) => boolean) => content.messages.filter(pred).length
  const whisperCount = count(isWhisperGroup)
  const shapes: [LogOptions['avatarShape'], string][] = [
    ['square', '사각형'],
    ['circle', '원형'],
    ['none', '숨김'],
  ]

  return (
    <aside className="panel right-panel log-panel" aria-label="로그 편집">
      <div className="panel-top">
        <h2>로그 편집</h2>
        <Icon name="settings" />
      </div>

      <Section label="전체 다듬기">
        <Toggle
          label="숨긴 메시지 지우기"
          sub="This message has been hidden."
          count={count((m) => m.kind === 'hidden')}
          checked={options.removeHidden}
          onChange={set('removeHidden')}
        />
        <Toggle
          label="주사위 결과 숨기기"
          sub="/r 굴림과 시트 판정"
          count={count((m) => m.kind === 'roll' || (m.html ?? '').includes('sheet-rolltemplate'))}
          checked={options.hideRolls}
          onChange={set('hideRolls')}
        />
        <Toggle label="연속 이름 정리" sub="같은 사람이 이어 말하면 이름을 한 번만" checked={options.collapseNames} onChange={set('collapseNames')} />
        <Toggle label="구분선 표시" sub="메시지 사이의 가는 선" checked={options.divider} onChange={set('divider')} />
        <div className="seg-label">저널 모양</div>
        <div className="segmented" role="radiogroup" aria-label="저널 모양">
          {shapes.map(([v, text]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={options.avatarShape === v}
              className={options.avatarShape === v ? 'active' : ''}
              onClick={() => apply(setOption('avatarShape', v))}
            >
              {text}
            </button>
          ))}
        </div>
      </Section>

      <Section label="캐릭터" extra={<em className="opt-count">{speakers.length}명</em>}>
        {/* 캐릭터가 많아도 패널이 길어지지 않게 목록만 따로 스크롤 */}
        <div className="char-list" role="group" aria-label="캐릭터 목록" tabIndex={0}>
          <DescRow content={content} detected={detected?.[DESC_KEY]} apply={apply} />
          {whisperCount > 0 && <WhisperRow content={content} count={whisperCount} detected={detected?.[WHISPER_KEY]} apply={apply} />}
          {speakers.map((s) => (
            <CharacterRow key={s.speaker} {...s} content={content} detected={detected?.[s.speaker]} apply={apply} />
          ))}
        </div>
        <p className="field-help">저널을 누르면 이미지를 바꿀 수 있어요. 색 동그라미를 누르면 색을 고르거나 기본 색으로 되돌려요.</p>
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
    </aside>
  )
}
