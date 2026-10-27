import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IfcImporter } from '@thatopen/fragments';
import { buildBimIndex } from '../src/bim/ifc-index-builder.js';
import {
  IfcAPI,
  IFCBEAM,
  IFCBUILDINGELEMENTPROXY,
  IFCBUILDINGELEMENTPART,
  IFCCOLUMN,
  IFCCURTAINWALL,
  IFCFOOTING,
  IFCGEOGRAPHICELEMENT,
  IFCMEMBER,
  IFCPAVEMENT,
  IFCPILE,
  IFCPLATE,
  IFCRAMP,
  IFCROOF,
  IFCSLAB,
  IFCSTAIR,
  IFCSTAIRFLIGHT,
  IFCWALL,
  IFCWALLSTANDARDCASE,
  LogLevel
} from 'web-ifc';

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
  ['galpao', 'Estrutural', 'assets/IFC/Galpão/EST.ifc', 'galpao-estrutural'],
  ['casa-popular', 'Arquitetura', 'assets/IFC/Casa Popular/AION-ARQUITETURA-CREAGO.ifc', 'casa-popular-arquitetura'],
  ['casa-popular', 'Estrutural', 'assets/IFC/Casa Popular/AION-ARQUITETURA-CREAGO-AION-ESTRUTURAL-CREAGO.ifc', 'casa-popular-estrutural'],
  ['casa-popular', 'Elétrica', 'assets/IFC/Casa Popular/AION-ARQUITETURA-CREAGO-AION-ELÉTRICO-CREA-R00.ifc', 'casa-popular-eletrica'],
  ['casa-popular', 'Hidrossanitário', 'assets/IFC/Casa Popular/AION-ARQUITETURA-CREAGO-AION-HIDROSSANITÁRIO-CREA-R00.ifc', 'casa-popular-hidrossanitario']
];
// Optional filter: `pnpm run convert:fragments casa-popular` converts only that
// work and keeps the other works' entries already present in models.json.
const onlyWork = process.argv[2] || null;
const MAX_COLLIDER_BYTES = 8 * 1024 * 1024;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const relative = (target) => path.relative(root, target).replaceAll(path.sep, '/');
const floorTypes = new Set([
  IFCSLAB, IFCSTAIR, IFCSTAIRFLIGHT, IFCRAMP, IFCFOOTING,
  IFCPAVEMENT, IFCGEOGRAPHICELEMENT, IFCBUILDINGELEMENTPROXY,
  IFCBEAM
]);
// These categories make up the navigable architectural/structural shell.
// Proxies are intentionally both floor and obstacle: Revit often exports
// walls, beams and generic floor volumes all under this one IFC category.
const obstacleTypes = new Set([
  IFCWALL, IFCWALLSTANDARDCASE, IFCCOLUMN, IFCCURTAINWALL, IFCROOF,
  IFCBEAM, IFCMEMBER, IFCPLATE, IFCBUILDINGELEMENTPART, IFCPILE,
  IFCSLAB, IFCSTAIR, IFCSTAIRFLIGHT, IFCRAMP, IFCFOOTING,
  IFCPAVEMENT, IFCGEOGRAPHICELEMENT, IFCBUILDINGELEMENTPROXY
]);

function encodeCollider(floors, obstacles) {
  const headerBytes = 24;
  const totalBytes = headerBytes
    + (floors.positions.length + obstacles.positions.length) * Float32Array.BYTES_PER_ELEMENT
    + (floors.indices.length + obstacles.indices.length) * Uint32Array.BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  view.setUint32(0, 0x49464343, true); // IFCC
  view.setUint32(4, 1, true);
  view.setUint32(8, floors.positions.length, true);
  view.setUint32(12, floors.indices.length, true);
  view.setUint32(16, obstacles.positions.length, true);
  view.setUint32(20, obstacles.indices.length, true);
  let offset = headerBytes;
  new Float32Array(buffer, offset, floors.positions.length).set(floors.positions);
  offset += floors.positions.length * 4;
  new Uint32Array(buffer, offset, floors.indices.length).set(floors.indices);
  offset += floors.indices.length * 4;
  new Float32Array(buffer, offset, obstacles.positions.length).set(obstacles.positions);
  offset += obstacles.positions.length * 4;
  new Uint32Array(buffer, offset, obstacles.indices.length).set(obstacles.indices);
  return new Uint8Array(buffer);
}

function appendPlacedGeometry(target, api, modelID, placedGeometry) {
  const geometry = api.GetGeometry(modelID, placedGeometry.geometryExpressID);
  const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
  const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
  const matrix = placedGeometry.flatTransformation;
  const vertexOffset = target.positions.length / 3;
  for (let index = 0; index < vertices.length; index += 6) {
    const x = vertices[index];
    const y = vertices[index + 1];
    const z = vertices[index + 2];
    target.positions.push(
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
    );
  }
  for (let index = 0; index < indices.length; index += 1) target.indices.push(vertexOffset + indices[index]);
  geometry.delete?.();
}

function createCollider(api, source, coordinateToOrigin) {
  const floors = { positions: [], indices: [] };
  const obstacles = { positions: [], indices: [] };
  const modelID = api.OpenModel(new Uint8Array(source), { COORDINATE_TO_ORIGIN: coordinateToOrigin });
  try {
    api.StreamAllMeshes(modelID, (flatMesh) => {
      const type = api.GetLineType(modelID, flatMesh.expressID);
      const targets = [
        ...(floorTypes.has(type) ? [floors] : []),
        ...(obstacleTypes.has(type) ? [obstacles] : [])
      ];
      if (!targets.length) return;
      for (let index = 0; index < flatMesh.geometries.size(); index += 1) {
        for (const target of targets) appendPlacedGeometry(target, api, modelID, flatMesh.geometries.get(index));
      }
    });
  } finally {
    api.CloseModel(modelID);
  }
  return { bytes: encodeCollider(floors, obstacles), floors, obstacles };
}

function createBimIndex(api, source) {
  const modelID = api.OpenModel(new Uint8Array(source), { COORDINATE_TO_ORIGIN: false });
  try {
    return buildBimIndex(api, modelID);
  } finally {
    api.CloseModel(modelID);
  }
}

await mkdir(outputRoot, { recursive: true });
const webIfc = new IfcAPI();
webIfc.SetWasmPath(`${wasmDirectory}${path.sep}`, true);
await webIfc.Init();
// Revit exports routinely contain breps web-ifc cannot triangulate; those
// elements are still indexed, so the per-element warnings are only noise here.
webIfc.SetLogLevel?.(LogLevel.LOG_LEVEL_OFF);
const manifestPath = path.join(outputRoot, 'models.json');
const manifest = { version: 3, generatedAt: new Date().toISOString(), models: [] };
if (onlyWork) manifest.models = JSON.parse(await readFile(manifestPath, 'utf8')).models;

for (const [work, discipline, sourcePath, id] of models) {
  if (onlyWork && work !== onlyWork) continue;
  const absoluteSource = path.join(root, sourcePath);
  const source = await readFile(absoluteSource);
  const importer = new IfcImporter();
  importer.wasm = { path: `${wasmDirectory}${path.sep}`, absolute: true };
  // Preserve IFC survey coordinates without normalizing each model independently.
  // When COORDINATE_TO_ORIGIN is false, all federated disciplines share the same
  // coordinate space as designed in BIM authoring tools.
  importer.webIfcSettings = { COORDINATE_TO_ORIGIN: false };
  // Match the existing viewer, which renders IFC materials double-sided.
  importer.doubleSidedMaterials = true;
  const converted = await importer.process({ bytes: new Uint8Array(source), raw: false });
  const destination = path.join(outputRoot, work, `${id}.frag`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, converted);
  let collider = null;
  let colliderHash = null;
  let colliderBytes = 0;
  let colliderStats = null;
  // Only architectural and structural disciplines participate in player
  // physics. This keeps MEP fittings, furniture and other small elements out
  // of the collider while preserving generic-model floors from Revit.
  if (discipline === 'Arquitetura' || discipline === 'Estrutural') {
    const generated = createCollider(webIfc, source, false);
    if (generated.bytes.byteLength > MAX_COLLIDER_BYTES) {
      // Very detailed exports (e.g. rebar-level structure) would ship tens of MB
      // to the browser; walking falls back to the other disciplines' colliders.
      console.warn(`  colisão de ${discipline} descartada: ${Math.round(generated.bytes.byteLength / 1048576)} MB excede o limite de ${MAX_COLLIDER_BYTES / 1048576} MB`);
    } else {
      const colliderDestination = path.join(outputRoot, work, `${id}.collider`);
      await writeFile(colliderDestination, generated.bytes);
      collider = relative(colliderDestination);
      colliderHash = sha256(generated.bytes);
      colliderBytes = generated.bytes.byteLength;
      colliderStats = {
        floorTriangles: generated.floors.indices.length / 3,
        obstacleTriangles: generated.obstacles.indices.length / 3
      };
    }
  }
  // BIM index: class, type, storey, materials, systems and quantities of
  // every element, consumed by the navigator, element sheet and takeoffs.
  const bimIndex = createBimIndex(webIfc, source);
  const bimIndexBytes = Buffer.from(JSON.stringify(bimIndex));
  const bimIndexDestination = path.join(outputRoot, work, `${id}.bim.json`);
  await writeFile(bimIndexDestination, bimIndexBytes);
  const outputInfo = await stat(destination);
  const entry = {
    id,
    work,
    discipline,
    source: sourcePath,
    sourceHash: sha256(source),
    fragment: relative(destination),
    fragmentHash: sha256(converted),
    collider,
    // Generated collider assets share the model-local vertex coordinate
    // system of the corresponding Fragment and transform with model.object.
    colliderCoordinateSpace: 'model-local',
    colliderHash,
    colliderBytes,
    colliderStats,
    bimIndex: relative(bimIndexDestination),
    bimIndexHash: sha256(bimIndexBytes),
    bimIndexBytes: bimIndexBytes.byteLength,
    bimElements: bimIndex.elements.length,
    sourceBytes: source.byteLength,
    fragmentBytes: outputInfo.size
  };
  const existing = manifest.models.findIndex((model) => model.id === id);
  if (existing >= 0) manifest.models[existing] = entry;
  else manifest.models.push(entry);
  console.log(`${discipline}: ${relative(destination)} (${Math.round(outputInfo.size / 1024)} KB), colisão ${Math.round(colliderBytes / 1024)} KB, índice BIM ${bimIndex.elements.length} elementos (${Math.round(bimIndexBytes.byteLength / 1024)} KB)`);
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifesto: ${relative(manifestPath)}`);
