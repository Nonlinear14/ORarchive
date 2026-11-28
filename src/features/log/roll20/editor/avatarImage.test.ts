import { describe, expect, it } from 'vitest'
import { containRect } from './avatarImage'
import { messageInnerHtml } from '../render'
import { resolveLog } from '../model'

describe('저널 이미지: 자르지 않고 긴 쪽 맞춤', () => {
  it('정사각형은 칸을 꽉 채우고, 세로 · 가로로 긴 이미지는 긴 쪽을 96px 에 맞춰 가운데', () => {
    expect(containRect(300, 300)).toEqual({ x: 0, y: 0, w: 96, h: 96 })
    expect(containRect(200, 400)).toEqual({ x: 24, y: 0, w: 48, h: 96 })
    expect(containRect(600, 200)).toEqual({ x: 0, y: 32, w: 96, h: 32 })
    expect(containRect(1, 1000)).toEqual({ x: 48, y: 0, w: 1, h: 96 })
  })

  it('Roll20 로그: 사용자가 넣은 저널(링크 포함)만 원형에서도 자르지 않는다', () => {
    const content = resolveLog({
      format: 'roll20-log',
      v: 1,
      messages: [
        { id: 'a', kind: 'general', speaker: '엘리너', avatar: 'https://files.d20.io/a.png', text: '안녕' },
        { id: 'b', kind: 'general', speaker: '토마스', avatar: 'https://files.d20.io/b.png', text: '네' },
      ],
      characters: { 엘리너: { avatar: 'https://example.com/tall.png' } },
      options: { avatarShape: 'circle' },
    })
    expect(messageInnerHtml(content, content.messages[0], true)).toContain('<img class="user-avatar" src="https://example.com/tall.png"')
    expect(messageInnerHtml(content, content.messages[1], true)).toContain('<img src="https://files.d20.io/b.png"')
  })
})
