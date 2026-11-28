import { inlineCss } from '../roll20/export'
import { escapeHtml } from '../roll20/render'
import type { CcfoliaLogContent } from './model'
import { CCF_LOG_CSS, ccfContainerClass, renderCcfMessagesHtml } from './render'

/**
 * 내보내기 (Roll20 로그와 같은 두 가지)
 * - HTML 파일: <style> 이 들어 있는 완성된 페이지
 * - 블로그용 코드: CSS 를 각 요소의 style 속성으로 옮기고 class 는 지운 코드
 */
const PAGE_CSS = `body{margin:0;background:#e9e7e1}.orarchive-log{max-width:760px;margin:24px auto;box-shadow:0 2px 12px rgba(0,0,0,.12)}`

export function ccfBodyHtml(content: CcfoliaLogContent): string {
  return `<div class="${ccfContainerClass(content)}">\n${renderCcfMessagesHtml(content)}\n</div>`
}

export function ccfHtmlFile(content: CcfoliaLogContent, title: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title || '코코포리아 로그')}</title>
<style>
${PAGE_CSS}
${CCF_LOG_CSS}
</style>
</head>
<body>
<div class="orarchive-log">
${ccfBodyHtml(content)}
</div>
</body>
</html>
`
}

export function ccfFileName(title: string): string {
  const base = (title || 'ccfolia-log').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${base || 'ccfolia-log'}.html`
}

export function ccfBlogCode(content: CcfoliaLogContent): string {
  return `<div style="max-width:760px;margin:0 auto">${inlineCss(ccfBodyHtml(content), CCF_LOG_CSS)}</div>`
}
