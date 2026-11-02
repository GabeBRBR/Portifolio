/** Folha de contato só do canto inferior direito de cada página (onde ficam os carimbos). */
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const [, , raiz, saida, filtro = ''] = process.argv;
await mkdir(saida, { recursive: true });
for (const disc of await readdir(raiz)) for (const obra of await readdir(path.join(raiz, disc)).catch(() => [])) {
  if (filtro && !obra.includes(filtro)) continue;
  const dir = path.join(raiz, disc, obra);
  const fs = (await readdir(dir)).filter((f) => /^\d+\.webp$/.test(f)).sort();
  const cel = [];
  for (const f of fs) {
    const m = await sharp(path.join(dir, f)).metadata();
    const l = Math.round(m.width * 0.5); const t = Math.round(m.height * 0.5);
    cel.push(await sharp(path.join(dir, f)).extract({ left: m.width - l, top: m.height - t, width: l, height: t }).resize({ width: 520, height: 400, fit: 'contain', background: '#fff' }).png().toBuffer());
  }
  const COLS = 3; const rows = Math.ceil(cel.length / COLS);
  await sharp({ create: { width: COLS * 526, height: rows * 406, channels: 3, background: '#cfd4da' } })
    .composite(cel.map((b, i) => ({ input: b, left: (i % COLS) * 526, top: Math.floor(i / COLS) * 406 }))).jpeg({ quality: 72 })
    .toFile(path.join(saida, `${disc}__${obra}.jpg`));
}
