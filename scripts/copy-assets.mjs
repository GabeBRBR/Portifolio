import { cp, mkdir } from 'node:fs/promises';
import { sep } from 'node:path';

await mkdir('dist/assets', { recursive: true });
// The source IFCs (assets/IFC) are inputs of `convert:fragments`; the viewer only
// loads the generated Fragments, so they are not published.
const sourceIfcDirectory = ['assets', 'IFC'].join(sep);
await cp('assets', 'dist/assets', {
  recursive: true,
  filter: (source) => !source.split(sep).join('/').startsWith(sourceIfcDirectory.split(sep).join('/'))
});
// The Fragments importer expects a directory and appends `web-ifc.wasm` itself.
// Copy the WASM paired with the installed JS package under a stable Pages path.
await cp('node_modules/web-ifc/web-ifc.wasm', 'dist/assets/wasm/web-ifc.wasm');
