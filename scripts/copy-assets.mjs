import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist/assets', { recursive: true });
await cp('assets', 'dist/assets', { recursive: true });
// The Fragments importer expects a directory and appends `web-ifc.wasm` itself.
// Copy the WASM paired with the installed JS package under a stable Pages path.
await cp('node_modules/web-ifc/web-ifc.wasm', 'dist/assets/wasm/web-ifc.wasm');

// Arquivos de SEO que precisam ficar na raiz do site publicado.
await cp('robots.txt', 'dist/robots.txt');
await cp('sitemap.xml', 'dist/sitemap.xml');
