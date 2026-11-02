/**
 * Gera assets/vitrine/projetos.json (lido pela vitrine do site) e as capas de 900 px.
 *   node scripts/vitrine/build-manifest.mjs
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { OBRAS, OBRAS_IMAGEM, MODELOS, DISCIPLINAS, AREAS, CAPAS } from './obras.mjs';
import { relatorioDe } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const VITRINE = path.join(ROOT, 'assets', 'vitrine');
const existe = (p) => access(p).then(() => true, () => false);

const TIPOS = { LOC: 'Locação', FOR: 'Formas', FUN: 'Fundações', VIG: 'Vigas', PIL: 'Pilares', LAJ: 'Lajes', ESC: 'Escada', PISC: 'Piscina' };
const NIVEIS = { 'TÉR': 'Térreo', '1PA': '1º pavimento', COB: 'Cobertura', BAR: 'Barrilete' };

/** Legenda genérica a partir do nome do arquivo de origem (sem nenhum nome de cliente). */
function legenda(origem, pagina, total, indice) {
  const nome = origem.normalize('NFC');
  const tipo = Object.keys(TIPOS).find((t) => new RegExp(`[-_ ]${t}(?:[-_. ]|$)`).test(nome));
  const nivel = Object.keys(NIVEIS).find((n) => nome.includes(`-${n}-`));
  if (tipo) return [nivel && NIVEIS[nivel], TIPOS[tipo]].filter(Boolean).join(' · ');
  const folha = nome.match(/Folha - \d+ - (.+?)\.pdf$/i);
  if (folha) return folha[1].toLowerCase().replace(/^./, (c) => c.toUpperCase()).replace('3d', '3D');
  return total > 1 ? `Prancha ${indice}` : 'Prancha';
}

const resumoModelos = JSON.parse(await readFile(path.join(VITRINE, 'modelos', 'resumo.json'), 'utf8').catch(() => '{}'));
const projetos = [];

async function montar(meta) {
  const pasta = path.join(VITRINE, meta.disciplina, meta.slug);
  const rel = JSON.parse(await readFile(relatorioDe(meta.disciplina, meta.slug), 'utf8'));
  const imagens = rel.paginas.map((p, i) => ({
    src: `assets/vitrine/${meta.disciplina}/${meta.slug}/${p.arquivo}`,
    caption: legenda(p.origem, p.pagina, rel.paginas.length, i + 1),
    w: p.largura, h: p.altura
  }));
  const capaIdx = Math.min(CAPAS[meta.slug] ?? 0, imagens.length - 1);
  await sharp(path.join(pasta, rel.paginas[capaIdx].arquivo)).resize({ width: 900, height: 600, fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 76 }).toFile(path.join(pasta, 'capa.webp'));
  const modelo = MODELOS.find((m) => m.obra === meta.slug);
  const frag = modelo && (await existe(path.join(VITRINE, 'modelos', `${modelo.id}.frag`))) ? `assets/vitrine/modelos/${modelo.id}.frag` : null;
  const legendas = [...new Set(imagens.map((i) => i.caption).filter((c) => !/^Prancha/.test(c)))];
  projetos.push({
    id: meta.slug, disciplina: meta.disciplina, tipo: meta.tipo, resumo: meta.resumo, ferramentas: meta.ferramentas,
    capa: `assets/vitrine/${meta.disciplina}/${meta.slug}/capa.webp`,
    imagens, conteudo: legendas.slice(0, 8), area: AREAS[meta.slug] || null, modelo: frag,
    modeloMB: modelo ? resumoModelos[modelo.id]?.fragMB ?? null : null
  });
}

for (const o of OBRAS) await montar(o);
for (const o of OBRAS_IMAGEM) if (!o.anexar) await montar(o);

const ordem = DISCIPLINAS.map(([id]) => id);
projetos.sort((a, b) => ordem.indexOf(a.disciplina) - ordem.indexOf(b.disciplina));
await writeFile(path.join(VITRINE, 'projetos.json'), JSON.stringify({
  disciplinas: DISCIPLINAS.map(([id, nome, icone]) => ({ id, nome, icone })), projetos
}, null, 1));
console.log(`${projetos.length} obras, ${projetos.reduce((n, p) => n + p.imagens.length, 0)} imagens, ${projetos.filter((p) => p.modelo).length} com 3D`);
