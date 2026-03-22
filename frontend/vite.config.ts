import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Local file persistence (run `npm run storage` from project root)
      '/api/storage': {
        target: 'http://127.0.0.1:4050',
        changeOrigin: true,
      },
      // TODO: Point this target to your Node-RED host when backend API routes are ready.
      '/api': {
        target: 'http://localhost:1880',
        changeOrigin: true,
      },
    },
  },
})
