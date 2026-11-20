import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installTextures } from './textures'
import '@fontsource/tiny5/400.css'
import './styles.css'

installTextures()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
