import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Rutas relativas: así la app anda igual en localhost y en GitHub Pages (usuario.github.io/repo/).
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt": cuando hay una versión nueva, la app avisa y vos elegís cuándo actualizar (ver main.tsx).
      registerType: 'prompt',
      includeAssets: ['icono.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mi panel de finanzas',
        short_name: 'Mi panel',
        description: 'Gastos, ingresos y ahorro en pesos y dólares. Los datos quedan en este dispositivo.',
        lang: 'es-AR',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#059669',
        background_color: '#0f172a',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Todo el código queda guardado para abrir la app sin internet. La cotización siempre va a la red.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
