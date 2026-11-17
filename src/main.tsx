import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { UpdatePrompt } from './components/UpdatePrompt'
import { requestPersistentStorage } from './db/db'
import './index.css'

// Просим браузер не стирать данные при нехватке места
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>,
)
