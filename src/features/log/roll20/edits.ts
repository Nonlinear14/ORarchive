import type { Json } from '../../../lib/database.types'
import type { DocumentContent } from '../../../lib/documents'
import type { CharacterSetting, LogMessage, LogOptions } from './model'
import { sanitizeMessageHtml } from './parse'
import { countInHtml, isStyledEditable, replaceInHtml } from './styledText'

/**
 * 로그 편집 연산. 저장된 content(DocumentContent)에 적용해, 고친 경로만 바뀐 새 content 를 돌려준다.
 * (보기로 정규화한 값을 다시 저장하지 않는다 — 고치지 않은 저장 값은 그대로 남는다)
 */
export type LogEdit = (stored: DocumentContent) => DocumentContent

type JsonObject = { [key: string]: Json | undefined }
type JsonMessage = JsonObject & { id?: Json }

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)

function messagesOf(stored: DocumentContent): JsonMessage[] {
  return Array.isArray(stored.messages) ? (stored.messages as JsonMessage[]) : []
}

function withMessages(stored: DocumentContent, messages: Json[]): DocumentContent {
  return { ...stored, messages }
}

const indexOf = (stored: DocumentContent, id: string) => messagesOf(stored).findIndex((m) => isObject(m) && m.id === id)

let seq = 0
export const newMessageId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`

/** 수정 가능한 메시지의 글자를 바꾼다 */
export const setMessageText =
  (id: string, text: string): LogEdit =>
  (stored) => {
    const i = indexOf(stored, id)
    if (i < 0) return stored
    const list = [...messagesOf(stored)]
    const current = list[i]
    if (typeof current.text !== 'string' || current.text === text) return stored
    list[i] = { ...current, text }
    return withMessages(stored, list)
  }

/** 꾸민 글자 메시지의 내용을 바꾼다 (수정 칸에서 고친 HTML 을 정리해서 저장) */
export const setMessageHtml =
  (id: string, html: string): LogEdit =>
  (stored) => {
    const i = indexOf(stored, id)
    if (i < 0) return stored
    const list = [...messagesOf(stored)]
    const current = list[i]
    if (typeof current.html !== 'string' || typeof current.text === 'string') return stored
    const clean = sanitizeMessageHtml(html)
    if (current.html === clean) return stored
    list[i] = { ...current, html: clean }
    return withMessages(stored, list)
  }

export const removeMessage =
  (id: string): LogEdit =>
  (stored) => {
    const i = indexOf(stored, id)
    if (i < 0) return stored
    return withMessages(stored, messagesOf(stored).filter((_, index) => index !== i))
  }

export const duplicateMessage =
  (id: string, copyId = newMessageId()): LogEdit =>
  (stored) => {
    const i = indexOf(stored, id)
    if (i < 0) return stored
    const list = [...messagesOf(stored)]
    list.splice(i + 1, 0, { ...list[i], id: copyId })
    return withMessages(stored, list)
  }

/** 한 칸 위(-1)·아래(+1)로 */
export const moveMessage =
  (id: string, delta: -1 | 1): LogEdit =>
  (stored) => {
    const i = indexOf(stored, id)
    const j = i + delta
    const list = [...messagesOf(stored)]
    if (i < 0 || j < 0 || j >= list.length) return stored
    ;[list[i], list[j]] = [list[j], list[i]]
    return withMessages(stored, list)
  }

/** 화면에 보이는 이웃 메시지(target) 앞/뒤로 옮긴다 (숨긴 메시지를 건너뛰고 한 칸씩 움직이도록) */
export const moveMessageBeside =
  (id: string, targetId: string, side: 'before' | 'after'): LogEdit =>
  (stored) => {
    if (id === targetId) return stored
    const list = [...messagesOf(stored)]
    const from = list.findIndex((m) => isObject(m) && m.id === id)
    if (from < 0) return stored
    const [moving] = list.splice(from, 1)
    const to = list.findIndex((m) => isObject(m) && m.id === targetId)
    if (to < 0) return stored
    list.splice(side === 'before' ? to : to + 1, 0, moving)
    return withMessages(stored, list)
  }

/** 아래에 새 메시지 (같은 화자의 빈 대사, 서술 아래면 서술) */
export const insertMessageAfter =
  (id: string, newId = newMessageId()): LogEdit =>
  (stored) => {
    const i = indexOf(stored, id)
    if (i < 0) return stored
    const list = [...messagesOf(stored)]
    const base = list[i]
    const message: JsonObject = { id: newId, kind: base.kind === 'desc' ? 'desc' : 'general', text: '' }
    if (base.kind !== 'desc' && typeof base.speaker === 'string') {
      message.speaker = base.speaker
      if (typeof base.avatar === 'string') message.avatar = base.avatar
      if (base.you === true) message.you = true
    }
    list.splice(i + 1, 0, message)
    return withMessages(stored, list)
  }

/**
 * 메시지의 화자를 바꾼다. target 이 null 이면 desc 서술로, 이름이면 그 캐릭터의 대사로.
 * 저널(아바타)·'내 메시지' 표시는 그 캐릭터의 다른 메시지에서 가져온다.
 */
export const setMessageSpeaker =
  (id: string, target: string | null): LogEdit =>
  (stored) => {
    const list = [...messagesOf(stored)]
    const i = list.findIndex((m) => isObject(m) && m.id === id)
    if (i < 0) return stored
    const { speaker: _s, avatar: _a, you: _y, whisper: _w, ...rest } = list[i]
    void _s
    void _a
    void _y
    void _w
    if (target === null) {
      list[i] = { ...rest, kind: 'desc' }
    } else {
      const sample = list.find((m) => isObject(m) && m.speaker === target && m.id !== id)
      const next: JsonObject = { ...rest, kind: rest.kind === 'desc' || rest.kind === 'emote' ? 'general' : rest.kind, speaker: target }
      if (sample && typeof sample.avatar === 'string') next.avatar = sample.avatar
      if (sample && sample.you === true) next.you = true
      if (next.kind === 'whisper') next.kind = 'general'
      list[i] = next
    }
    return withMessages(stored, list)
  }

/** 메시지 안의 index 번째 이미지(저널 제외) 주소를 바꾼다. 다른 HTML 은 그대로 둔다 */
export const setMessageImage =
  (id: string, index: number, src: string): LogEdit =>
  (stored) => {
    const list = [...messagesOf(stored)]
    const i = list.findIndex((m) => isObject(m) && m.id === id)
    if (i < 0 || typeof list[i].html !== 'string') return stored
    const doc = new DOMParser().parseFromString(`<body>${list[i].html as string}</body>`, 'text/html')
    const img = doc.body.querySelectorAll('img')[index]
    if (!img || img.getAttribute('src') === src) return stored
    img.setAttribute('src', src)
    list[i] = { ...list[i], html: doc.body.innerHTML }
    return withMessages(stored, list)
  }

/** 캐릭터 설정 한 항목을 바꾼다 (빈 값이면 지운다) */
export const setCharacter =
  <K extends keyof CharacterSetting>(speaker: string, key: K, value: CharacterSetting[K] | undefined): LogEdit =>
  (stored) => {
    const characters = isObject(stored.characters) ? stored.characters : {}
    const current = isObject(characters[speaker]) ? (characters[speaker] as JsonObject) : {}
    if (current[key] === value) return stored
    const next: JsonObject = { ...current }
    // 빈 값은 지운다 (italic 은 false 자체가 설정 — 기울임 끄기)
    if (value === undefined || value === '' || (value === false && key !== 'italic')) delete next[key]
    else next[key] = value as Json
    return { ...stored, characters: { ...characters, [speaker]: next } }
  }

/** 이 캐릭터의 메시지를 모두 지운다 */
export const removeSpeakerMessages =
  (speaker: string): LogEdit =>
  (stored) =>
    withMessages(
      stored,
      messagesOf(stored).filter((m) => !(isObject(m) && m.speaker === speaker)),
    )

export const setOption =
  <K extends keyof LogOptions>(key: K, value: LogOptions[K]): LogEdit =>
  (stored) => {
    const options = isObject(stored.options) ? stored.options : {}
    if (options[key] === value) return stored
    return { ...stored, options: { ...options, [key]: value } }
  }

export const setRule =
  (rule: string): LogEdit =>
  (stored) =>
    stored.rule === rule ? stored : { ...stored, rule }

/** 찾아 바꾸기: 수정 가능한 메시지의 글자만 바꾼다 (꾸민 글자는 꾸밈을 두고 글자만, 판정·주사위는 건드리지 않는다) */
export function countMatches(messages: LogMessage[], find: string): number {
  if (!find) return 0
  let count = 0
  for (const m of messages) {
    if (m.text !== undefined) count += m.text.split(find).length - 1
    else if (m.html !== undefined && isStyledEditable(m)) count += countInHtml(m.html, find)
  }
  return count
}

export const replaceAll =
  (find: string, replacement: string): LogEdit =>
  (stored) => {
    if (!find) return stored
    let changed = false
    const list = messagesOf(stored).map((m) => {
      if (!isObject(m)) return m
      if (typeof m.text === 'string') {
        if (!m.text.includes(find)) return m
        changed = true
        return { ...m, text: m.text.split(find).join(replacement) }
      }
      if (typeof m.html !== 'string') return m
      if (!isStyledEditable({ id: String(m.id), kind: m.kind as LogMessage['kind'], html: m.html })) return m
      const html = replaceInHtml(m.html, find, replacement)
      if (html === null) return m
      changed = true
      return { ...m, html: sanitizeMessageHtml(html) }
    })
    return changed ? withMessages(stored, list) : stored
  }
