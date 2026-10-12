import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', include: ['src/**/*.test.tsx', 'src/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 60_000, setupFiles: ['src/test/setup.ts'] },
});
