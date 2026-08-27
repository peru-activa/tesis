import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://localhost:3100',
      '/health': 'http://localhost:3100',
      '/socket.io': { target: 'http://localhost:3100', ws: true },
    },
  },
});
