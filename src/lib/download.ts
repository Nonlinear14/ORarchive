/** 글자 내용을 파일로 내려받게 한다 (임시 object URL 은 잠시 뒤 해제) */
export function downloadTextFile(fileName: string, content: string, type = 'text/html;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
