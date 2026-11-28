import { useState } from 'react'
import { ConfirmDialog } from '../../../../components/ConfirmDialog'
import { Icon } from '../../../../components/Icon'
import type { ToastTone } from '../../../../lib/useToast'
import { removeSpeakerMessages, setCharacter, type LogEdit } from '../../roll20/edits'
import { isUsableAvatar } from '../../roll20/model'
import { AvatarDialog, ColorRound, Section, Toggle } from '../../roll20/editor/LogPanel'
import { classifyMessage } from '../classify'
import { countCcfMatches, replaceAllCcf, setCcfOption, setNarrator, setTab } from '../edits'
import { ccfSpeakersOf, tabsOf, type CcfOptions, type CcfoliaLogContent } from '../model'

interface PanelProps {
  content: CcfoliaLogContent
  apply(op: LogEdit): void
  notify(message: string, tone?: ToastTone): void
}

/** 탭 이름이 없는 메시지(예전 형식 로그)는 '탭 없음'으로 보인다 */
const tabLabel = (tab: string) => tab || '탭 없음'

function CharacterRow({
  speaker,
  count,
  color,
  content,
  apply,
}: {
  speaker: string
  count: number
  color?: string
  content: CcfoliaLogContent
  apply(op: LogEdit): void
}) {
  const setting = content.characters[speaker] ?? {}
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const avatar = setting.avatar?.trim()
  const shown = avatar && isUsableAvatar(avatar) ? avatar : undefined
  const narrator = content.narrators.includes(speaker)
  return (
    <div className={setting.hidden ? 'char-row is-hidden' : 'char-row'}>
      <div className="char-main">
        <button type="button" className="char-av-btn" aria-label={`${speaker} 저널 바꾸기`} title="저널 바꾸기" onClick={() => setAvatarOpen(true)}>
          {shown ? (
            <img className="char-av" src={shown} alt="" />
          ) : (
            <span className="char-av" aria-hidden="true">
              {speaker.slice(0, 1)}
            </span>
          )}
        </button>
        <div className="char-body">
          <b className="char-name">
            {speaker} {narrator && <em className="opt-count">서술자</em>}
          </b>
          <div className="char-colors">
            {(['color', 'bg', 'text'] as const)
              // 서술자는 이름을 보이지 않으니 이름 색이 없다
              .filter((key) => !(narrator && key === 'color'))
              .map((key) => (
                <ColorRound
                  key={key}
                  speaker={speaker}
                  name={speaker}
                  colorKey={key}
                  value={setting[key]}
                  detected={key === 'bg' ? undefined : color}
                  apply={apply}
                />
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
            checked={!!setting.hidden}
            aria-label={`${speaker} 메시지 숨기기`}
            onChange={(e) => apply(setCharacter(speaker, 'hidden', e.target.checked))}
          />
          <span aria-hidden="true">메시지 숨기기</span>
        </label>
        <button type="button" className="btn small danger" aria-label={`${speaker} 메시지 모두 삭제`} title="이 캐릭터의 메시지 모두 삭제" onClick={() => setConfirming(true)}>
          <Icon name="trash" /> 모두 삭제
        </button>
      </div>
      {avatarOpen && <AvatarDialog speaker={speaker} name={speaker} setting={setting} apply={apply} onClose={() => setAvatarOpen(false)} />}
      {confirming && (
        <ConfirmDialog
          title="이 캐릭터의 메시지를 모두 지울까요?"
          message={
            <>
              <b>{speaker}</b>의 메시지 {count.toLocaleString('ko-KR')}개를 로그에서 지웁니다. 되돌리기로 다시 살릴 수 있어요.
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

function TabRow({ tab, count, content, apply }: { tab: string; count: number; content: CcfoliaLogContent; apply(op: LogEdit): void }) {
  const setting = content.tabs[tab] ?? {}
  const label = tabLabel(tab)
  const shown = !setting.hidden
  return (
    <div className={shown ? 'char-row tab-row' : 'char-row tab-row is-hidden'}>
      <div className="char-main">
        <span className="char-av desc-av" aria-hidden="true">
          #
        </span>
        <div className="char-body">
          <b className="char-name">
            {label} <em className="opt-count">{count.toLocaleString('ko-KR')}개</em>
          </b>
          <div className="char-colors">
            {(['bg', 'text'] as const).map((key) => (
              <ColorRound
                key={key}
                speaker={`tab:${tab}`}
                name={`${label} 탭`}
                colorKey={key}
                value={setting[key]}
                apply={apply}
                set={(value) => setTab(tab, key, value)}
              />
            ))}
          </div>
        </div>
        <input
          type="checkbox"
          role="switch"
          className="opt-switch tab-switch"
          checked={shown}
          aria-label={`${label} 탭 보이기`}
          onChange={(e) => apply(setTab(tab, 'hidden', !e.target.checked))}
        />
      </div>
    </div>
  )
}

export function CcfPanel({ content, apply, notify }: PanelProps) {
  const speakers = ccfSpeakersOf(content)
  const tabs = tabsOf(content)
  const { options } = content
  const [find, setFind] = useState('')
  const [replacement, setReplacement] = useState('')
  const matches = countCcfMatches(content.messages, find)
  const set = <K extends keyof CcfOptions>(key: K) => (value: CcfOptions[K]) => apply(setCcfOption(key, value))
  const emptyCount = content.messages.filter((m) => !m.text.trim()).length
  const rollCount = content.messages.filter((m) => {
    const kind = classifyMessage(m).kind
    return kind === 'dice' || kind === 'table'
  }).length
  const shapes: [CcfOptions['avatarShape'], string][] = [
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
        <Toggle label="빈 메시지 숨기기" sub="글이 없는 메시지" count={emptyCount} checked={options.hideEmpty} onChange={set('hideEmpty')} />
        <Toggle label="주사위 결과 숨기기" sub="판정 · 표 결과" count={rollCount} checked={options.hideRolls} onChange={set('hideRolls')} />
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
              onClick={() => apply(setCcfOption('avatarShape', v))}
            >
              {text}
            </button>
          ))}
        </div>
      </Section>

      <Section label="서술자" extra={<em className="opt-count">{content.narrators.length}명</em>}>
        <div className="narrator-chips" role="group" aria-label="서술자 고르기">
          {speakers.map(({ speaker }) => {
            const on = content.narrators.includes(speaker)
            return (
              <button key={speaker} type="button" className={on ? 'narrator-chip active' : 'narrator-chip'} aria-pressed={on} onClick={() => apply(setNarrator(speaker, !on))}>
                {speaker}
              </button>
            )
          })}
        </div>
        <p className="field-help">고른 캐릭터의 메시지는 이름 없이 가운데 · 굵게 보여요 (Roll20 desc 서술처럼). 여러 명 고를 수 있어요.</p>
      </Section>

      <Section label="탭" extra={<em className="opt-count">{tabs.length}개</em>}>
        <div className="char-list tab-list" role="group" aria-label="탭 목록">
          {tabs.map((t) => (
            <TabRow key={t.tab} {...t} content={content} apply={apply} />
          ))}
        </div>
        <p className="field-help">켠 탭의 메시지만 보여요. 탭 색은 캐릭터 색보다 우선해요. 탭 이름은 내보낸 로그에 나오지 않아요.</p>
      </Section>

      <Section label="캐릭터" extra={<em className="opt-count">{speakers.length}명</em>}>
        <div className="char-list" role="group" aria-label="캐릭터 목록" tabIndex={0}>
          {speakers.map((s) => (
            <CharacterRow key={s.speaker} {...s} content={content} apply={apply} />
          ))}
        </div>
        <p className="field-help">저널을 누르면 이미지를 넣을 수 있어요. 색 동그라미를 누르면 색을 고르거나 기본 색으로 되돌려요.</p>
      </Section>

      <Section label="찾아 바꾸기">
        <div className="fr-grid">
          <input className="field-input" aria-label="찾을 글자" placeholder="찾을 글자" value={find} onChange={(e) => setFind(e.target.value)} />
          <input className="field-input" aria-label="바꿀 글자" placeholder="바꿀 글자" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
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
              apply(replaceAllCcf(find, replacement))
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
