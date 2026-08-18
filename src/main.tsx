import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StoreProvider } from '@/lib/store'
import { AuthProvider } from "@/lib/AuthContext"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
    <AuthProvider>
      <App />
      </AuthProvider>
    </StoreProvider>
  </StrictMode>,
)
