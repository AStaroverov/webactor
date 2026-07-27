import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 5199);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
    testDir: './tests',
    timeout: 240_000,
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL,
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
        command: `pnpm dev:e2e --port ${port} --strictPort`,
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        url: baseURL,
        reuseExistingServer: !process.env.CI,
    },
});
