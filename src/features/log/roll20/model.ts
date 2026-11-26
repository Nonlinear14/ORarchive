import type { Json } from '../../../lib/database.types'
import type { DocumentContent } from '../../../lib/documents'

/**
 * Roll20 채팅 로그 (documents.type = 'log' 의 content).
 * 원본 파일은 서버에 저장하지 않는다 — 불러올 때 정리한 편집본만 이 형식으로 저장한다.
 *
 * - 수정할 수 있는 메시지(글자·줄바꿈·굵게·기울임만 있는 대사)는 `text` 로 저장한다 (*기울임* **굵게**, 줄바꿈 \n).
 * - 수정할 수 없는 메시지(시트 판정·주사위·인라인 굴림·꾸민 메시지·이미지)는 정리(DOMPurify)한 `html` 로 저장한다.
 */
export const ROLL20_LOG_FORMAT = 'roll20-log'
export const ROLL20_LOG_VERSION = 1

export type MessageKind = 'general' | 'desc' | 'emote' | 'whisper' | 'roll' | 'hidden'

export interface LogMessage {
  id: string
  kind: MessageKind
  /** 로그를 저장한 사람 본인의 메시지 (Roll20 의 파란 배경) */
  you?: boolean
  /** 화자. 서술(desc)·이름 없는 메시지는 비어 있다 */
  speaker?: string
  /** 귓속말 방향: "(From 이름)" / "(To 이름)" */
  whisper?: 'from' | 'to'
  /** 아바타 이미지 주소 (원본 그대로) */
  avatar?: string
  /** Roll20 시간 표시 원문 */
  ts?: string
  /** 수정 가능한 메시지의 글자 */
  text?: string
  /** 수정 불가 메시지의 정리된 HTML */
  html?: string
}

export interface CharacterSetting {
  /** 표시 이름 (화자 이름을 바꿈) */
  name?: string
  /** 이름 색 (#rrggbb) */
  color?: string
  /** 아바타 주소 (원본 대신) */
  avatar?: string
  /** 이 캐릭터의 메시지를 숨김 */
  hidden?: boolean
}

export type AvatarShape = 'square' | 'circle' | 'none'

export interface LogOptions {
  /** "This message has been hidden." 메시지를 빼고 보여 준다 */
  removeHidden: boolean
  hideWhispers: boolean
  /** /r 굴림과 시트 판정 메시지를 숨김 */
  hideRolls: boolean
  /** 같은 사람이 이어 말하면 이름·아바타를 한 번만 */
  collapseNames: boolean
  showTime: boolean
  avatarShape: AvatarShape
  /** 내 메시지 배경: Roll20 기본(파랑) / 다른 사람과 같게 */
  myBg: 'roll20' | 'same'
  divider: boolean
}

export interface Roll20LogContent {
  format: typeof ROLL20_LOG_FORMAT
  v: typeof ROLL20_LOG_VERSION
  messages: LogMessage[]
  characters: Record<string, CharacterSetting>
  options: LogOptions
  /** 캠페인 시트의 롤템플릿 CSS (저장 파일에 들어 있을 때만) */
  sheetCss: string
  source?: { name?: string; importedAt: string }
}

export const defaultLogOptions: LogOptions = {
  removeHidden: true,
  hideWhispers: false,
  hideRolls: false,
  collapseNames: true,
  showTime: false,
  avatarShape: 'square',
  myBg: 'roll20',
  divider: true,
}

const KINDS = new Set<MessageKind>(['general', 'desc', 'emote', 'whisper', 'roll', 'hidden'])

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function isRoll20Log(content: DocumentContent | null | undefined): boolean {
  return isObject(content) && content.format === ROLL20_LOG_FORMAT && Array.isArray(content.messages)
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined)

function readMessage(raw: unknown, index: number): LogMessage | null {
  if (!isObject(raw)) return null
  const kind = KINDS.has(raw.kind as MessageKind) ? (raw.kind as MessageKind) : 'general'
  const message: LogMessage = { id: str(raw.id) ?? `m-${index}`, kind }
  if (raw.you === true) message.you = true
  const speaker = str(raw.speaker)
  if (speaker) message.speaker = speaker
  if (raw.whisper === 'from' || raw.whisper === 'to') message.whisper = raw.whisper
  const avatar = str(raw.avatar)
  if (avatar) message.avatar = avatar
  const ts = str(raw.ts)
  if (ts) message.ts = ts
  const text = str(raw.text)
  const html = str(raw.html)
  if (text !== undefined) message.text = text
  else message.html = html ?? ''
  return message
}

function readCharacter(raw: unknown): CharacterSetting {
  if (!isObject(raw)) return {}
  const setting: CharacterSetting = {}
  const name = str(raw.name)
  if (name !== undefined) setting.name = name
  const color = str(raw.color)
  if (color && /^#[0-9a-f]{6}$/i.test(color)) setting.color = color
  const avatar = str(raw.avatar)
  if (avatar !== undefined) setting.avatar = avatar
  if (raw.hidden === true) setting.hidden = true
  return setting
}

function readOptions(raw: unknown): LogOptions {
  const o = isObject(raw) ? raw : {}
  const bool = (key: keyof LogOptions) => (typeof o[key] === 'boolean' ? (o[key] as boolean) : (defaultLogOptions[key] as boolean))
  return {
    removeHidden: bool('removeHidden'),
    hideWhispers: bool('hideWhispers'),
    hideRolls: bool('hideRolls'),
    collapseNames: bool('collapseNames'),
    showTime: bool('showTime'),
    divider: bool('divider'),
    avatarShape: o.avatarShape === 'circle' || o.avatarShape === 'none' ? o.avatarShape : 'square',
    myBg: o.myBg === 'same' ? 'same' : 'roll20',
  }
}

/** 저장된 값을 검사·정규화한 보기 (화면·출력용 — 저장하지 않는다) */
export function resolveLog(stored: DocumentContent): Roll20LogContent {
  const raw = isObject(stored) ? stored : {}
  const messages = (Array.isArray(raw.messages) ? raw.messages : [])
    .map((m, i) => readMessage(m, i))
    .filter((m): m is LogMessage => m !== null)
  const characters: Record<string, CharacterSetting> = {}
  if (isObject(raw.characters))
    for (const [key, value] of Object.entries(raw.characters)) characters[key] = readCharacter(value)
  const source = isObject(raw.source)
    ? { name: str(raw.source.name), importedAt: str(raw.source.importedAt) ?? '' }
    : undefined
  return {
    format: ROLL20_LOG_FORMAT,
    v: ROLL20_LOG_VERSION,
    messages,
    characters,
    options: readOptions(raw.options),
    sheetCss: str(raw.sheetCss) ?? '',
    ...(source ? { source } : {}),
  }
}

/** 보기 → 새 문서의 content JSON (undefined 값은 넣지 않는다) */
export function serializeLog(content: Roll20LogContent): DocumentContent {
  return JSON.parse(JSON.stringify(content)) as { [key: string]: Json | undefined }
}

/** 수정 가능한 메시지인가 (text 로 저장된 메시지) */
export const isEditable = (message: LogMessage) => message.text !== undefined

/** 아바타·이미지 주소가 다른 사람도 볼 수 있는 웹 주소인가 (PC 폴더 경로가 아닌가) */
export function isWebUrl(url: string | undefined): boolean {
  return !!url && /^(https?:)?\/\//i.test(url.trim())
}

/** 화자 목록 (메시지 수 순) */
export function speakersOf(content: Roll20LogContent): { speaker: string; count: number; avatar?: string }[] {
  const map = new Map<string, { count: number; avatar?: string }>()
  for (const m of content.messages) {
    if (!m.speaker) continue
    const entry = map.get(m.speaker) ?? { count: 0 }
    entry.count += 1
    if (!entry.avatar && m.avatar) entry.avatar = m.avatar
    map.set(m.speaker, entry)
  }
  return [...map.entries()].map(([speaker, v]) => ({ speaker, ...v })).sort((a, b) => b.count - a.count)
}
