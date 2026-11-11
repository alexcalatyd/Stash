import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import './index.css'
import { page } from './lib/bridge'
import Panel from './Panel.tsx'
import SettingsWindow from './SettingsWindow.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">{page === 'settings' ? <SettingsWindow /> : <Panel />}</MotionConfig>
  </StrictMode>,
)
