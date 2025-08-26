import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        minify: false,
        lib: {
            entry: './src/index.ts',
            name: 'webactor',
        },
        rollupOptions: {
            output: [{
                format: 'es',
                entryFileNames: '[name].js',
                preserveModules: true,
                preserveModulesRoot: './src',
                inlineDynamicImports: false
            }]
        }
    },
    plugins: [dts()],
});
