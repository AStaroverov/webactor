import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    resolve: {
        alias: {
            webactor: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
        },
    },
    server: {
        fs: {
            allow: [fileURLToPath(new URL('..', import.meta.url))],
        },
    },
});
