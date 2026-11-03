/**
 * Lê a extensão pyRevit e publica os ícones e nomes dos botões na aba "Plugins Revit".
 *   node scripts/vitrine/extrair-plugins.mjs
 *
 * Origem: PYREVIT_EXTENSAO (padrão: %APPDATA%\pyRevit\Extensions\MinhasExtensoes.extension).
 * Saída: assets/plugins/<aba>/<botao>.png e assets/plugins/plugins.json.
 * Só nome, descrição curta e ícone saem da extensão; nenhum código é copiado.
 */
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOQUEIO } from './obras.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXTENSAO = process.env.PYREVIT_EXTENSAO
  || path.join(process.env.APPDATA || '', 'pyRevit', 'Extensions', 'MinhasExtensoes.extension');
const SAIDA = path.join(ROOT, 'assets', 'plugins');

/** Abas da extensão, na ordem de exibição, com o texto de apresentação. */
const ABAS = [
  { pasta: 'Extensões.tab', id: 'geral', nome: 'Documentação e dados', resumo: 'Parâmetros, tabelas, quantitativos, cotas, tags, vistas e pranchas em lote.' },
  { pasta: 'HID-SAN.tab', id: 'hidrossanitario', nome: 'Hidrossanitário', resumo: 'Dimensionamento, conexão, cotagem e verificação de redes hidráulicas e sanitárias.' },
  { pasta: 'PPCI.tab', id: 'ppci', nome: 'PPCI', resumo: 'Hidrantes, sprinklers, iluminação de emergência e relatórios de proteção contra incêndio.' }
];
/** Botões de apoio que não fazem parte da vitrine. */
const IGNORAR = new Set(['Configurações', 'Suporte']);

const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const limpar = (t) => t.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();

/** Valor pt_br de uma chave (title/tooltip) do bundle.yaml, sem depender de biblioteca de YAML. */
function lerChave(texto, chave) {
  const linhas = texto.replace(/\r/g, '').split('\n');
  const i = linhas.findIndex((l) => l.startsWith(`${chave}:`));
  if (i < 0) return '';
  const resto = linhas[i].slice(chave.length + 1).trim();
  const bloco = [];
  for (let j = i + 1; j < linhas.length && (linhas[j] === '' || /^\s/.test(linhas[j])); j++) bloco.push(linhas[j]);
  let valor = '';
  if (resto && !/^[|>]/.test(resto)) valor = resto;
  else {
    const k = bloco.findIndex((l) => /^\s+pt_br:/.test(l));
    if (k >= 0) {
      const inline = bloco[k].replace(/^\s+pt_br:\s*/, '');
      const indent = bloco[k].match(/^\s*/)[0].length;
      const filhas = [];
      for (let m = k + 1; m < bloco.length && (bloco[m] === '' || bloco[m].match(/^\s*/)[0].length > indent); m++) filhas.push(bloco[m].trim());
      valor = /^[|>]/.test(inline) || !inline ? filhas.join(' ') : inline;
    }
  }
  return limpar(valor.replace(/^["']|["']$/g, ''));
}

/** Primeira frase; se for curta demais para explicar a ferramenta, junta a segunda. */
const primeiraFrase = (t, max = 170) => {
  const frases = (t.match(/.+?[.!?](?=\s|$)/g) || [t]).map((f) => f.trim());
  let frase = frases[0] || '';
  if (frase.length < 70 && frases[1]) frase = `${frase} ${frases[1]}`;
  return frase.length > max ? `${frase.slice(0, max - 1).trimEnd()}…` : frase;
};

/** Texto de `__doc__ = (u"..." u"...")` do script, para botões sem tooltip no bundle.yaml. */
function lerDoc(script) {
  const m = script.match(/__doc__\s*=\s*\(?((?:\s*u?(?:"[^"]*"|'[^']*'))+)/);
  return m ? limpar([...m[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((x) => x[1] ?? x[2]).join('')) : '';
}
const slug = (t) => normalizar(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function ler(dir, nomePasta) {
  const yaml = await readFile(path.join(dir, 'bundle.yaml'), 'utf8').catch(() => '');
  const titulo = lerChave(yaml, 'title') || nomePasta.replace(/\.(pushbutton|pulldown|splitpushbutton)$/, '');
  let texto = lerChave(yaml, 'tooltip');
  if (!texto) texto = lerDoc(await readFile(path.join(dir, 'script.py'), 'utf8').catch(() => ''));
  const descricao = primeiraFrase(texto);
  const arquivos = await readdir(dir);
  // A vitrine é escura: usa a versão para tema escuro do ícone quando existe.
  const icone = ['icon.dark.png', 'icon.png'].find((f) => arquivos.includes(f));
  return { titulo, descricao, icone: icone && path.join(dir, icone) };
}

async function* botoes(dir) {
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'pt'))) {
    if (!e.isDirectory() || /backup/i.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (/\.panel$/.test(e.name)) yield* botoes(p);
    else if (/\.(pushbutton|pulldown|splitpushbutton)$/.test(e.name)) yield [p, e.name];
  }
}

await rm(SAIDA, { recursive: true, force: true });
const abas = [];
const termosProibidos = [];
for (const aba of ABAS) {
  const pasta = path.join(EXTENSAO, aba.pasta);
  const ferramentas = [];
  await mkdir(path.join(SAIDA, aba.id), { recursive: true });
  for await (const [dir, nome] of botoes(pasta)) {
    const base = nome.replace(/\.(pushbutton|pulldown|splitpushbutton)$/, '');
    if (IGNORAR.has(base)) continue;
    const info = await ler(dir, nome);
    if (!info.icone) continue;
    // Menus com subitens: o botão da faixa é o menu; os subitens entram na descrição.
    let descricao = info.descricao;
    if (/\.(pulldown|splitpushbutton)$/.test(nome)) {
      const filhos = [];
      for await (const [d, n] of botoes(dir)) filhos.push((await ler(d, n)).titulo);
      if (filhos.length) descricao = `Inclui: ${filhos.join(', ')}.`;
    }
    const arquivo = `${slug(base)}.png`;
    await copyFile(info.icone, path.join(SAIDA, aba.id, arquivo));
    const ferramenta = { nome: info.titulo, descricao, icone: `assets/plugins/${aba.id}/${arquivo}` };
    for (const t of [ferramenta.nome, ferramenta.descricao]) if (BLOQUEIO.some((re) => re.test(normalizar(t)))) termosProibidos.push(`${nome}: ${t}`);
    ferramentas.push(ferramenta);
  }
  abas.push({ id: aba.id, nome: aba.nome, resumo: aba.resumo, ferramentas });
}
await writeFile(path.join(SAIDA, 'plugins.json'), JSON.stringify({ abas }, null, 1));
console.log(abas.map((a) => `${a.nome}: ${a.ferramentas.length}`).join(' | '));
if (termosProibidos.length) console.warn('Revisar (termos de BLOQUEIO):\n  ' + termosProibidos.join('\n  '));
