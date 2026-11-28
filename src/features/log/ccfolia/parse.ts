import { HEX, isWebUrl } from '../roll20/model'
import { classifyMessage } from './classify'
import {
  CCFOLIA_LOG_FORMAT,
  CCFOLIA_LOG_VERSION,
  defaultCcfOptions,
  SYSTEM_SPEAKER,
  type CcfMessage,
  type CcfoliaLogContent,
} from './model'

/**
 * 코코포리아 로그 내보내기 HTML(.html) → 편집용 로그.
 * 모양: `<p style="color:#…;"><span> [탭]</span><span>이름</span> : <span>글<br>글</span></p>` 가 메시지 하나.
 * 글은 다른 사람이 쓴 내용이므로 HTML 로 다루지 않고 글자(textContent)만 읽는다 — 줄바꿈(<br>)만 \n 으로 남긴다.
 * (붙여넣기는 받지 않는다: 코코포리아는 채팅을 복사해 붙여 넣을 수 없다)
 */

export interface CcfParseStats {
  messages: number
  speakers: number
  tabs: number
  rolls: number
  system: number
}

export interface CcfParseResult {
  content: CcfoliaLogContent
  stats: CcfParseStats
  /** 로그 이름 후보 (파일 이름에서 확장자를 뺀 것) */
  title?: string
  /**
   * JSON 로그의 프로필 이미지: 캐릭터마다 가장 많이 쓴 것 하나 (data URL 또는 https 주소).
   * 줄이기 전 원본이라 저장하기 전에 불러오기 창에서 저널 크기로 줄인다 (HTML 로그에는 없다)
   */
  avatars?: Record<string, string>
}

export class CcfoliaParseError extends Error {}

/** <span> 안의 글: <br> 은 줄바꿈으로, 나머지는 글자만. 앞뒤 공백(파일의 들여쓰기)은 뺀다 */
function spanText(span: Element): string {
  const clone = span.cloneNode(true) as Element
  for (const br of clone.querySelectorAll('br')) br.replaceWith('\n')
  return (clone.textContent ?? '').replace(/\r\n?/g, '\n').trim()
}

function readColor(p: Element): string | undefined {
  const match = /color\s*:\s*(#[0-9a-f]{3,6})\s*;?/i.exec(p.getAttribute('style') ?? '')
  return match ? normalizeColor(match[1]) : undefined
}

function normalizeColor(value: string): string | undefined {
  let hex = value.trim().toLowerCase()
  if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  return HEX.test(hex) ? hex : undefined
}

function titleFromFile(fileName?: string): string | undefined {
  if (!fileName) return undefined
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  return base || undefined
}

export function parseCcfoliaLog(input: string, fileName?: string): CcfParseResult {
  const doc = new DOMParser().parseFromString(input, 'text/html')
  const messages: CcfMessage[] = []
  let index = 0
  for (const p of doc.body.querySelectorAll('p')) {
    const spans = [...p.children].filter((el) => el.tagName === 'SPAN')
    if (spans.length < 3) continue
    const tabMatch = /^\s*\[(.*)\]\s*$/s.exec(spans[0].textContent ?? '')
    if (!tabMatch) continue
    const message: CcfMessage = {
      id: `c${index++}`,
      tab: tabMatch[1].trim(),
      speaker: (spans[1].textContent ?? '').trim(),
      text: spanText(spans[2]),
    }
    const color = readColor(p)
    if (color) message.color = color
    messages.push(message)
  }
  if (messages.length === 0) throw new CcfoliaParseError(NOT_CCFOLIA)
  return buildResult(messages, fileName)
}

const NOT_CCFOLIA = '코코포리아 로그 형식이 아니에요. 코코포리아의 "로그 출력"으로 저장한 HTML 파일이나 JSON 파일을 골라 주세요.'

function buildResult(messages: CcfMessage[], fileName?: string): CcfParseResult {
  const speakers = new Set<string>()
  const tabs = new Set<string>()
  let rolls = 0
  let system = 0
  for (const m of messages) {
    tabs.add(m.tab)
    if (m.speaker && m.speaker !== SYSTEM_SPEAKER) speakers.add(m.speaker)
    const kind = classifyMessage(m).kind
    if (kind === 'dice' || kind === 'table') rolls++
    if (kind === 'system') system++
  }
  const title = titleFromFile(fileName)
  const content: CcfoliaLogContent = {
    format: CCFOLIA_LOG_FORMAT,
    v: CCFOLIA_LOG_VERSION,
    messages,
    characters: {},
    tabs: {},
    narrators: [],
    options: { ...defaultCcfOptions },
    source: { ...(fileName ? { name: fileName } : {}), importedAt: new Date().toISOString() },
  }
  return { content, stats: { messages: messages.length, speakers: speakers.size, tabs: tabs.size, rolls, system }, ...(title ? { title } : {}) }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,/i

/**
 * 코코포리아 로그 JSON(.json) → 편집용 로그. 모양: `{ messages: [{ name, color, text, type, channel, channelName, extend: { roll }, iconImage }], images: { 해시: data URL } }`
 * - 주사위 메시지는 글에 명령만 있고 결과는 extend.roll.result 에 따로 있다 → "명령 결과"로 이어 붙이면 HTML 로그의 글과 같다
 * - 프로필 이미지(iconImage)는 images 의 키(또는 주소). 캐릭터마다 가장 많이 쓴 것 하나만 저널 후보로 넘긴다
 */
export function parseCcfoliaJson(input: string, fileName?: string): CcfParseResult {
  let data: unknown
  try {
    data = JSON.parse(input)
  } catch {
    throw new CcfoliaParseError(NOT_CCFOLIA)
  }
  if (!isObject(data) || !Array.isArray(data.messages)) throw new CcfoliaParseError(NOT_CCFOLIA)
  const images = isObject(data.images) ? data.images : {}
  const messages: CcfMessage[] = []
  const iconCounts = new Map<string, Map<string, number>>()
  for (const raw of data.messages) {
    if (!isObject(raw) || typeof raw.text !== 'string') continue
    const speaker = typeof raw.name === 'string' ? raw.name.trim() : ''
    const tab = typeof raw.channelName === 'string' ? raw.channelName : typeof raw.channel === 'string' ? raw.channel : ''
    let text = raw.text.replace(/\r\n?/g, '\n').trim()
    const roll = isObject(raw.extend) && isObject(raw.extend.roll) ? raw.extend.roll : null
    const result = roll && typeof roll.result === 'string' ? roll.result.trim() : ''
    if (result && !text.includes(result)) text = text ? `${text} ${result}` : result
    const message: CcfMessage = { id: `c${messages.length}`, tab: tab.trim(), speaker, text }
    const color = typeof raw.color === 'string' ? normalizeColor(raw.color) : undefined
    if (color) message.color = color
    messages.push(message)

    const icon = typeof raw.iconImage === 'string' ? raw.iconImage.trim() : ''
    const src = icon && typeof images[icon] === 'string' ? (images[icon] as string) : icon
    if (speaker && speaker !== SYSTEM_SPEAKER && (DATA_IMAGE.test(src) || isWebUrl(src))) {
      const counts = iconCounts.get(speaker) ?? new Map<string, number>()
      counts.set(src, (counts.get(src) ?? 0) + 1)
      iconCounts.set(speaker, counts)
    }
  }
  if (messages.length === 0) throw new CcfoliaParseError(NOT_CCFOLIA)
  const avatars: Record<string, string> = {}
  for (const [speaker, counts] of iconCounts) avatars[speaker] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const result = buildResult(messages, fileName)
  return Object.keys(avatars).length ? { ...result, avatars } : result
}

/** 파일 이름 · 내용으로 HTML / JSON 을 골라 읽는다 */
export function parseCcfoliaFile(input: string, fileName?: string): CcfParseResult {
  const json = /\.json$/i.test(fileName ?? '') || /^\s*[{[]/.test(input)
  return json ? parseCcfoliaJson(input, fileName) : parseCcfoliaLog(input, fileName)
}
