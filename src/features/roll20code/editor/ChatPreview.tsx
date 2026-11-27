import { useLayoutEffect, useMemo, useRef } from 'react'
import { ROLL20_CHAT_CSS } from '../../log/roll20/render'
import { renderChatHtml, ROLL20_LINK_CSS } from '../parse'

/** Roll20 채팅창 모양 미리보기 (그림자 DOM — 롤꾸 스타일이 사이트 화면에 새지 않게) */
export function ChatPreview({ code, answers, label = 'Roll20 채팅 미리보기' }: { code: string; answers: Record<string, string>; label?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const html = useMemo(() => renderChatHtml(code, answers), [code, answers])
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>${ROLL20_CHAT_CSS}${ROLL20_LINK_CSS}:host{display:block}</style><div class="textchatcontainer withoutavatars"><div class="content">${
      html || '<div class="message desc"><div class="spacer"></div><span style="color:#888">코드를 넣으면 여기에 보여요</span></div>'
    }</div></div>`
  }, [html])
  return <div ref={host} className="r20-chat" role="img" aria-label={label} data-testid="roll20-chat" />
}

