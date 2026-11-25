import { cp, mkdir } from 'node:fs/promises';
import { sep } from 'node:path';

await mkdir('dist/assets', { recursive: true });
// The behind-the-scenes videos (assets/videos) are not used on the site and carry client
// names in their file names, so they stay out of the build too. The raw IFCs (assets/IFC)
// never ship either.
const unpublished = [['assets', 'IFC'], ['assets', 'videos']].map((parts) => parts.join('/'));
await cp('assets', 'dist/assets', {
  recursive: true,
  filter: (source) => {
    const path = source.split(sep).join('/');
    return !unpublished.some((dir) => path === dir || path.startsWith(`${dir}/`));
  }
});
// SEO files that must sit at the root of the published site.
await cp('robots.txt', 'dist/robots.txt');
await cp('sitemap.xml', 'dist/sitemap.xml');
