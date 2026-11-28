import { isWebUrl } from '../roll20/model'
import { imageFileToAvatar } from '../roll20/editor/avatarImage'

/** 줄이는 데 이보다 오래 걸리면 그 이미지는 건너뛴다 */
const TIMEOUT_MS = 8000

/** data URL → 파일 (fetch 없이 직접 풀어서) */
function dataUrlToFile(src: string): File {
  const [head, body] = src.split(',', 2)
  const type = /^data:([^;,]+)/.exec(head)?.[1] ?? 'image/png'
  const bytes = Uint8Array.from(atob(body ?? ''), (c) => c.charCodeAt(0))
  return new File([bytes], 'avatar', { type })
}

/**
 * JSON 로그의 프로필 이미지 → 저널 (Roll20 로그 저널과 같이 96×96 으로 줄여 로그 안에 저장).
 * https 주소는 그대로 쓴다. 줄이지 못한 이미지는 넣지 않는다 (나중에 캐릭터 설정에서 넣을 수 있다).
 */
export async function avatarsFromJson(avatars: Record<string, string>): Promise<{ avatars: Record<string, string>; failed: number }> {
  const out: Record<string, string> = {}
  let failed = 0
  for (const [speaker, src] of Object.entries(avatars)) {
    if (isWebUrl(src)) {
      out[speaker] = src
      continue
    }
    try {
      out[speaker] = await Promise.race([
        imageFileToAvatar(dataUrlToFile(src)),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
      ])
    } catch {
      failed++
    }
  }
  return { avatars: out, failed }
}
