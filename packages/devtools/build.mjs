import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));
const outdir = `${root}dist`;
const watch = process.argv.includes('--watch');

const scripts = [
    { entry: 'src/hook.ts', out: 'hook', format: 'iife' },
    { entry: 'src/content.ts', out: 'content', format: 'iife' },
    { entry: 'src/background.ts', out: 'background', format: 'iife' },
    { entry: 'src/devtools.ts', out: 'devtools', format: 'iife' },
    { entry: 'src/popup.ts', out: 'popup', format: 'iife' },
    { entry: 'src/panel/main.ts', out: 'panel', format: 'iife' },
];

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

async function copyStatic() {
    await cp(`${root}manifest.json`, `${outdir}/manifest.json`);
    await cp(`${root}public`, outdir, { recursive: true });
}

const contexts = await Promise.all(
    scripts.map((script) =>
        esbuild.context({
            entryPoints: [`${root}${script.entry}`],
            outfile: `${outdir}/${script.out}.js`,
            bundle: true,
            format: script.format,
            target: 'chrome111',
            sourcemap: watch ? 'inline' : false,
            minify: !watch,
            logLevel: 'info',
        }),
    ),
);

await copyStatic();

if (watch) {
    await Promise.all(contexts.map((context) => context.watch()));
    console.log('watching…  load packages/devtools/dist as an unpacked extension');
} else {
    await Promise.all(contexts.map((context) => context.rebuild()));
    await Promise.all(contexts.map((context) => context.dispose()));
    console.log(`built → ${outdir}`);
}
