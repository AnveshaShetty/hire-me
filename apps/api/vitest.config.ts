import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@repo/db': path.resolve(__dirname, '../../packages/db/dist/src/index.js'),
    },
  },
})
