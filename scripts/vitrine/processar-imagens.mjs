/**
 * Anonimiza imagens já exportadas (OBRAS_IMAGEM) e as grava como WebP em assets/vitrine.
 *   node scripts/vitrine/processar-imagens.mjs [slug ...]
 * Rode depois de render-sheets.mjs: obras com `anexar` continuam a numeração existente.
 */
import { mkdir, readdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { OBRAS_IMAGEM } from './obras.mjs';
import { SRC, RELATORIOS, relatorioDe } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const OUT = path.join(ROOT, 'assets', 'vitrine');
const LARGURA = 2400;
const filtro = process.argv.slice(2);

for (const obra of OBRAS_IMAGEM) {
  if (filtro.length && !filtro.includes(obra.slug)) continue;
  const destino = path.join(OUT, obra.disciplina, obra.slug);
  await mkdir(destino, { recursive: true });
  let numero = (await readdir(destino)).filter((f) => /^\d+\.webp$/.test(f)).length;
  if (!obra.anexar) numero = 0;
  await mkdir(RELATORIOS, { recursive: true });
  const relFile = relatorioDe(obra.disciplina, obra.slug);
  const relatorio = obra.anexar ? JSON.parse(await readFile(relFile, 'utf8')) : { slug: obra.slug, paginas: [], descartadas: [], autoCobertas: [] };
  for (const item of obra.itens) {
    let img = sharp(path.join(SRC, item.fonte)).rotate();
    const meta = await img.metadata();
    const w = Math.min(meta.width, LARGURA); const h = Math.round(meta.height * (w / meta.width));
    img = img.resize({ width: w });
    const base = await img.toBuffer();
    const camadas = [];
    for (const [x0, y0, x1, y1] of item.borrar || []) {
      const box = { left: Math.round(x0 * w), top: Math.round(y0 * h), width: Math.round((x1 - x0) * w), height: Math.round((y1 - y0) * h) };
      camadas.push({ input: await sharp(base).extract(box).blur(18).toBuffer(), left: box.left, top: box.top });
    }
    const rects = (item.cobrir || []).filter(([a, b, c, d]) => c > a && d > b).map(([x0, y0, x1, y1]) =>
      `<rect x="${Math.round(x0 * w)}" y="${Math.round(y0 * h)}" width="${Math.round((x1 - x0) * w)}" height="${Math.round((y1 - y0) * h)}" fill="#fff"/>`);
    if (rects.length) camadas.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rects.join('')}</svg>`) });
    numero++;
    const nome = `${String(numero).padStart(2, '0')}.webp`;
    await sharp(base).composite(camadas).webp({ quality: 80, effort: 5 }).toFile(path.join(destino, nome));
    relatorio.paginas.push({ arquivo: nome, origem: path.basename(item.fonte), pagina: 1, largura: w, altura: h });
  }
  await writeFile(relFile, JSON.stringify(relatorio, null, 2));
  console.log(`${obra.slug}: ${relatorio.paginas.length} imagens`);
}
