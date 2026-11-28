import { useLayoutEffect, useMemo, useRef } from 'react'
import { ROLL20_CHAT_CSS } from '../../log/roll20/render'
import { renderChatHtml, ROLL20_LINK_CSS } from '../parse'

/** 메시지를 고를 수 있을 때의 모양 (그림자 DOM 안) */
const PICK_CSS = `
::selection{background:#8a8a8a}
.picking .message{cursor:pointer;border-radius:4px;transition:box-shadow .12s}
.picking .message:hover{box-shadow:0 0 0 2px color-mix(in srgb, var(--point) 40%, transparent)}
.picking .message.is-picked{box-shadow:0 0 0 2px var(--point);background-color:color-mix(in srgb, var(--point) 7%, #ffffff)}
`

/**
 * Roll20 채팅창 모양 미리보기 (그림자 DOM — 롤꾸 스타일이 사이트 화면에 새지 않게).
 * onSelect 를 주면 메시지를 눌러 고를 수 있다 (여러 메시지 롤꾸) — selected 는 강조할 메시지 번호
 */
export function ChatPreview({
  code,
  answers,
  label = 'Roll20 채팅 미리보기',
  selected = null,
  onSelect,
}: {
  code: string
  answers: Record<string, string>
  label?: string
  selected?: number | null
  onSelect?(message: number): void
}) {
  const host = useRef<HTMLDivElement>(null)
  const pick = useRef(onSelect)
  useLayoutEffect(() => {
    pick.current = onSelect
  })
  const html = useMemo(() => renderChatHtml(code, answers), [code, answers])
  const picking = !!onSelect
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>${ROLL20_CHAT_CSS}${ROLL20_LINK_CSS}${PICK_CSS}:host{display:block}</style><div class="textchatcontainer withoutavatars${
      picking ? ' picking' : ''
    }"><div class="content">${
      html || '<div class="message desc"><div class="spacer"></div><span style="color:#888">코드를 넣으면 여기에 보여요</span></div>'
    }</div></div>`
  }, [html, picking])
  // 고른 메시지 강조 (다시 그리지 않고 표시만)
  useLayoutEffect(() => {
    const root = host.current?.shadowRoot
    if (!root) return
    root.querySelectorAll('.message.is-picked').forEach((m) => m.classList.remove('is-picked'))
    if (selected !== null) root.querySelector(`.message[data-msg="${selected}"]`)?.classList.add('is-picked')
  }, [selected, html, picking])
  // 메시지 누르기: 그림자 DOM 안의 .message[data-msg]
  useLayoutEffect(() => {
    const root = host.current?.shadowRoot
    if (!root || !picking) return
    const onClick = (e: Event) => {
      const msg = (e.target as Element | null)?.closest?.('.message[data-msg]')
      if (!msg) return
      e.preventDefault()
      pick.current?.(Number(msg.getAttribute('data-msg')))
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [picking])
  return (
    <div
      ref={host}
      className={`r20-chat${picking ? ' is-picking' : ''}`}
      role={picking ? 'group' : 'img'}
      aria-label={picking ? `${label} — 메시지를 누르면 그 메시지만 고쳐요` : label}
      data-testid="roll20-chat"
    />
  )
}
