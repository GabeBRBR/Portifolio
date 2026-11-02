import { cp, mkdir } from 'node:fs/promises';
import { sep } from 'node:path';

await mkdir('dist/assets', { recursive: true });
// The source IFCs (assets/IFC) are inputs of `convert:fragments`; the viewer only
// loads the generated Fragments, so they are not published. The behind-the-scenes
// videos (assets/videos) are not used on the site and carry client names in their
// file names, so they stay out of the build too.
const unpublished = [['assets', 'IFC'], ['assets', 'videos']].map((parts) => parts.join('/'));
await cp('assets', 'dist/assets', {
  recursive: true,
  filter: (source) => {
    const path = source.split(sep).join('/');
    return !unpublished.some((dir) => path === dir || path.startsWith(`${dir}/`));
  }
});
// The Fragments importer expects a directory and appends `web-ifc.wasm` itself.
// Copy the WASM paired with the installed JS package under a stable Pages path.
await cp('node_modules/web-ifc/web-ifc.wasm', 'dist/assets/wasm/web-ifc.wasm');

// SEO files that must sit at the root of the published site.
await cp('robots.txt', 'dist/robots.txt');
await cp('sitemap.xml', 'dist/sitemap.xml');
