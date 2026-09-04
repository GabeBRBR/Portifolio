import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IfcImporter } from '@thatopen/fragments';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'assets', 'fragments');
const wasmDirectory = path.join(root, 'node_modules', 'web-ifc');
const models = [
  ['casa-terrea', 'Arquitetura', 'assets/IFC/Casa Térrea/CASA-AQR.ifc', 'casa-terrea-arquitetura'],
  ['casa-terrea', 'Estrutural', 'assets/IFC/Casa Térrea/CASA-EST.ifc', 'casa-terrea-estrutural'],
  ['casa-terrea', 'Elétrica', 'assets/IFC/Casa Térrea/CASA-ELE.ifc', 'casa-terrea-eletrica'],
  ['casa-terrea', 'Hidráulica', 'assets/IFC/Casa Térrea/CASA-HID.ifc', 'casa-terrea-hidraulica'],
  ['casa-terrea', 'Sanitária', 'assets/IFC/Casa Térrea/CASA-ESG.ifc', 'casa-terrea-sanitaria'],
  ['galpao', 'Arquitetura', 'assets/IFC/Galpão/ARQ.ifc', 'galpao-arquitetura'],
  ['galpao', 'Estrutural', 'assets/IFC/Galpão/EST.ifc', 'galpao-estrutural']
];

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const relative = (target) => path.relative(root, target).replaceAll(path.sep, '/');

await mkdir(outputRoot, { recursive: true });
const manifest = { version: 1, generatedAt: new Date().toISOString(), models: [] };

for (const [work, discipline, sourcePath, id] of models) {
  const absoluteSource = path.join(root, sourcePath);
  const source = await readFile(absoluteSource);
  const importer = new IfcImporter();
  importer.wasm = { path: `${wasmDirectory}${path.sep}`, absolute: true };
  // Preserve the common IFC origin so federated disciplines remain aligned.
  importer.webIfcSettings = { COORDINATE_TO_ORIGIN: false };
  // Match the existing viewer, which renders IFC materials double-sided.
  importer.doubleSidedMaterials = true;
  const converted = await importer.process({ bytes: new Uint8Array(source), raw: false });
  const destination = path.join(outputRoot, work, `${id}.frag`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, converted);
  const outputInfo = await stat(destination);
  manifest.models.push({
    id,
    work,
    discipline,
    source: sourcePath,
    sourceHash: sha256(source),
    fragment: relative(destination),
    fragmentHash: sha256(converted),
    sourceBytes: source.byteLength,
    fragmentBytes: outputInfo.size
  });
  console.log(`${discipline}: ${relative(destination)} (${Math.round(outputInfo.size / 1024)} KB)`);
}

await writeFile(path.join(outputRoot, 'models.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifesto: ${relative(path.join(outputRoot, 'models.json'))}`);
