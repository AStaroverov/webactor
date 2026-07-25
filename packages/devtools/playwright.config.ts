import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: { trace: 'retain-on-failure' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: 'node tests/server.mjs',
        url: `http://localhost:${process.env.PORT ?? 5177}/devtools/tests/fixtures/index.html`,
        reuseExistingServer: !process.env.CI,
    },
});
