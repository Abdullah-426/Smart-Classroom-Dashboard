import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // TODO: Point this target to your Node-RED host when backend API routes are ready.
      '/api': {
        target: 'http://localhost:1880',
        changeOrigin: true,
      },
    },
  },
})
