import { HEX } from '../roll20/model'
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
  if (!match) return undefined
  let hex = match[1].toLowerCase()
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
  if (messages.length === 0)
    throw new CcfoliaParseError('코코포리아 로그 형식이 아니에요. 코코포리아의 "로그 출력"으로 저장한 HTML 파일을 골라 주세요.')

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
