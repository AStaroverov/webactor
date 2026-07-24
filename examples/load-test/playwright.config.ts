import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 240_000,
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: 'http://localhost:5199',
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: {
                    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
                },
            },
        },
    ],
    webServer: {
        command: 'pnpm dev --port 5199 --strictPort',
        url: 'http://localhost:5199',
        reuseExistingServer: !process.env.CI,
    },
});
