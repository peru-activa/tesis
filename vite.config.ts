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
    port: Number(process.env.WEB_PORT || 5173),
    proxy: {
      '/v1': process.env.API_ORIGIN || 'http://localhost:3100',
      '/health': process.env.API_ORIGIN || 'http://localhost:3100',
      '/socket.io': { target: process.env.API_ORIGIN || 'http://localhost:3100', ws: true },
    },
  },
});
