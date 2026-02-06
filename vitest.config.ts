import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node runtime is a better match for Worker route/unit tests
    environment: "node",

    // Include source files for coverage
    include: ["src/**/*.{test,spec}.{js,ts}"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.{test,spec}.ts",
        "src/types/**",
        "src/scripts/**",
        "src/styles/**",
      ],
    },

    // Global setup files
    setupFiles: ["src/test/setup.ts"],

    // Mock Cloudflare Workers runtime
    globals: true,

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
