/**
 * Converte os IFCs de MODELOS em Fragments simples para o MiniViewer.
 *   node scripts/vitrine/convert-modelos.mjs [id ...]
 * - Só geometria: nenhum índice BIM, collider ou propriedades vão para o site.
 * - Calcula a área de lajes por pavimento (para a metragem aproximada).
 * - Troca por "x" termos de BLOQUEIO que o .frag carrega (nome do arquivo IFC, nome do projeto).
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { IfcImporter } from '@thatopen/fragments';
import { IfcAPI, LogLevel } from 'web-ifc';
import { buildBimIndex } from '../../src/bim/ifc-index-builder.js';
import { MODELOS, BLOQUEIO } from './obras.mjs';
import { SRC } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const OUT = path.join(ROOT, 'assets', 'vitrine', 'modelos');
const WASM = path.join(ROOT, 'node_modules', 'web-ifc') + path.sep;
const filtro = process.argv.slice(2);
// Só nomes próprios e arquivos IFC entram na troca: padrões curtos (@, cpf, rua) casariam com bytes binários.
const NOMES = BLOQUEIO.filter((re) => !/[@\d]|cpf|rua|crea|cnpj|lote|quadra|avenida|av\.|endereco|cliente|proprietario/.test(re.source));
const sensivel = (t) => /.ifc$/i.test(t) || NOMES.some((re) => re.test(normalizar(t)));

const api = new IfcAPI();
api.SetWasmPath(WASM, true);
await api.Init();
api.SetLogLevel?.(LogLevel.LOG_LEVEL_OFF);

const normalizar = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
await mkdir(OUT, { recursive: true });
const resumo = {};

for (const m of MODELOS) {
  if (filtro.length && !filtro.includes(m.id)) continue;
  const bytes = new Uint8Array(await readFile(path.join(SRC, m.fonte)));

  // Área de lajes por pavimento (cobertura inclusa) a partir do índice BIM, só para cálculo local.
  const modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
  let areas = {};
  try {
    const index = buildBimIndex(api, modelID);
    const nomes = new Map(index.storeys.map((s) => [s.id, s.name]));
    for (const e of index.elements) {
      if (!/slab|laje|piso|floor/i.test(`${e.cls} ${e.name || ''}`) || !e.q?.area) continue;
      const chave = nomes.get(e.storey) || '(sem pavimento)';
      areas[chave] = (areas[chave] || 0) + e.q.area;
    }
  } finally { api.CloseModel(modelID); }

  const importer = new IfcImporter();
  importer.wasm = { path: WASM, absolute: true };
  importer.webIfcSettings = { COORDINATE_TO_ORIGIN: false };
  importer.doubleSidedMaterials = true;
  const convertido = await importer.process({ bytes, raw: false });

  // O .frag é um buffer zlib com os atributos do IFC (nome do arquivo, do projeto etc.).
  // Termos sensíveis são trocados por "x" do mesmo tamanho para não quebrar o formato.
  const interno = zlib.inflateSync(convertido);
  const textoBruto = interno.toString('latin1');
  const suspeitos = new Set((textoBruto.match(/[A-Za-z0-9\u00c0-\u00ff_ .,:()\/@-]{4,}/g) || [])
    .filter((t) => t.length >= 5 && /[A-Za-z]{4}/.test(t) && !/^[A-Za-z0-9_$]{22}$/.test(t) && !/^IFCREAL$/.test(t) && sensivel(t)));
  let limpo = textoBruto;
  for (const t of suspeitos) limpo = limpo.split(t).join('x'.repeat(t.length));
  const frag = zlib.deflateSync(Buffer.from(limpo, 'latin1'), { level: 9 });
  await writeFile(path.join(OUT, m.id + '.frag'), frag);

  const achados = [...suspeitos];
  const tamanho = (await stat(path.join(OUT, `${m.id}.frag`))).size;
  resumo[m.id] = { termosSubstituidos: achados.length, fragMB: +(tamanho / 1048576).toFixed(2), areasPorPavimento: Object.fromEntries(Object.entries(areas).map(([k, v]) => [k, +v.toFixed(1)])) };
  console.log(m.id, resumo[m.id]);
}
await writeFile(path.join(OUT, 'resumo.json'), JSON.stringify(resumo, null, 2));
