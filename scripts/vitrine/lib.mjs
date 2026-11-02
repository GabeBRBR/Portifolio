import * as mupdf from 'mupdf';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
/** Relatórios guardam nomes de arquivos de origem; por isso ficam fora de assets/ e do git. */
export const RELATORIOS = path.join(AQUI, 'relatorios');
export const relatorioDe = (disciplina, slug) => path.join(RELATORIOS, disciplina + '__' + slug + '.json');

export const SRC = process.env.PORTIFOLIO_FONTE || 'C:/Users/Gabriel/Desktop/NOVAS MIDiAS PORTIFOLIO';

export async function* walk(dir, ext) {
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'pt'))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, ext);
    else if (e.name.toLowerCase().endsWith(ext)) yield p;
  }
}

export async function openPdf(file) {
  return mupdf.Document.openDocument(await readFile(file), 'application/pdf');
}

/** Renders a page to a PNG buffer with the given pixel width. Returns {png, scale, width, height}. */
export function renderPage(doc, index, width) {
  const page = doc.loadPage(index);
  const [x0, y0, x1, y1] = page.getBounds();
  const scale = width / (x1 - x0);
  const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
  return { png: pix.asPNG(), scale, width: pix.getWidth(), height: pix.getHeight() };
}

/** Text lines of a page with their bounding boxes in PDF points. */
export function pageLines(doc, index) {
  const page = doc.loadPage(index);
  const json = JSON.parse(page.toStructuredText('preserve-whitespace').asJSON());
  const lines = [];
  for (const block of json.blocks || []) {
    for (const line of block.lines || []) {
      const b = line.bbox;
      lines.push({ text: line.text, x: b.x, y: b.y, w: b.w, h: b.h });
    }
  }
  return lines;
}
