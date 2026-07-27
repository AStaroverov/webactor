import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        testTimeout: 10000,
        hookTimeout: 10000,
        teardownTimeout: 10000,
        globals: true,
        // Allow longer timeouts for worker tests
        reporters: ['verbose'],
        // Include test files
        include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        // Setup globals for vitest
        setupFiles: [],
    },
});
