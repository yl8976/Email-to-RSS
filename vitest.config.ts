import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use happy-dom for browser API simulation
    environment: 'happy-dom',
    
    // Include source files for coverage
    include: ['src/**/*.{test,spec}.{js,ts}'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.{test,spec}.ts',
        'src/types/**',
        'src/scripts/**',
        'src/styles/**'
      ]
    },
    
    // Global setup files
    setupFiles: ['src/test/setup.ts'],
    
    // Mock Cloudflare Workers runtime
    globals: true,
    
    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000
  }
});
