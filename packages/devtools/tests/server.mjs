import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const port = Number(process.env.PORT ?? 5177);

const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
};

createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const path = join(root, normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));

    try {
        const info = await stat(path);
        const file = info.isDirectory() ? join(path, 'index.html') : path;
        await stat(file);
        response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
        createReadStream(file).pipe(response);
    } catch {
        response.writeHead(404).end('not found');
    }
}).listen(port, () => console.log(`fixture server on http://localhost:${port}`));
