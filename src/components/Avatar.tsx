import { useState } from 'react'

interface AvatarProps {
  name: string
  url: string | null
  className?: string
}

/** 프로필 사진. 없거나 불러오지 못하면 이름 첫 글자를 보여준다. */
export function Avatar({ name, url, className = 'avatar' }: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const initial = [...name.trim()][0]?.toUpperCase() ?? 'F'

  return (
    <span className={className} aria-hidden="true">
      {url && failedUrl !== url ? (
        <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      ) : (
        initial
      )}
    </span>
  )
}
