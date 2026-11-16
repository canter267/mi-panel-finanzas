import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import { avisar } from './lib/avisos'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

// Service worker (solo en la versión publicada): guarda la app para usarla sin internet y avisa si hay una versión nueva.
const actualizar = registerSW({
  onNeedRefresh() {
    avisar({ texto: 'Hay una versión nueva de la app.', accion: { nombre: 'Actualizar', hacer: () => void actualizar(true) } })
  },
  onOfflineReady() {
    avisar('Listo: la app ya funciona sin internet.')
  },
})
