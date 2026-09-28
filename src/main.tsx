import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import { initAuth } from './lib/auth'

/* Paint the stored theme before React mounts so there is no light flash. */
try {
  const ui = JSON.parse(localStorage.getItem('ibsra.ui.v1') || '{}')
  if (ui.theme) document.documentElement.dataset.theme = ui.theme
} catch { /* first run */ }

/* Listen to sign-in before the first render; the demo (no backend) is ready at once. */
initAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
