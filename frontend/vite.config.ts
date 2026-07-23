import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // The default 5000ms is too tight once every test file runs in
    // parallel on a resource-constrained machine (observed: isolated
    // runs of any single file are reliably fast; only full-suite
    // parallel runs occasionally time out under contention).
    testTimeout: 15000,
  },
})
