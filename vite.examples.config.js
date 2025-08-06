import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                // base: './examples/base/index.html',
                // worker: './examples/worker/index.html',
                // sharedWorker: './examples/sharedWorker/index.html',
            },
        },
    },
});
