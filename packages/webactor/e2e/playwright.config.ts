import { fileURLToPath } from 'node:url';
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
        command: 'pnpm dev:e2e --port 5199 --strictPort',
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        url: 'http://localhost:5199',
        reuseExistingServer: !process.env.CI,
    },
});
