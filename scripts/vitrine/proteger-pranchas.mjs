/**
 * Reduz o risco de cópia direta das pranchas da vitrine:
 *  1. mantém só as pranchas escolhidas em MANTER (projetos que não estão na lista ficam como estão);
 *  2. aplica marca d'água diagonal repetida em todas as pranchas que ficam;
 *  3. renumera os arquivos (01.webp, 02.webp...) e atualiza assets/vitrine/projetos.json.
 *
 *   node scripts/vitrine/proteger-pranchas.mjs          (simula e lista o que faria)
 *   node scripts/vitrine/proteger-pranchas.mjs --aplicar
 *
 * Rode UMA vez: a marca d'água é gravada na imagem e se repetiria numa segunda execução
 * (o script se recusa a rodar de novo se encontrar assets/vitrine/.protegido).
 */
import { readFile, writeFile, rename, rm, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const VITRINE = path.join(ROOT, 'assets', 'vitrine');
const MARCA = path.join(VITRINE, '.protegido');
const JSON_PATH = path.join(VITRINE, 'projetos.json');
const TEXTO = 'AION BIM · PORTFÓLIO';
const aplicar = process.argv.includes('--aplicar');

/** slug -> números (1-based) das pranchas que ficam. */
const MANTER = {
  'sobrado-fundacao-estacas': [1, 3, 4, 9],
  'sobrado-concreto-armado': [1, 2, 5, 9],
  'residencia-alto-padrao-piscina': [1, 2, 4, 18],
  'sobrado-popular': [1, 3, 6, 11],
  'edificio-comercial-asbuilt': [1, 3, 5, 7],
  'sobrado-hidrossanitario': [1, 3, 5],
  'edificacao-publica-hidrossanitario': [1, 3, 5],
  'edificacao-publica-ppci': [1, 3, 5],
  'empreendimento-funerario-terraplenagem': [1, 3, 5]
};

sharp.cache(false);
/** O OneDrive às vezes segura o arquivo por instantes (EBUSY): tenta de novo. */
async function tentar(fn, n = 8) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= n || !['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}
const existe = (p) => access(p).then(() => true, () => false);
if (aplicar && (await existe(MARCA))) throw new Error('Já protegido (assets/vitrine/.protegido existe). Restaure do git antes de rodar de novo.');

/** SVG do mesmo tamanho da prancha, com o texto repetido na diagonal e opacidade baixa. */
function marcaDagua(w, h) {
  const passo = Math.round(Math.max(w, h) / 4);
  const fonte = Math.round(passo / 14);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><pattern id="p" width="${passo}" height="${Math.round(passo / 2)}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
    <text x="0" y="${passo / 4}" font-family="Arial, Helvetica, sans-serif" font-size="${fonte}" font-weight="700"
      fill="#5b6470" fill-opacity="0.22" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1">${TEXTO}</text>
  </pattern></defs>
  <rect width="100%" height="100%" fill="url(#p)"/></svg>`);
}

const dados = JSON.parse(await readFile(JSON_PATH, 'utf8'));
let removidas = 0, marcadas = 0;

for (const p of dados.projetos) {
  const pasta = path.join(VITRINE, p.disciplina, p.id);
  const manter = MANTER[p.id];
  const total = p.imagens.length;
  const indices = manter ? manter.filter((n) => n <= total) : p.imagens.map((_, i) => i + 1);
  const saem = p.imagens.map((_, i) => i + 1).filter((n) => !indices.includes(n));
  console.log(`${p.disciplina}/${p.id}: ${total} -> ${indices.length} (sai: ${saem.join(', ') || '—'})`);
  if (!aplicar) continue;

  // 1. imagem final de cada prancha mantida, com marca d'água, em arquivo temporário
  const novas = [];
  for (const [k, n] of indices.entries()) {
    const img = p.imagens[n - 1];
    // Lê para memória: o sharp no Windows pode manter o arquivo aberto e travar a exclusão (EBUSY).
    const origem = await readFile(path.join(ROOT, img.src));
    const { width: w, height: h } = await sharp(origem).metadata();
    const nome = `${String(k + 1).padStart(2, '0')}.webp`;
    const tmp = path.join(pasta, `_novo_${nome}`);
    await sharp(origem).composite([{ input: marcaDagua(w, h) }]).webp({ quality: 80 }).toFile(tmp);
    novas.push({ tmp, nome, img });
    marcadas++;
  }
  // 2. apaga todas as pranchas antigas e põe as novas no lugar
  for (const im of p.imagens) await tentar(() => rm(path.join(ROOT, im.src), { force: true }));
  removidas += saem.length;
  for (const { tmp, nome } of novas) await tentar(() => rename(tmp, path.join(pasta, nome)));
  // 3. manifesto
  p.imagens = novas.map(({ nome, img }) => ({ ...img, src: `assets/vitrine/${p.disciplina}/${p.id}/${nome}` }));
  // Legendas genéricas ("Prancha N") seguem a nova numeração.
  if (p.imagens.every((i) => /^Prancha( \d+)?$/.test(i.caption))) p.imagens.forEach((i, k) => { i.caption = p.imagens.length > 1 ? `Prancha ${k + 1}` : 'Prancha'; });
  p.conteudo = [...new Set(p.imagens.map((i) => i.caption).filter((c) => !/^Prancha/.test(c)))].slice(0, 8);
}

if (aplicar) {
  await writeFile(JSON_PATH, JSON.stringify(dados, null, 1));
  await writeFile(MARCA, `Pranchas protegidas em ${new Date().toISOString()}\n`);
}
console.log(aplicar ? `Feito: ${marcadas} pranchas marcadas, ${removidas} removidas.` : 'Simulação. Use --aplicar para executar.');
