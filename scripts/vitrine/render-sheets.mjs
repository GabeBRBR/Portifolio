/**
 * Converte os PDFs de cada obra em imagens WebP anonimizadas.
 *
 *   node scripts/vitrine/render-sheets.mjs [slug ...]
 *
 * 1. Cobre o carimbo (retângulos de obras.mjs).
 * 2. Cobre, em qualquer lugar da prancha, linhas de texto que casem com BLOQUEIO.
 * 3. Descarta páginas com círculos laranja (obras com paginas: 'sem-laranja').
 * 4. Grava assets/vitrine/<disciplina>/<slug>/NN.webp e o relatório em scripts/vitrine/relatorios/ (fora do site).
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { OBRAS, BLOQUEIO } from './obras.mjs';
import { SRC, openPdf, renderPage, pageLines, RELATORIOS, relatorioDe } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const OUT = path.join(ROOT, 'assets', 'vitrine');
const LARGURA_PAISAGEM = 2400;
const LARGURA_RETRATO = 1700;

const normalizar = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sensivel = (t) => BLOQUEIO.some((re) => re.test(normalizar(t)));
/** Linhas que só existem no carimbo; a posição delas dá o canto superior esquerdo do carimbo da página. */
const ANCORA_CARIMBO = /^(desenvolvimento|investidores|construcao|empreendimento\b.*|rev\.?|notas \/ observacoes.*|responsavel\b.*|cliente\b.*|endereco\b.*|obra:?|proprietario|disciplina|conteudo|prancha.*|registro\b.*|folha.*|edificacao|projeto arquitetonico|incorporacao.*)$/;
function carimboAuto(linhas, W, H) {
  const ancoras = linhas.filter((l) => l.x / W > 0.55 && l.y / H > 0.5 && ANCORA_CARIMBO.test(normalizar(l.text.trim())));
  if (ancoras.length < 4) return null;
  const x = Math.min(...ancoras.map((l) => l.x)) / W;
  const y = Math.min(...ancoras.map((l) => l.y)) / H;
  return [Math.max(0.5, x - 0.008), Math.max(0.5, y - 0.07), 1, 1];
}
const dentro = (l, r, W, H) => {
  const cx = (l.x + l.w / 2) / W; const cy = (l.y + l.h / 2) / H;
  return r.some(([x0, y0, x1, y1]) => cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1);
};

/** Fração de pixels de laranja forte (usada para achar as páginas marcadas com círculos). */
async function fracaoLaranja(png) {
  const { data, info } = await sharp(png).resize({ width: 600 }).raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 230 && g > 100 && g < 170 && b < 60) n++;
  }
  return n / (info.width * info.height);
}

function sobreposicao(w, h, retangulos) {
  const caixas = retangulos.map(([x0, y0, x1, y1, grande]) => {
    const x = Math.round(x0 * w); const y = Math.round(y0 * h);
    const bw = Math.round((x1 - x0) * w); const bh = Math.round((y1 - y0) * h);
    const rotulo = grande && bw > 300 && bh > 200
      ? `<text x="${x + bw / 2}" y="${y + bh / 2}" font-family="Arial" font-size="${Math.round(w / 90)}" fill="#9aa3ad" text-anchor="middle">Carimbo omitido</text>` : '';
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="#fff"/>${rotulo}`;
  });
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${caixas.join('')}</svg>`);
}

async function processarObra(obra) {
  const dir = path.join(SRC, obra.fonte);
  const arquivos = [];
  const filtro = obra.apenas || /\.pdf$/i;
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'pt', { numeric: true }))) {
    if (e.isFile() && filtro.test(e.name) && !/laranja/i.test(e.name) === !(obra.paginas === 'sem-laranja')) arquivos.push(path.join(dir, e.name));
    else if (e.isFile() && filtro.test(e.name) && obra.paginas === 'sem-laranja') arquivos.push(path.join(dir, e.name));
  }
  const destino = path.join(OUT, obra.disciplina, obra.slug);
  await rm(destino, { recursive: true, force: true });
  await mkdir(destino, { recursive: true });

  const relatorio = { slug: obra.slug, paginas: [], descartadas: [], autoCobertas: [] };
  let numero = 0;
  for (const arquivo of arquivos) {
    const doc = await openPdf(arquivo);
    for (let p = 0; p < doc.countPages(); p++) {
      const bounds = doc.loadPage(p).getBounds();
      const W = bounds[2] - bounds[0]; const H = bounds[3] - bounds[1];
      const retrato = H > W;
      const { png, scale, width, height } = renderPage(doc, p, retrato ? LARGURA_RETRATO : LARGURA_PAISAGEM);

      if (obra.paginas === 'sem-laranja' && (await fracaoLaranja(png)) > 0.0008) {
        relatorio.descartadas.push(`${path.basename(arquivo)}#${p + 1}`);
        continue;
      }

      const linhas = pageLines(doc, p);
      let regioes = obra.redacao;
      const auto = obra.carimboAuto === false || retrato ? null : carimboAuto(linhas, W, H);
      if (auto) {
        // o carimbo detectado na página só pode aumentar a área coberta
        regioes = regioes.map(([x0, y0, x1, y1]) => (x1 === 1 && y1 === 1 ? [Math.min(x0, auto[0]), Math.min(y0, auto[1]), 1, 1] : [x0, y0, x1, y1]));
      }
      const caixas = regioes.map(([x0, y0, x1, y1]) => [x0, y0, x1, y1, true]);
      for (const l of linhas) {
        if (sensivel(l.text) && !dentro(l, regioes, W, H)) {
          const m = 4 / scale;
          caixas.push([Math.max(0, (l.x - m) / W), Math.max(0, (l.y - m) / H), Math.min(1, (l.x + l.w + m) / W), Math.min(1, (l.y + l.h + m) / H), false]);
          relatorio.autoCobertas.push(`${path.basename(arquivo)}#${p + 1}: ${l.text.trim().slice(0, 60)}`);
        }
      }

      numero++;
      const nome = String(numero).padStart(2, '0');
      await sharp(png).composite([{ input: sobreposicao(width, height, caixas) }])
        .webp({ quality: 78, effort: 5 }).toFile(path.join(destino, `${nome}.webp`));
      relatorio.paginas.push({ arquivo: `${nome}.webp`, origem: path.basename(arquivo), pagina: p + 1, largura: width, altura: height });
    }
  }
  await mkdir(RELATORIOS, { recursive: true });
  await writeFile(relatorioDe(obra.disciplina, obra.slug), JSON.stringify(relatorio, null, 2));
  console.log(`${obra.slug}: ${relatorio.paginas.length} páginas, ${relatorio.descartadas.length} descartadas, ${relatorio.autoCobertas.length} textos cobertos`);
}

const filtroSlug = process.argv.slice(2);
for (const obra of OBRAS) {
  if (filtroSlug.length && !filtroSlug.includes(obra.slug)) continue;
  await processarObra(obra);
}
