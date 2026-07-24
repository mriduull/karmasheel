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
  server: {
    // Fixed at Django's documented CORS-allowed dev origin
    // (backend .env's CORS_ALLOWED_ORIGINS, see .env.example). strictPort
    // makes `npm run dev` fail with a clear error when 5173 is already in
    // use, instead of Vite silently switching to another port (e.g. 5174)
    // and producing a confusing CORS failure that looks like the backend
    // is unreachable. See docs/DEVELOPMENT_SETUP.md for how to free the
    // port, or to deliberately opt into a different one.
    port: 5173,
    strictPort: true,
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
