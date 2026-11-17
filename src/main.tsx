import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { UpdatePrompt } from './components/UpdatePrompt'
import { requestPersistentStorage } from './db/db'
import { autoCloseMonths } from './db/repo'
import { todayISO } from './lib/dates'
import './index.css'

// Просим браузер не стирать данные при нехватке места
void requestPersistentStorage()

// Итоги прошлых месяцев, по которым не приняли решение за 7 дней, применяются сами (перенос остатков)
autoCloseMonths(todayISO()).catch((e) => console.error('Не удалось подвести итоги месяца', e))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>,
)
