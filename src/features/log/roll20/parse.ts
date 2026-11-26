import DOMPurify from 'dompurify'
import {
  defaultLogOptions,
  isWebUrl,
  ROLL20_LOG_FORMAT,
  ROLL20_LOG_VERSION,
  type LogMessage,
  type MessageKind,
  type Roll20LogContent,
} from './model'

/**
 * Roll20 채팅 아카이브 HTML → 편집용 로그.
 * 받는 입력: 저장한 페이지 전체(.html), 채팅 아카이브를 전체 선택해 복사한 HTML, `#textchat` 부분만 복사한 HTML.
 *
 * 메시지 HTML 은 다른 사람이 쓴 내용이므로 반드시 정리(DOMPurify)한다. 스크립트·이벤트 속성·폼 요소·javascript: 주소는 지운다.
 */

export interface ParseStats {
  messages: number
  speakers: number
  whispers: number
  hidden: number
  rolls: number
  /** 감지한 룰 (모르면 빈 글자) */
  rule: string
  /** PC 폴더 경로라 다른 사람에게 보이지 않는 아바타를 가진 화자 수 */
  brokenAvatars: number
  /** 메시지 안의 PC 폴더 경로 이미지 수 */
  brokenImages: number
  sheetCss: boolean
}

export interface ParseResult {
  content: Roll20LogContent
  stats: ParseStats
  /** 페이지 제목 "Chat Log for ○○" 의 ○○ (없으면 undefined) */
  title?: string
}

export class Roll20ParseError extends Error {}

const ALLOWED_TAGS = [
  'a', 'b', 'br', 'caption', 'code', 'col', 'colgroup', 'del', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i',
  'img', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'tr', 'u', 'ul',
]
const ALLOWED_ATTR = ['class', 'style', 'src', 'href', 'title', 'alt', 'colspan', 'rowspan', 'width', 'height', 'align']

/** 메시지 HTML 정리 */
export function sanitizeMessageHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?):|\/\/|\.{0,2}\/|[^a-z]|[a-z0-9+.-]+(?:[^a-z0-9+.:-]|$))/i,
  }).trim()
}

/**
 * 시트 롤템플릿 CSS 정리. 미리보기는 그림자 DOM 안에서만 쓰지만, 내보낸 파일에도 들어가므로
 * 바깥 파일을 불러오는 규칙(@import)과 스크립트성 값은 지운다.
 */
export function sanitizeCss(css: string): string {
  return css
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '(')
    .replace(/javascript:/gi, '')
    .replace(/-moz-binding[^;]*;?/gi, '')
}

const SKIP_CHILD = (el: Element) =>
  el.classList.contains('spacer') ||
  el.classList.contains('avatar') ||
  el.classList.contains('tstamp') ||
  el.classList.contains('by') ||
  el.classList.contains('flyout') ||
  (el.id ?? '').startsWith('menu-')

function kindOf(el: Element): MessageKind {
  const c = el.classList
  if (c.contains('hidden-message')) return 'hidden'
  if (c.contains('rollresult')) return 'roll'
  if (c.contains('desc')) return 'desc'
  if (c.contains('emote')) return 'emote'
  if (c.contains('whisper') || c.contains('private')) return 'whisper'
  return 'general'
}

/** 글자·줄바꿈·굵게·기울임만 있는가 → 수정 가능한 글자로 바꾼다. 아니면 null */
function toEditableText(body: Element): string | null {
  let out = ''
  const walk = (node: Node): boolean => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? ''
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as Element
      if (el.hasAttribute('style') || el.hasAttribute('class')) return false
      const tag = el.tagName.toLowerCase()
      if (tag === 'br') out += '\n'
      else if (tag === 'strong' || tag === 'b') {
        out += '**'
        if (!walk(el)) return false
        out += '**'
      } else if (tag === 'em' || tag === 'i') {
        out += '*'
        if (!walk(el)) return false
        out += '*'
      } else return false
    }
    return true
  }
  return walk(body) ? out.replace(/^\s+|\s+$/g, '') : null
}

function speakerOf(byText: string): { speaker: string; whisper?: 'from' | 'to' } {
  const name = byText.trim().replace(/:$/, '').trim()
  const m = /^\((From|To)\s+(.+)\)$/i.exec(name)
  if (m) return { speaker: m[2].trim(), whisper: m[1].toLowerCase() === 'from' ? 'from' : 'to' }
  return { speaker: name }
}

/** 시트 롤템플릿 이름으로 룰을 알아낸다 (모르면 빈 글자) */
export function detectRule(html: string): string {
  const names = new Set([...html.matchAll(/sheet-rolltemplate-([\w-]+)/g)].map((m) => m[1].toLowerCase()))
  const has = (re: RegExp) => [...names].some((n) => re.test(n))
  if (has(/^coc/)) return '크툴루의 부름'
  if (has(/^(ins|ninpo)/)) return '인세인'
  if (has(/^(atkdmg|npcfullatk|npcatk|npcaction|spell|traits|5e)/)) return 'D&D 5판'
  if (has(/^pf/)) return '패스파인더'
  if (has(/^nechro/)) return '네크로니카'
  return ''
}

let idSeq = 0
const newId = () => `n${Date.now().toString(36)}${(idSeq++).toString(36)}`

export function parseRoll20Log(input: string, fileName?: string): ParseResult {
  const doc = new DOMParser().parseFromString(input, 'text/html')
  const root = doc.querySelector('#textchat .content') ?? doc.querySelector('.textchatcontainer .content') ?? doc.body
  const elements = [...root.querySelectorAll('div.message')].filter((el) => !el.parentElement?.closest('div.message'))
  if (elements.length === 0)
    throw new Roll20ParseError(
      'Roll20 채팅 메시지를 찾지 못했어요. 채팅 아카이브에서 저장한 HTML 파일이나, 아카이브 페이지를 전체 선택해 복사한 내용인지 확인해 주세요.',
    )

  const sheetCss = [...doc.querySelectorAll('style')]
    .map((s) => s.textContent ?? '')
    .filter((css) => css.includes('sheet-rolltemplate'))
    .map(sanitizeCss)
    .join('\n')

  const messages: LogMessage[] = []
  let prev: LogMessage | undefined
  let brokenImages = 0
  const seenIds = new Set<string>()

  for (const el of elements) {
    const kind = kindOf(el)
    const byEl = el.querySelector(':scope > .by')
    const avatarSrc = el.querySelector(':scope > .avatar img')?.getAttribute('src') ?? undefined
    const ts = el.querySelector(':scope > .tstamp')?.textContent?.trim() || undefined

    const message: LogMessage = { id: '', kind }
    let rawId = el.getAttribute('data-messageid') || newId()
    if (seenIds.has(rawId)) rawId = newId()
    seenIds.add(rawId)
    message.id = rawId
    if (el.classList.contains('you')) message.you = true

    if (byEl) {
      const { speaker, whisper } = speakerOf(byEl.textContent ?? '')
      if (speaker) message.speaker = speaker
      if (whisper) message.whisper = whisper
      if (avatarSrc) message.avatar = avatarSrc
      if (ts) message.ts = ts
    } else if (prev && kind !== 'desc' && kind !== 'emote' && prev.speaker) {
      // 이어지는 메시지: Roll20 이 이름·아바타를 생략했다 → 앞 메시지의 화자를 이어받는다
      message.speaker = prev.speaker
      if (prev.whisper) message.whisper = prev.whisper
      if (prev.avatar) message.avatar = prev.avatar
      if (prev.you) message.you = true
    }

    const body = el.cloneNode(true) as Element
    for (const child of [...body.children]) if (SKIP_CHILD(child)) child.remove()
    for (const menu of body.querySelectorAll('[id^="menu-"], .flyout')) menu.remove()

    const text = kind === 'hidden' || kind === 'roll' ? null : toEditableText(body)
    if (text !== null) message.text = text
    else {
      const html = sanitizeMessageHtml(body.innerHTML)
      for (const img of new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img'))
        if (!isWebUrl(img.getAttribute('src') ?? '')) brokenImages += 1
      message.html = html
    }
    messages.push(message)
    prev = message
  }

  const speakers = new Map<string, string | undefined>()
  for (const m of messages) if (m.speaker && !speakers.has(m.speaker)) speakers.set(m.speaker, m.avatar)
  const brokenAvatars = [...speakers.values()].filter((src) => src !== undefined && !isWebUrl(src)).length

  const titleText = doc.querySelector('title')?.textContent?.trim() ?? ''
  const titleMatch = /^Chat Log for\s+(.+)$/i.exec(titleText)
  const title = titleMatch?.[1].trim() || fileName?.replace(/\.html?$/i, '').replace(/^Chat Log for\s+/i, '').trim() || undefined

  const content: Roll20LogContent = {
    format: ROLL20_LOG_FORMAT,
    v: ROLL20_LOG_VERSION,
    messages,
    characters: {},
    options: { ...defaultLogOptions },
    sheetCss,
    rule: detectRule(messages.map((m) => m.html ?? '').join('') + sheetCss),
    source: { ...(fileName ? { name: fileName } : {}), importedAt: new Date().toISOString() },
  }
  return {
    content,
    title,
    stats: {
      messages: messages.length,
      speakers: speakers.size,
      whispers: messages.filter((m) => m.kind === 'whisper').length,
      hidden: messages.filter((m) => m.kind === 'hidden').length,
      rolls: messages.filter((m) => m.kind === 'roll' || (m.html ?? '').includes('sheet-rolltemplate')).length,
      brokenAvatars,
      brokenImages,
      sheetCss: sheetCss.length > 0,
      rule: content.rule,
    },
  }
}
