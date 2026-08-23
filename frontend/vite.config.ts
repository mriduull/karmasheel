import path from 'node:path'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

function requireApiOrigin(value: string | undefined) {
  const normalized = value?.trim().replace(/\/+$/, '')
  if (!normalized) {
    throw new Error('VITE_API_BASE_URL is required for production builds.')
  }

  const url = new URL(normalized)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.origin !== normalized ||
    url.username ||
    url.password
  ) {
    throw new Error('VITE_API_BASE_URL must be an HTTP(S) origin without /api or another path.')
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), '')
    // Environment variables supplied by the deployment platform take
    // precedence over values loaded from local .env files. loadEnv() does not
    // include pre-existing process.env values in its return object.
    requireApiOrigin(process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL)
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // Fixed at Django's documented CORS-allowed dev origin. strictPort
      // prevents a silent port change that would then fail CORS.
      port: 5173,
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      testTimeout: 15000,
    },
  }
})
