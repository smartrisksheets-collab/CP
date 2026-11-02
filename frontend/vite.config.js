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
      '/payments'  : 'http://localhost:8000',
      // /admin is also a page route: browser navigations (Accept: text/html)
      // get the React app, API calls still go to the backend
      '/admin'     : {
        target: 'http://localhost:8000',
        bypass: (req) => (req.headers.accept || '').includes('text/html') ? '/index.html' : undefined,
      },
    }
  }
})