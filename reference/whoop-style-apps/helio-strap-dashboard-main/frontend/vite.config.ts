import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Respeta el puerto asignado por el entorno (p. ej. preview) si lo hay.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    proxy: {
      // El frontend habla con el backend Python (adaptador Zepp) en /api
      '/api': 'http://localhost:8000',
    },
  },
})
