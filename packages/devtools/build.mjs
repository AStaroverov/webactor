import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));
const outdir = `${root}dist`;
const watch = process.argv.includes('--watch');
const pack = process.argv.includes('--pack');

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

const { version } = JSON.parse(await readFile(`${root}package.json`, 'utf8'));

/** The store refuses a version it has already seen, so it is kept in one place: package.json. */
async function copyStatic() {
    const manifest = JSON.parse(await readFile(`${root}manifest.json`, 'utf8'));
    await writeFile(`${outdir}/manifest.json`, `${JSON.stringify({ ...manifest, version }, undefined, 4)}\n`);
    await cp(`${root}public`, outdir, { recursive: true });
}

async function zip() {
    const archive = `${root}webactor-devtools-${version}.zip`;
    await rm(archive, { force: true });
    await promisify(execFile)('zip', ['--recurse-paths', '--quiet', '-X', archive, '.'], { cwd: outdir });
    console.log(`packed → ${archive}`);
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
    if (pack) await zip();
}
