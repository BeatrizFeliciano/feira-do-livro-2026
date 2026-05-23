import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/feira-do-livro-2026/',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
})
