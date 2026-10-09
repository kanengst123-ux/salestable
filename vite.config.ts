
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: './',
  define: {
    // This allows the browser to see process.env.API_KEY
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  },
  build: {
    outDir: 'dist',
    sourcemap: false // Turned off for production to keep the code cleaner
  },
  server: {
    port: 3000,
    hmr: false
  }
});
