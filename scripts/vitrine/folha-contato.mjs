/** Monta folhas de contato (miniaturas lado a lado) para revisar visualmente cada obra. */
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [, , raiz, saida, larguraArg = '420', colunasArg = '4'] = process.argv;
const L = Number(larguraArg); const COLS = Number(colunasArg);
await mkdir(saida, { recursive: true });
for (const disc of await readdir(raiz)) {
  for (const obra of await readdir(path.join(raiz, disc)).catch(() => [])) {
    const dir = path.join(raiz, disc, obra);
    const arquivos = (await readdir(dir)).filter((f) => /^\d+\.webp$/.test(f)).sort();
    if (!arquivos.length) continue;
    const celulas = [];
    for (const f of arquivos) {
      const img = await sharp(path.join(dir, f)).resize({ width: L }).png().toBuffer({ resolveWithObject: true });
      celulas.push({ buf: img.data, h: img.info.height, nome: f });
    }
    const linhaAltura = [];
    for (let i = 0; i < celulas.length; i += COLS) linhaAltura.push(Math.max(...celulas.slice(i, i + COLS).map((c) => c.h)) + 6);
    const total = linhaAltura.reduce((a, b) => a + b, 0);
    const comps = []; let y = 0;
    celulas.forEach((c, i) => {
      if (i % COLS === 0 && i) y += linhaAltura[i / COLS - 1];
      comps.push({ input: c.buf, left: (i % COLS) * (L + 6), top: y });
    });
    await sharp({ create: { width: COLS * (L + 6), height: total, channels: 3, background: '#cfd4da' } })
      .composite(comps).jpeg({ quality: 70 }).toFile(path.join(saida, `${disc}__${obra}.jpg`));
  }
}
