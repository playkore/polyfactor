import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const rawBase = process.env.VITE_BASE_PATH ?? '/';
const base = rawBase === '/' ? '/' : rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['doc/**', 'tests/e2e/**'],
  },
});
