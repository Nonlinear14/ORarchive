/**
 * Roll20 에 붙여 넣는 HTML 의 글자 처리 도우미와 파일 이름. (블록 출력은 blockRoll20.ts)
 * - 사용자가 입력한 글자는 모두 이스케이프한다
 * - 붙여 넣은 HTML 은 white-space:pre-wrap 이 아니므로 의미 있는 공백을 &nbsp; 로 바꾼다
 *   (탭 → 공백 4칸, 줄 앞·줄 끝 공백과 2칸 이상 연속 공백 → &nbsp;, 줄바꿈 → <br>)
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 줄바꿈 통일 · 탭 → 공백 4칸 · NBSP(contenteditable 이 남기는 것) → 공백 */
export function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\u00a0/g, ' ')
}

/**
 * 공백을 보존하는 HTML 조각 (일반 HTML 은 줄 앞·줄 끝 공백과 연속 공백을 접어 버린다).
 * - 줄 앞 공백과 줄 끝 공백(공백만 있는 줄 포함)은 모두 &nbsp;
 * - 줄 가운데 2칸 이상 연속 공백은 마지막 하나만 일반 공백으로 남겨(단어 사이에서 줄이 바뀔 수 있게) 나머지를 &nbsp;
 * - 줄 가운데 공백 한 칸은 일반 공백 그대로
 * - 줄바꿈은 <br>
 * - 줄바꿈으로 끝나는 값의 마지막 빈 줄은 &nbsp; — HTML 은 블록 끝의 <br> 뒤에 줄을 그리지 않으므로
 *   ("본문\n" → 본문 + 빈 줄, "\n\n" → 빈 줄 3개: 캔버스와 같은 줄 수)
 */
export function whitespaceHtml(value: string): string {
  const lines = normalizeText(value)
    .split('\n')
    .map((line) =>
      escapeHtml(line)
        .replace(/^ +| +$/g, (m) => '&nbsp;'.repeat(m.length))
        .replace(/ {2,}/g, (m) => `${'&nbsp;'.repeat(m.length - 1)} `),
    )
  if (lines.length > 1 && lines[lines.length - 1] === '') lines[lines.length - 1] = '&nbsp;'
  return lines.join('<br>')
}

/** 다운로드 파일 이름: 파일 이름에 못 쓰는 글자를 빼고, 비면 orarchive-handout */
export function handoutFileName(title: string): string {
  const base = Array.from(title)
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || 'orarchive-handout'}.html`
}
