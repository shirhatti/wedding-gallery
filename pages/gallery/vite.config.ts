import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Helper to create proxy configuration with Origin preservation
function createProxyConfig(target: string) {
  return {
    target,
    changeOrigin: false, // Keep original origin header
    secure: false,
    configure: (proxy: any, _options: any) => {
      proxy.on('proxyReq', (proxyReq: any, req: any, _res: any) => {
        // Preserve Origin header from browser for auth
        if (req.headers.origin) {
          proxyReq.setHeader('Origin', req.headers.origin);
        }
      });
    },
  };
}

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
      // Route login to viewer worker
      '/login': createProxyConfig('http://localhost:8787'),
      // Route video streaming endpoints to video-streaming worker
      '/api/hls': createProxyConfig('http://localhost:8788'),
      '/api/hls-segment': createProxyConfig('http://localhost:8788'),
      // Route all other API endpoints to viewer worker
      '/api': createProxyConfig('http://localhost:8787'),
    },
  },
})
