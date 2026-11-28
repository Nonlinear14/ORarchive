import { escapeHtml } from '../roll20/render'
import { isUsableAvatar } from '../roll20/model'
import { classifyMessage, type Classified } from './classify'
import { SYSTEM_SPEAKER, type CcfMessage, type CcfoliaLogContent } from './model'

/**
 * 코코포리아 로그 → HTML. 미리보기(그림자 DOM)와 내보내기가 같은 결과를 쓴다.
 * 글은 모두 이스케이프하고 줄바꿈만 <br> 로 바꾼다 (코코포리아 글에는 꾸밈이 없다 — * 같은 글자도 그대로 보인다).
 *
 * 색 우선순위: 탭 설정 > 캐릭터 설정 > 코코포리아 원래 색
 * 탭 이름은 '탭 이름 표시'를 켰을 때만 (이름이 보이는 줄의 이름 앞)
 * 디자인(2026-11-28 결정): system = 수치 카드(S-3), 주사위 = 판정 카드(D-3), 표 = 표 카드(T-2)
 */

export const plainHtml = (text: string) => escapeHtml(text).replace(/\r?\n/g, '<br>')

/** 결과 단계 색 (로그 본문 — 테마와 상관없이 같은 색) */
const TIER_COLOR = { crit: '#1565c0', success: '#2e7d32', fail: '#c62828', fumble: '#8e0000' } as const

export const CCF_LOG_CSS = `
.ccf-log{background:#fff;color:#1a1a1a;font-family:Pretendard,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif;font-size:14px;line-height:1.7;padding:12px 16px;word-break:keep-all;overflow-wrap:anywhere}
.ccf-msg{display:flex;gap:10px;align-items:flex-start;padding:4px 6px;margin:0}
.ccf-msg.ccf-divider{border-top:1px solid #ececec}
.ccf-msg.ccf-divider.ccf-first{border-top:0}
.ccf-av{flex:none;width:36px;height:36px;margin-top:2px}
.ccf-av:empty{height:0;margin-top:0}
.ccf-av img{width:36px;height:36px;object-fit:cover;display:block;border-radius:4px}
.ccf-round .ccf-av img{border-radius:50%}
.ccf-body{flex:1;min-width:0}
.ccf-name{font-weight:700;margin-right:6px}
.ccf-name-line{font-weight:700;display:block}
.ccf-narr .ccf-body{text-align:center;font-weight:700}
.ccf-tab{display:inline-block;margin-right:6px;padding:0 5px;border:1px solid rgba(0,0,0,.18);border-radius:3px;font-size:10.5px;font-weight:600;line-height:1.5;color:#8a8a8a;vertical-align:1px}
.ccf-tab-line{display:block;margin-bottom:2px}
.ccf-tab-line .ccf-tab{margin-right:0}
.ccf-sys{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid rgba(0,0,0,.14);border-left:3px solid #9a9a9a;border-radius:4px;padding:4px 10px;font-size:12.5px;margin:2px 0}
.ccf-sys-who{color:#6b6b6b}
.ccf-sys-who b{color:#1a1a1a}
.ccf-sys-val{font-weight:700;font-variant-numeric:tabular-nums;color:#1a1a1a;white-space:nowrap}
.ccf-sys-d{font-size:11px;padding:0 6px;border-radius:999px;margin-left:6px}
.ccf-sys-d.down{background:#fde8e8;color:#c62828}
.ccf-sys-d.up{background:#e5f2ea;color:#2e7d32}
.ccf-sys-plain{color:#6b6b6b;font-size:12.5px}
.ccf-dice{display:flex;border:1px solid rgba(0,0,0,.14);border-radius:4px;overflow:hidden;margin:2px 0 4px;background:rgba(255,255,255,.6)}
.ccf-dice-l{flex:1;min-width:0;padding:6px 12px}
.ccf-dice-t{font-weight:700;color:#1a1a1a}
.ccf-dice-s{font-size:12px;color:#8a8a8a}
.ccf-dice-r{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 14px;min-width:92px;border-left:1px solid rgba(0,0,0,.14);text-align:center}
.ccf-dice-v{font-size:20px;font-weight:800;line-height:1.15;font-variant-numeric:tabular-nums;color:#1a1a1a}
.ccf-dice-w{font-size:11.5px;font-weight:700}
.ccf-table{border:1px solid rgba(0,0,0,.14);border-radius:4px;overflow:hidden;margin:2px 0 4px;background:rgba(255,255,255,.6)}
.ccf-table-h{display:flex;align-items:center;gap:8px;padding:4px 12px;background:rgba(0,0,0,.05);border-bottom:1px solid rgba(0,0,0,.14);font-weight:700;font-size:13px;color:#1a1a1a}
.ccf-table-no{display:inline-block;min-width:22px;height:22px;line-height:22px;padding:0 6px;border-radius:11px;background:#1a1a1a;color:#fff;font-size:12px;text-align:center}
.ccf-table-b{padding:6px 12px;color:#1a1a1a}
`

export interface CcfRow {
  message: CcfMessage
  kind: Classified
  /** 이름 · 저널을 보여 줄지 (연속 이름 정리) */
  showHeader: boolean
  narrator: boolean
  /** 탭 이름을 보일 줄 (이름이 보이는 줄. 같은 서술자가 같은 탭에서 이어 말하면 첫 줄만) */
  showTab: boolean
}

/** 화면에 보일 메시지 (탭 끄기 · 캐릭터 숨기기 · 빈 메시지 · 주사위 숨기기 반영) */
export function visibleCcfMessages(content: CcfoliaLogContent): CcfRow[] {
  const narrators = new Set(content.narrators)
  const rows: CcfRow[] = []
  let prev: CcfRow | null = null
  for (const message of content.messages) {
    if (content.tabs[message.tab]?.hidden) continue
    if (message.speaker && content.characters[message.speaker]?.hidden) continue
    if (content.options.hideEmpty && !message.text.trim()) continue
    const kind = classifyMessage(message)
    if (content.options.hideRolls && (kind.kind === 'dice' || kind.kind === 'table')) continue
    const narrator = narrators.has(message.speaker)
    const sameSpeaker =
      !!prev && !prev.narrator && !narrator && prev.message.speaker === message.speaker && prev.message.tab === message.tab && kind.kind !== 'system'
    const showHeader = !(content.options.collapseNames && sameSpeaker)
    const narratorRun = !!prev && prev.narrator && narrator && prev.message.speaker === message.speaker && prev.message.tab === message.tab
    const row: CcfRow = { message, kind, narrator, showHeader, showTab: showHeader && !narratorRun }
    rows.push(row)
    prev = row
  }
  return rows
}

/** 이 메시지의 색 (탭 > 캐릭터 > 원래 색) */
export function ccfColors(content: CcfoliaLogContent, m: CcfMessage): { name?: string; text?: string; bg?: string } {
  const tab = content.tabs[m.tab] ?? {}
  const own = (m.speaker && content.characters[m.speaker]) || {}
  return {
    name: tab.text ?? own.color ?? m.color,
    text: tab.text ?? own.text ?? m.color,
    bg: tab.bg ?? own.bg,
  }
}

const hexStyle = (prop: string, value: string | undefined) => (value && /^#[0-9a-f]{6}$/i.test(value) ? `${prop}:${value};` : '')

function deltaBadge(from?: string, to?: string): string {
  const a = Number(from)
  const b = Number(to)
  if (from === undefined || to === undefined || !Number.isFinite(a) || !Number.isFinite(b) || a === b) return ''
  const d = b - a
  return `<span class="ccf-sys-d ${d < 0 ? 'down' : 'up'}">${d < 0 ? '−' : '+'}${Math.abs(d)}</span>`
}

/** 메시지 본문 (이름 줄 포함). 그림자 DOM 미리보기와 내보내기가 같이 쓴다 */
export function ccfBodyHtml(content: CcfoliaLogContent, row: CcfRow): string {
  const { message: m, kind } = row
  const colors = ccfColors(content, m)
  const name = escapeHtml(m.speaker)
  const hasName = row.showHeader && !!m.speaker && !row.narrator && kind.kind !== 'system'
  const tag = content.options.showTabs && row.showTab && m.tab ? `<span class="ccf-tab">${escapeHtml(m.tab)}</span>` : ''
  // 이름이 없는 줄(서술 · system · 이름 없음)은 탭 이름만 한 줄로
  const tagLine = tag && !hasName ? `<span class="ccf-tab-line">${tag}</span>` : ''
  const nameSpan = hasName ? `${tag}<span class="ccf-name" style="${hexStyle('color', colors.name)}">${name}</span>` : tagLine
  const nameLine = hasName ? `<span class="ccf-name-line">${tag}<span style="${hexStyle('color', colors.name)}">${name}</span></span>` : tagLine
  if (kind.kind === 'system') {
    if (kind.who !== undefined)
      return `${tagLine}<div class="ccf-sys"><span class="ccf-sys-who"><b>${escapeHtml(kind.who)}</b> · ${escapeHtml(kind.label ?? '')}</span><span class="ccf-sys-val">${escapeHtml(kind.from ?? '')} → ${escapeHtml(kind.to ?? '')}${deltaBadge(kind.from, kind.to)}</span></div>`
    return `${tagLine}<div class="ccf-sys-plain">${plainHtml(m.text)}</div>`
  }
  if (kind.kind === 'dice') {
    const tierColor = kind.tier ? `color:${TIER_COLOR[kind.tier]};` : ''
    return `${nameLine}<div class="ccf-dice"><div class="ccf-dice-l"><div class="ccf-dice-t">${escapeHtml(kind.title)}</div>${
      kind.sub ? `<div class="ccf-dice-s">${escapeHtml(kind.sub)}</div>` : ''
    }</div><div class="ccf-dice-r"><span class="ccf-dice-v" style="${tierColor}">${escapeHtml(kind.value)}</span>${
      kind.word ? `<span class="ccf-dice-w" style="${tierColor}">${escapeHtml(kind.word)}</span>` : ''
    }</div></div>`
  }
  if (kind.kind === 'table')
    return `${nameLine}<div class="ccf-table"><div class="ccf-table-h"><span class="ccf-table-no">${escapeHtml(kind.roll)}</span>${escapeHtml(kind.title)}</div><div class="ccf-table-b">${plainHtml(kind.result)}</div></div>`
  return `${nameSpan}<span class="ccf-text">${plainHtml(m.text)}</span>`
}

export function ccfRowClass(content: CcfoliaLogContent, row: CcfRow, first: boolean): string {
  const cls = ['ccf-msg']
  if (row.narrator) cls.push('ccf-narr')
  if (row.kind.kind === 'system' && row.message.speaker === SYSTEM_SPEAKER) cls.push('ccf-system')
  if (content.options.divider && row.showHeader) cls.push('ccf-divider')
  if (first) cls.push('ccf-first')
  return cls.join(' ')
}

export function ccfRowStyle(content: CcfoliaLogContent, row: CcfRow): string {
  const colors = ccfColors(content, row.message)
  return `${hexStyle('background', colors.bg)}${hexStyle('color', colors.text)}`
}

/** 저널 칸 (저널 모양이 '숨김'이면 없음. 이름을 숨긴 연속 메시지 · 서술 · system 은 빈 칸으로 줄을 맞춘다) */
export function ccfAvatarHtml(content: CcfoliaLogContent, row: CcfRow): string {
  if (content.options.avatarShape === 'none') return ''
  const anyAvatar = Object.values(content.characters).some((c) => isUsableAvatar(c.avatar))
  if (!anyAvatar) return ''
  const avatar = row.message.speaker ? content.characters[row.message.speaker]?.avatar : undefined
  const show = row.showHeader && !row.narrator && row.kind.kind !== 'system' && isUsableAvatar(avatar)
  return `<div class="ccf-av">${show ? `<img src="${escapeHtml(avatar!.trim())}" alt="">` : ''}</div>`
}

export function ccfContainerClass(content: CcfoliaLogContent): string {
  return content.options.avatarShape === 'circle' ? 'ccf-log ccf-round' : 'ccf-log'
}

/** 내보내기용 전체 메시지 HTML */
export function renderCcfMessagesHtml(content: CcfoliaLogContent): string {
  return visibleCcfMessages(content)
    .map(
      (row, i) =>
        `<div class="${ccfRowClass(content, row, i === 0)}" style="${ccfRowStyle(content, row)}">${ccfAvatarHtml(content, row)}<div class="ccf-body">${ccfBodyHtml(content, row)}</div></div>`,
    )
    .join('\n')
}
