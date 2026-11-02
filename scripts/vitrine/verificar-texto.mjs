/**
 * Confere o texto vetorial que SOBRA fora das áreas cobertas, procurando indícios de
 * dados pessoais ou de cliente que a lista de BLOQUEIO não pega (engenheiros, sites, e-mails...).
 *   node scripts/vitrine/verificar-texto.mjs
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { OBRAS } from './obras.mjs';
import { SRC, openPdf, pageLines } from './lib.mjs';

const INDICIOS = /\beng\b|eng[°º.]|\barq\b|arquiteto|engenheir|\bcau\b|\bcrea\b|www\.|https?:|\.com\b|@|\btel\b|fone|\bcep\b|\bcnpj\b|\bcpf\b|respons[aá]vel|desenhista|coordenador|supervisor|empresa|ltda|\bs\/a\b/i;
const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const dentro = (l, r, W, H) => {
  const cx = (l.x + l.w / 2) / W; const cy = (l.y + l.h / 2) / H;
  return r.some(([x0, y0, x1, y1]) => cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1);
};

for (const obra of OBRAS) {
  const dir = path.join(SRC, obra.fonte);
  const achados = [];
  for (const e of (await readdir(dir)).sort()) {
    if (!/\.pdf$/i.test(e) || /laranja/i.test(e) && obra.paginas !== 'sem-laranja') continue;
    const doc = await openPdf(path.join(dir, e));
    for (let p = 0; p < doc.countPages(); p++) {
      const b = doc.loadPage(p).getBounds(); const W = b[2] - b[0]; const H = b[3] - b[1];
      const linhas = pageLines(doc, p);
      let regioes = obra.redacao;
      // mesma lógica do carimbo detectado: aproximada pela âncora mais à esquerda no canto inferior direito
      const anc = linhas.filter((l) => l.x / W > 0.55 && l.y / H > 0.5 && /^(desenvolvimento|investidores|construcao|rev\.?|disciplina|conteudo|registro|folha|prancha)/i.test(norm(l.text.trim())));
      if (anc.length >= 4 && H < W && obra.carimboAuto !== false) {
        const x = Math.min(...anc.map((l) => l.x)) / W - 0.008; const y = Math.min(...anc.map((l) => l.y)) / H - 0.07;
        regioes = regioes.map(([x0, y0, x1, y1]) => (x1 === 1 && y1 === 1 ? [Math.min(x0, x), Math.min(y0, y), 1, 1] : [x0, y0, x1, y1]));
      }
      for (const l of linhas) if (INDICIOS.test(norm(l.text)) && !dentro(l, regioes, W, H)) achados.push(`${e}#${p + 1}: ${l.text.trim().slice(0, 90)}`);
    }
  }
  if (achados.length) console.log(`\n== ${obra.slug}\n  ` + [...new Set(achados)].slice(0, 14).join('\n  '));
}
console.log('\nverificação concluída');
