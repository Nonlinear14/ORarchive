import { DESC_KEY, type LogMessage, type Roll20LogContent } from './model'

/**
 * 로그 → Roll20 채팅 모양 HTML. 미리보기(그림자 DOM)와 내보내기가 같은 결과를 쓴다.
 * 수정 가능한 글자는 이스케이프한 뒤 *기울임* / **굵게** / 줄바꿈만 태그로 바꾼다.
 */

export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** *기울임* · **굵게** · 줄바꿈 → HTML (사용자 글자는 모두 이스케이프) */
export function textToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\r?\n/g, '<br>')
}

/** Roll20 채팅 기본 모양 (Roll20 app.css 의 채팅 부분) + 표시 설정 */
export const ROLL20_CHAT_CSS = `
.textchatcontainer{font-family:"Helvetica Neue",Helvetica,Arial,"Malgun Gothic",sans-serif;font-size:13px;color:#000;background:#fff;text-align:left}
.textchatcontainer .content{line-height:1.25em;font-size:1.05em;word-wrap:break-word}
.textchatcontainer .message{padding-left:45px;padding-right:16px;padding-bottom:7px;background-color:#f1f1f1;position:relative}
.textchatcontainer .message .spacer{background-color:#e1e1e1;height:2px;margin-bottom:7px;margin-left:-45px;margin-right:-12px}
.textchatcontainer .tstamp{font-size:.8em;color:#666;display:none;padding:0;margin:-4px 0 2px;position:relative;left:-5px;line-height:1em}
.textchatcontainer.withtimestamps .tstamp{display:block}
.textchatcontainer .by{font-weight:bold;position:relative;left:-5px}
.textchatcontainer .avatar{position:absolute;top:4px;left:5px;width:28px}
.textchatcontainer .avatar img{max-width:28px;max-height:28px;display:block}
.textchatcontainer.avatar-circle .avatar img{width:28px;height:28px;object-fit:cover;border-radius:50%}
.textchatcontainer.withoutavatars .avatar{display:none}
.textchatcontainer.withoutavatars .message{padding-left:15px}
.textchatcontainer.withoutavatars .message .spacer{margin-left:-15px}
.textchatcontainer .message.desc,.textchatcontainer .message.emote{padding-left:15px}
.textchatcontainer .message.desc .spacer,.textchatcontainer .message.emote .spacer{margin-left:-15px}
.textchatcontainer .message.you{background-color:#d3e5f5}
.textchatcontainer .message.you .spacer{background-color:#b1d9fa}
.textchatcontainer .desc{font-style:italic;font-weight:bold;text-align:center}
.textchatcontainer .emote{font-style:italic;font-weight:bold;text-align:center;color:#653e10;background-color:#f5e4d3}
.textchatcontainer .message.private{background-color:#f2f5d3}
.textchatcontainer .message.private .spacer{background-color:#f0f092}
.textchatcontainer .message.hidden-message{font-style:italic;color:#666}
.textchatcontainer .inlinerollresult{background-color:#fef68e;border:2px solid #fef68e;padding:0 3px;font-weight:bold;font-size:1.1em}
.textchatcontainer .inlinerollresult.fullcrit{border:2px solid #3fb315}
.textchatcontainer .inlinerollresult.fullfail{border:2px solid #b31515}
.textchatcontainer .inlinerollresult.importantroll{border:2px solid #4a57ed}
.textchatcontainer .formula,.textchatcontainer .rolled{display:inline;padding:4px;background:#fff;border-radius:3px;border:1px solid #d1d1d1;font-size:1.1em;line-height:2em;word-wrap:break-word}
.textchatcontainer .formattedformula{display:block;float:left;padding:0 4px;margin:5px 0}
.textchatcontainer .dicegrouping{display:inline}
.textchatcontainer .rolled{font-weight:bold;color:#000;font-size:1.4em}
.textchatcontainer .clear{clear:both}
.textchatcontainer .diceroll{display:inline-block}
.textchatcontainer .diceroll .dicon{display:inline-block;min-width:30px;text-align:center;position:relative}
.textchatcontainer .diceroll .didroll{position:relative;z-index:2;color:#000;min-height:29px;margin-top:-3px;text-align:center}
.textchatcontainer .diceroll .backing{display:none}
.textchatcontainer .diceroll.critsuccess .didroll{color:#247305;font-weight:bold}
.textchatcontainer .diceroll.critfail .didroll{color:#730505;font-weight:bold}
.textchatcontainer img{max-width:100%}
`

/** 표시 설정이 확장 프로그램 꾸밈보다 우선하도록 맨 뒤에 붙이는 규칙 */
const OPTION_CSS = `
.textchatcontainer.nodivider .message .spacer{background:transparent!important;background-color:transparent!important;border:0!important;box-shadow:none!important}
`

/** 로그 전체 CSS: Roll20 기본 → 캠페인 시트 → 확장 프로그램 꾸밈 → 표시 설정 (원래 페이지와 같은 순서) */
export function logCss(content: Roll20LogContent): string {
  return [ROLL20_CHAT_CSS, content.sheetCss, content.extCss, OPTION_CSS].filter(Boolean).join('\n')
}

export interface RenderedMessage {
  message: LogMessage
  /** 이 메시지 앞에 이름·저널을 보여 주는가 */
  showHeader: boolean
}

const isRoll = (m: LogMessage) => m.kind === 'roll' || (m.html ?? '').includes('sheet-rolltemplate')

/** 표시 설정(일괄 정리·캐릭터 숨김)을 적용한 메시지 목록 */
export function visibleMessages(content: Roll20LogContent): RenderedMessage[] {
  const { options, characters } = content
  const out: RenderedMessage[] = []
  let prev: LogMessage | undefined
  for (const m of content.messages) {
    if (options.removeHidden && m.kind === 'hidden') continue
    if (options.hideWhispers && m.kind === 'whisper') continue
    if (options.hideRolls && isRoll(m)) continue
    if (m.speaker && characters[m.speaker]?.hidden) continue
    const named = m.kind !== 'desc' && m.kind !== 'emote' && !!m.speaker
    const sameAsPrev =
      !!prev && prev.speaker === m.speaker && prev.kind !== 'desc' && prev.kind !== 'emote' && (prev.whisper ?? '') === (m.whisper ?? '')
    out.push({ message: m, showHeader: named && (!options.collapseNames || !sameAsPrev) })
    prev = m
  }
  return out
}

export function containerClass(content: Roll20LogContent): string {
  const { options } = content
  return [
    'textchatcontainer',
    options.showTime ? 'withtimestamps' : '',
    options.avatarShape === 'none' ? 'withoutavatars' : options.avatarShape === 'circle' ? 'avatar-circle' : '',
    options.divider ? '' : 'nodivider',
  ]
    .filter(Boolean)
    .join(' ')
}

export function messageClass(content: Roll20LogContent, m: LogMessage): string {
  const base: Record<LogMessage['kind'], string> = {
    general: 'general',
    desc: 'desc',
    emote: 'emote',
    whisper: 'private whisper',
    roll: 'rollresult',
    hidden: 'general hidden-message',
  }
  return ['message', base[m.kind], m.you && content.options.myBg === 'roll20' ? 'you' : ''].filter(Boolean).join(' ')
}

/** 화자 표시 이름 (캐릭터 설정의 이름 반영) */
export function displayName(content: Roll20LogContent, speaker: string): string {
  return content.characters[speaker]?.name?.trim() || speaker
}

/** 메시지 안쪽 HTML (머리 + 본문) */
export function messageInnerHtml(content: Roll20LogContent, m: LogMessage, showHeader: boolean): string {
  let head = ''
  if (showHeader && m.speaker) {
    const setting = content.characters[m.speaker] ?? {}
    const avatar = setting.avatar?.trim() || m.avatar
    const name = displayName(content, m.speaker)
    const label = m.whisper === 'from' ? `(From ${name})` : m.whisper === 'to' ? `(To ${name})` : name
    const color = setting.color ? ` style="color:${setting.color} !important"` : ''
    head =
      '<div class="spacer"></div>' +
      (avatar ? `<div class="avatar"><img src="${escapeHtml(avatar)}" alt=""></div>` : '') +
      (m.ts ? `<span class="tstamp">${escapeHtml(m.ts)}</span>` : '') +
      `<span class="by"${color}>${escapeHtml(label)}:</span> `
  } else if (m.kind === 'desc' || m.kind === 'emote') head = '<div class="spacer"></div>'
  const body = m.text !== undefined ? textToHtml(m.text) : (m.html ?? '')
  return head + body
}

/** 캐릭터별 메시지 배경색·대사 색 (style 속성 값, 없으면 빈 글자) */
export function messageStyle(content: Roll20LogContent, m: LogMessage): string {
  const key = m.kind === 'desc' || m.kind === 'emote' ? DESC_KEY : m.speaker
  const setting = key ? content.characters[key] : undefined
  if (!setting) return ''
  // !important: 사용자가 직접 고른 색이 확장 프로그램 꾸밈(!important 포함)보다 우선
  return [setting.bg ? `background-color:${setting.bg} !important` : '', setting.text ? `color:${setting.text} !important` : '']
    .filter(Boolean)
    .join(';')
}

export function renderMessagesHtml(content: Roll20LogContent): string {
  return visibleMessages(content)
    .map(({ message, showHeader }) => {
      const style = messageStyle(content, message)
      return `<div class="${messageClass(content, message)}"${style ? ` style="${style}"` : ''}>${messageInnerHtml(content, message, showHeader)}</div>`
    })
    .join('\n')
}
