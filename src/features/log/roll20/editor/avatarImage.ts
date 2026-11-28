/** 저널 크기 (Roll20 은 28px 로 보여 주므로 고해상도 화면까지 넉넉하게) */
const SIZE = 96
/** 줄인 이미지(data URL) 크기 한도 — 로그 안에 저장되므로 작게 */
const MAX_DATA_URL = 60_000

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 읽지 못했어요. PNG·JPG·GIF·WEBP 파일인지 확인해 주세요.'))
    }
    img.src = url
  })
}

/**
 * 정사각형 칸 안의 그림 자리: 비율과 상관없이 높이를 칸에 맞추고 가운데 (2026-11-29).
 * 세로로 긴 그림은 양옆이 비고(투명), 가로로 긴 그림은 양옆이 잘린다 (x 가 음수)
 */
export function avatarRect(width: number, height: number, size = SIZE) {
  const scale = size / Math.max(height, 1)
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  return { x: Math.round((size - w) / 2), y: Math.round((size - h) / 2), w, h }
}

/**
 * 이미지 파일 → 96×96 저널 data URL.
 * 높이를 96px 에 맞추고 가운데에 놓는다 (2026-11-29, `avatarRect`). 남는 칸은 투명,
 * PNG 가 너무 커서 JPG 로 저장할 때만 흰색으로 채운다.
 */
export async function imageFileToAvatar(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) throw new Error('PNG·JPG·GIF·WEBP 이미지만 쓸 수 있어요.')
  const img = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이 브라우저에서는 이미지를 줄일 수 없어요. 링크 주소를 써 주세요.')
  const { x, y, w, h } = avatarRect(img.naturalWidth, img.naturalHeight)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, x, y, w, h)
  // 투명 배경을 살리려고 PNG 를 먼저 쓰고, 너무 크면 JPG 로 (JPG 는 투명이 없어 흰 바탕 위에 다시 그린다)
  let data = canvas.toDataURL('image/png')
  if (data.length > MAX_DATA_URL) {
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, SIZE, SIZE)
    data = canvas.toDataURL('image/jpeg', 0.85)
  }
  if (data.length > MAX_DATA_URL) throw new Error('이미지를 충분히 줄이지 못했어요. 다른 이미지를 써 주세요.')
  return data
}

/** 로그 속 이미지 최대 폭 (Roll20 채팅 칸보다 넉넉하게) */
const MAX_IMAGE = 800
/** 로그 속 이미지(data URL) 크기 한도 */
const MAX_IMAGE_DATA_URL = 400_000

/** 이미지 파일 → 긴 쪽을 800px 이하로 줄인 data URL (로그 안에 저장) */
export async function imageFileToLogImage(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) throw new Error('PNG·JPG·GIF·WEBP 이미지만 쓸 수 있어요.')
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_IMAGE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이 브라우저에서는 이미지를 줄일 수 없어요. 링크 주소를 써 주세요.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  let data = canvas.toDataURL('image/png')
  if (data.length > MAX_IMAGE_DATA_URL) data = canvas.toDataURL('image/jpeg', 0.85)
  if (data.length > MAX_IMAGE_DATA_URL) data = canvas.toDataURL('image/jpeg', 0.7)
  if (data.length > MAX_IMAGE_DATA_URL) throw new Error('이미지가 너무 커요. 더 작은 이미지나 링크 주소를 써 주세요.')
  return data
}
