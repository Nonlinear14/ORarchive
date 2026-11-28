import { describe, expect, it } from 'vitest'
import { avatarRect } from './avatarImage'
import { messageInnerHtml } from '../render'
import { resolveLog } from '../model'

describe('저널 이미지: 비율과 상관없이 높이 맞춤', () => {
  it('높이를 96px 에 맞춰 가운데: 세로로 긴 그림은 양옆이 비고, 가로로 긴 그림은 양옆이 잘린다', () => {
    expect(avatarRect(300, 300)).toEqual({ x: 0, y: 0, w: 96, h: 96 })
    expect(avatarRect(200, 400)).toEqual({ x: 24, y: 0, w: 48, h: 96 })
    expect(avatarRect(600, 200)).toEqual({ x: -96, y: 0, w: 288, h: 96 })
    expect(avatarRect(1, 1000)).toEqual({ x: 48, y: 0, w: 1, h: 96 })
  })

  it('Roll20 로그: 사용자가 넣은 저널(링크 포함)만 높이 맞춤 칸으로 그린다', () => {
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
    expect(messageInnerHtml(content, content.messages[0], true)).toContain('<div class="avatar user-avatar"><img src="https://example.com/tall.png"')
    expect(messageInnerHtml(content, content.messages[1], true)).toContain('<div class="avatar"><img src="https://files.d20.io/b.png"')
  })
})
