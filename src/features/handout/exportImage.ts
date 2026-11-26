/**
 * 핸드아웃 → JPG 이미지 파일. 화면 밖에 그린 읽기 전용 캔버스를 2배 해상도로 찍는다.
 * 글꼴(Pretendard)은 문서에 넣은 @font-face 를 그대로 담는다.
 * 다른 사이트의 이미지는 그 사이트가 허용(CORS)할 때만 담을 수 있다 — 허용하지 않는 이미지는 빼고 찍고, 몇 개를 뺐는지 알려 준다.
 */
import { toJpeg } from 'html-to-image'

async function readable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'force-cache' })
    return res.ok
  } catch {
    return false
  }
}

export interface JpgResult {
  dataUrl: string
  skippedImages: number
}

export async function handoutJpg(node: HTMLElement, background: string): Promise<JpgResult> {
  await document.fonts?.ready
  const urls = [...new Set([...node.querySelectorAll('img')].map((img) => img.src))]
  const blocked = new Set<string>()
  await Promise.all(urls.map(async (url) => !(await readable(url)) && blocked.add(url)))
  const dataUrl = await toJpeg(node, {
    quality: 0.95,
    pixelRatio: 2,
    backgroundColor: background,
    cacheBust: false,
    // 틀만 찍는다: 화면용 가운데 맞춤 여백·그림자는 빼고, 틀 크기 그대로
    width: node.offsetWidth,
    height: node.offsetHeight,
    style: { margin: '0', boxShadow: 'none' },
    filter: (n) => !(n instanceof HTMLImageElement && blocked.has(n.src)),
  })
  return { dataUrl, skippedImages: [...node.querySelectorAll('img')].filter((img) => blocked.has(img.src)).length }
}

export function downloadDataUrl(fileName: string, dataUrl: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
}
