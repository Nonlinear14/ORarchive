import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { App } from './App'
import { AuthProvider } from './lib/auth/AuthProvider'
import './styles/tokens.css'
import './styles/base.css'
import './styles/theme-dark.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root 요소를 찾을 수 없습니다.')

// Vite base('/ORarchive/')에서 끝 슬래시를 뺀 값을 라우터 basename으로 사용
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

// 데이터 라우터: 저장하지 않은 변경이 있을 때 다른 화면으로 가는 것을 막고 묻는다(useBlocker). 화면 경로는 App 의 <Routes> 그대로
const router = createBrowserRouter([{ path: '*', element: <App /> }], { basename })

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
