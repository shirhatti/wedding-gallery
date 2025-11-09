import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    proxy: {
      // Route video streaming endpoints to video-streaming worker
      '/api/hls': {
        target: 'http://localhost:8788',
        changeOrigin: true,
        secure: false,
      },
      '/api/hls-segment': {
        target: 'http://localhost:8788',
        changeOrigin: true,
        secure: false,
      },
      // Route all other API endpoints to viewer worker
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
