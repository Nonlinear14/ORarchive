import type { Json } from '../../../lib/database.types'
import type { DocumentContent } from '../../../lib/documents'
import { HEX, type AvatarShape, type CharacterSetting } from '../roll20/model'

/**
 * 코코포리아 채팅 로그 (documents.type = 'log' 의 content, format 'ccfolia-log').
 * 원본 파일은 서버에 저장하지 않는다 — 불러올 때 정리한 편집본만 이 형식으로 저장한다.
 *
 * 코코포리아 로그는 글만 있다(이미지 · 꾸민 글자 · 귓속말 · desc · 숨긴 메시지 없음). 메시지마다 탭 · 이름 · 글자색 · 글.
 * system 메시지 · 주사위 판정 · 표 결과는 저장할 때 따로 나누지 않는다 — 그릴 때 글을 보고 알아본다(`classify.ts`).
 */
export const CCFOLIA_LOG_FORMAT = 'ccfolia-log'
export const CCFOLIA_LOG_VERSION = 1

export interface CcfMessage {
  id: string
  /** 채팅 탭 이름 (main · other · info …). 없으면 빈 글자 */
  tab: string
  /** 말한 이름. 이름 없는 메시지는 빈 글자 */
  speaker: string
  /** 코코포리아가 붙인 원래 글자색 (#rrggbb). 없거나 잘못된 색이면 없음 */
  color?: string
  /** 글 (줄바꿈 \n) */
  text: string
}

/** 탭 설정: 배경 · 글자색(캐릭터 설정보다 우선), 끄면 그 탭의 메시지를 보이지 않는다 */
export interface TabSetting {
  bg?: string
  text?: string
  hidden?: boolean
}

export interface CcfOptions {
  /** 글이 비어 있는 메시지를 숨긴다 */
  hideEmpty: boolean
  /** 주사위 판정 · 표 결과 메시지를 숨긴다 */
  hideRolls: boolean
  /** 같은 사람이 이어 말하면 이름 · 저널을 한 번만 */
  collapseNames: boolean
  /** 메시지 사이 가는 선 */
  divider: boolean
  /** 이름 앞에 탭 이름을 보인다 (2026-11-28, 기본 꺼짐) */
  showTabs: boolean
  avatarShape: AvatarShape
}

export interface CcfoliaLogContent {
  format: typeof CCFOLIA_LOG_FORMAT
  v: typeof CCFOLIA_LOG_VERSION
  messages: CcfMessage[]
  /** 캐릭터 설정 (Roll20 로그와 같은 항목: 이름 · 배경 · 대사 색, 저널, 메시지 숨기기) */
  characters: Record<string, CharacterSetting>
  /** 탭 설정 (탭 이름 → 설정) */
  tabs: Record<string, TabSetting>
  /** 서술자: 이 캐릭터들의 메시지는 이름 없이 가운데 · 굵게 (Roll20 desc 서술처럼) */
  narrators: string[]
  options: CcfOptions
  source?: { name?: string; importedAt: string }
}

export const defaultCcfOptions: CcfOptions = {
  hideEmpty: true,
  hideRolls: false,
  collapseNames: true,
  divider: true,
  showTabs: false,
  avatarShape: 'square',
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const str = (value: unknown) => (typeof value === 'string' ? value : undefined)

export function isCcfoliaLog(content: DocumentContent | null | undefined): boolean {
  return isObject(content) && content.format === CCFOLIA_LOG_FORMAT && Array.isArray(content.messages)
}

function readMessage(raw: unknown, index: number): CcfMessage | null {
  if (!isObject(raw)) return null
  const message: CcfMessage = {
    id: str(raw.id) ?? `m-${index}`,
    tab: str(raw.tab) ?? '',
    speaker: str(raw.speaker) ?? '',
    text: str(raw.text) ?? '',
  }
  const color = str(raw.color)
  if (color && HEX.test(color)) message.color = color.toLowerCase()
  return message
}

function readCharacter(raw: unknown): CharacterSetting {
  if (!isObject(raw)) return {}
  const setting: CharacterSetting = {}
  for (const key of ['color', 'bg', 'text'] as const) {
    const value = str(raw[key])
    if (value && HEX.test(value)) setting[key] = value
  }
  const avatar = str(raw.avatar)
  if (avatar !== undefined) setting.avatar = avatar
  if (raw.hidden === true) setting.hidden = true
  return setting
}

function readTab(raw: unknown): TabSetting {
  if (!isObject(raw)) return {}
  const setting: TabSetting = {}
  for (const key of ['bg', 'text'] as const) {
    const value = str(raw[key])
    if (value && HEX.test(value)) setting[key] = value
  }
  if (raw.hidden === true) setting.hidden = true
  return setting
}

function readOptions(raw: unknown): CcfOptions {
  const o = isObject(raw) ? raw : {}
  const bool = (key: Exclude<keyof CcfOptions, 'avatarShape'>) => (typeof o[key] === 'boolean' ? (o[key] as boolean) : defaultCcfOptions[key])
  return {
    hideEmpty: bool('hideEmpty'),
    hideRolls: bool('hideRolls'),
    collapseNames: bool('collapseNames'),
    divider: bool('divider'),
    showTabs: bool('showTabs'),
    avatarShape: o.avatarShape === 'circle' || o.avatarShape === 'none' ? o.avatarShape : 'square',
  }
}

/** 저장된 값을 검사 · 정규화한 보기 (화면 · 출력용 — 저장하지 않는다) */
export function resolveCcfLog(stored: DocumentContent): CcfoliaLogContent {
  const raw = isObject(stored) ? stored : {}
  const messages = (Array.isArray(raw.messages) ? raw.messages : [])
    .map((m, i) => readMessage(m, i))
    .filter((m): m is CcfMessage => m !== null)
  const characters: Record<string, CharacterSetting> = {}
  if (isObject(raw.characters)) for (const [key, value] of Object.entries(raw.characters)) characters[key] = readCharacter(value)
  const tabs: Record<string, TabSetting> = {}
  if (isObject(raw.tabs)) for (const [key, value] of Object.entries(raw.tabs)) tabs[key] = readTab(value)
  const narrators = Array.isArray(raw.narrators) ? raw.narrators.filter((n): n is string => typeof n === 'string') : []
  const source = isObject(raw.source) ? { name: str(raw.source.name), importedAt: str(raw.source.importedAt) ?? '' } : undefined
  return {
    format: CCFOLIA_LOG_FORMAT,
    v: CCFOLIA_LOG_VERSION,
    messages,
    characters,
    tabs,
    narrators,
    options: readOptions(raw.options),
    ...(source ? { source } : {}),
  }
}

/** 보기 → 새 문서의 content JSON (undefined 값은 넣지 않는다) */
export function serializeCcfLog(content: CcfoliaLogContent): DocumentContent {
  return JSON.parse(JSON.stringify(content)) as { [key: string]: Json | undefined }
}

/** 탭 목록 (로그에 처음 나온 순서, 메시지 수) */
export function tabsOf(content: CcfoliaLogContent): { tab: string; count: number }[] {
  const map = new Map<string, number>()
  for (const m of content.messages) map.set(m.tab, (map.get(m.tab) ?? 0) + 1)
  return [...map.entries()].map(([tab, count]) => ({ tab, count }))
}

/** 화자 목록 (메시지 수 순). 이름 없는 메시지 · system 은 빼고 */
export function ccfSpeakersOf(content: CcfoliaLogContent): { speaker: string; count: number; color?: string }[] {
  const map = new Map<string, { count: number; color?: string }>()
  for (const m of content.messages) {
    if (!m.speaker || m.speaker === SYSTEM_SPEAKER) continue
    const entry = map.get(m.speaker) ?? { count: 0 }
    entry.count += 1
    if (!entry.color && m.color) entry.color = m.color
    map.set(m.speaker, entry)
  }
  return [...map.entries()].map(([speaker, v]) => ({ speaker, ...v })).sort((a, b) => b.count - a.count)
}

/** 코코포리아가 수치 변화 등을 남길 때 쓰는 이름 */
export const SYSTEM_SPEAKER = 'system'

/** 직접 입력한 화자 이름 → 실제로 쓸 화자 (Roll20 로그와 같은 규칙: 대소문자만 다르면 기존 캐릭터로) */
export function resolveCcfTypedSpeaker(content: CcfoliaLogContent, typed: string): string | null {
  const name = typed.trim()
  if (!name) return null
  const lower = name.toLowerCase()
  for (const { speaker } of ccfSpeakersOf(content)) if (speaker.toLowerCase() === lower) return speaker
  return name
}
