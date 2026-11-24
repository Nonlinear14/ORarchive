// GitHub Pages SPA 지원: 404.html 로 index.html 을 복제해 딥링크를 처리하고,
// .nojekyll 로 Jekyll 처리를 끈다.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')
const index = join(dist, 'index.html')

if (!existsSync(index)) {
  console.error('postbuild: dist/index.html 이 없습니다. vite build 를 먼저 실행하세요.')
  process.exit(1)
}

copyFileSync(index, join(dist, '404.html'))
writeFileSync(join(dist, '.nojekyll'), '')
console.log('postbuild: dist/404.html, dist/.nojekyll 생성 완료')
