import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Regex prefixes give Vite higher priority than the SPA fallback,
      // which otherwise turned /uploads/foo.mp3 into index.html (text/html).
      '^/api/.*':      { target: process.env.VITE_API_URL || 'http://localhost:4000', changeOrigin: true },
      '^/uploads/.*':  { target: process.env.VITE_API_URL || 'http://localhost:4000', changeOrigin: true },
    },
  },
});
