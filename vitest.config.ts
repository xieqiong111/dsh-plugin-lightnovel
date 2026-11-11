import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 90_000,
    // The DSH integration suite boots a real Cordis runtime and spawns the
    // compiled Dart core; run files serially so they don't fight over ports or
    // the shared DSH_HOME fixture.
    fileParallelism: false,
  },
})
