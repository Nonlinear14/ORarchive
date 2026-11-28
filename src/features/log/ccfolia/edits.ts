import type { Json } from '../../../lib/database.types'
import type { DocumentContent } from '../../../lib/documents'
import { newMessageId, type LogEdit } from '../roll20/edits'
import { classifyMessage } from './classify'
import type { CcfMessage, CcfOptions, TabSetting } from './model'

/**
 * 코코포리아 로그 편집 연산 (Roll20 로그와 같은 원칙: 저장된 content 에 적용해 고친 경로만 바꾼다).
 * 메시지 지우기 · 복제 · 옮기기 · 글 고치기 · 캐릭터 설정 · 캐릭터 메시지 모두 지우기는 Roll20 로그의 연산을 그대로 쓴다
 * (`roll20/edits.ts` — 메시지 목록과 id 만 다룬다).
 */
export type { LogEdit }

type JsonObject = { [key: string]: Json | undefined }
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const messagesOf = (stored: DocumentContent): JsonObject[] => (Array.isArray(stored.messages) ? (stored.messages as JsonObject[]) : [])

/** 아래에 새 메시지 (같은 탭 · 같은 화자 · 같은 원래 색의 빈 대사) */
export const insertCcfMessageAfter =
  (id: string, newId = newMessageId()): LogEdit =>
  (stored) => {
    const list = [...messagesOf(stored)]
    const i = list.findIndex((m) => isObject(m) && m.id === id)
    if (i < 0) return stored
    const base = list[i]
    const message: JsonObject = { id: newId, tab: typeof base.tab === 'string' ? base.tab : '', speaker: typeof base.speaker === 'string' ? base.speaker : '', text: '' }
    if (typeof base.color === 'string') message.color = base.color
    list.splice(i + 1, 0, message)
    return { ...stored, messages: list }
  }

/** 메시지의 화자를 바꾼다. 원래 색은 그 캐릭터의 다른 메시지에서 가져온다 (없으면 색을 뺀다) */
export const setCcfMessageSpeaker =
  (id: string, speaker: string): LogEdit =>
  (stored) => {
    const list = [...messagesOf(stored)]
    const i = list.findIndex((m) => isObject(m) && m.id === id)
    if (i < 0 || list[i].speaker === speaker) return stored
    const sample = list.find((m) => isObject(m) && m.speaker === speaker && m.id !== id)
    const { color: _c, ...rest } = list[i]
    void _c
    const next: JsonObject = { ...rest, speaker }
    if (sample && typeof sample.color === 'string') next.color = sample.color
    list[i] = next
    return { ...stored, messages: list }
  }

/** 탭 설정 한 항목 (빈 값 · false 면 지운다) */
export const setTab =
  <K extends keyof TabSetting>(tab: string, key: K, value: TabSetting[K] | undefined): LogEdit =>
  (stored) => {
    const tabs = isObject(stored.tabs) ? stored.tabs : {}
    const current = isObject(tabs[tab]) ? (tabs[tab] as JsonObject) : {}
    if (current[key] === value) return stored
    const next: JsonObject = { ...current }
    if (value === undefined || value === '' || value === false) delete next[key]
    else next[key] = value as Json
    return { ...stored, tabs: { ...tabs, [tab]: next } }
  }

/** 서술자로 고르기 / 풀기 */
export const setNarrator =
  (speaker: string, on: boolean): LogEdit =>
  (stored) => {
    const list = Array.isArray(stored.narrators) ? stored.narrators.filter((n): n is string => typeof n === 'string') : []
    const has = list.includes(speaker)
    if (has === on) return stored
    return { ...stored, narrators: on ? [...list, speaker] : list.filter((n) => n !== speaker) }
  }

export const setCcfOption =
  <K extends keyof CcfOptions>(key: K, value: CcfOptions[K]): LogEdit =>
  (stored) => {
    const options = isObject(stored.options) ? stored.options : {}
    if (options[key] === value) return stored
    return { ...stored, options: { ...options, [key]: value } }
  }

/** 찾아 바꾸기: 고칠 수 있는 대사만 (system · 주사위 · 표 결과는 그대로) */
const isTalk = (speaker: unknown, text: string) => classifyMessage({ speaker: typeof speaker === 'string' ? speaker : '', text }).kind === 'talk'

export function countCcfMatches(messages: CcfMessage[], find: string): number {
  if (!find) return 0
  return messages.reduce((n, m) => (isTalk(m.speaker, m.text) ? n + m.text.split(find).length - 1 : n), 0)
}

export const replaceAllCcf =
  (find: string, replacement: string): LogEdit =>
  (stored) => {
    if (!find) return stored
    let changed = false
    const list = messagesOf(stored).map((m) => {
      if (!isObject(m) || typeof m.text !== 'string' || !m.text.includes(find) || !isTalk(m.speaker, m.text)) return m
      changed = true
      return { ...m, text: m.text.split(find).join(replacement) }
    })
    return changed ? { ...stored, messages: list } : stored
  }
