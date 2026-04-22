import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth'      : 'http://localhost:8000',
      '/assessment': 'http://localhost:8000',
      '/quota'     : 'http://localhost:8000',
      '/tenant'    : 'http://localhost:8000',
      '/health'    : 'http://localhost:8000',
    }
  }
})