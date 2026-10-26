# Portfólio Gabriel Biagini e visualizador BIM

Site estático (Vite) publicado no GitHub Pages. Além das seções do portfólio, inclui um visualizador BIM em tela cheia que abre modelos IFC no navegador, com ficha de dados de cada elemento, navegador do projeto, quantitativos exportáveis e visão geral do modelo.

## Requisitos

- Node.js 22
- pnpm 11 (o mesmo do workflow de publicação)

## Comandos

```bash
pnpm install              # dependências
pnpm dev                  # servidor local em http://localhost:5173
pnpm build                # gera dist/ (Vite + cópia de assets e do web-ifc.wasm)
pnpm preview              # serve o dist/ gerado
pnpm run convert:fragments  # reconverte os IFCs de exemplo (ver abaixo)
npm run build:css         # regenera o tailwind.css (rode depois de mudar classes Tailwind ou a paleta)
```

## Estilos e imagens do portfólio

- **CSS:** `style.css` guarda os componentes do portfólio e `tailwind.css` os utilitários do Tailwind. O `tailwind.css` é gerado (não edite à mão) por `npm run build:css`, que lê `tailwind.config.cjs` e as classes usadas em `index.html`, `script.js` e `src/`. Sempre que usar uma classe Tailwind nova, rode o comando e faça commit do arquivo gerado.
- **Imagens dos projetos:** cada prancha tem duas versões WebP em `assets/images/<disciplina>/`: `nome.webp` (completa, usada no modal) e `nome-sm.webp` (900 px, usada no card). Os JPGs originais continuam na pasta e podem ser apagados quando quiser.
- **Novo projeto:** copie um card `project-plate` do `index.html` (troque o `data-modal`) e acrescente a entrada correspondente em `projectDetails` no `script.js`, com a lista `images` (a galeria do modal usa essa lista, com legenda por imagem).

## Estrutura do visualizador

```text
src/
  ifc-viewer.js            ponto de entrada: expõe window.ifcViewer.openViewer() e carrega o app sob demanda
  app/
    BimApp.js              shell: abas, barra de ferramentas, painéis, importação, exportação
    ProjectNavigator.js    árvore por pavimento, disciplina, categoria/tipo e sistema; busca; isolar/ocultar; planta
    ElementSheet.js        ficha do elemento (quantidades, pavimento, tipo, materiais, Psets) e seleção múltipla
    TakeoffView.js         quantitativos agrupados, filtros e exportação Excel/CSV
    OverviewView.js        indicadores, gráficos e verificação de qualidade dos dados
  bim/
    ifc-index-builder.js   gera o índice BIM a partir do IFC (roda no Node e no worker)
    geometry-metrics.js    volume, áreas e dimensões medidos na geometria
    BimIndex.js            índice federado em memória: busca, agrupamentos e somatórios
    BimIndexService.js     baixa os índices publicados ou indexa IFCs locais no worker (com cache)
    index.worker.js        worker que indexa IFCs abertos pelo usuário
    export.js              CSV e XLSX sem dependências
    labels.js              rótulos em português, unidades e paletas
  viewer/
    ViewerEngine.js        motor 3D (That Open Fragments): seleção, visibilidade, raio-X, cores, planta,
                           cortes, explosão, medições, vistas, caminhada e importação de IFC
    storage/FragmentCache.js  cache IndexedDB de Fragments e índices de IFCs locais
  styles/bim-app.css       estilos do visualizador (isolados do portfólio)
```

## Dados BIM e quantidades

Cada modelo tem um **índice BIM** (`*.bim.json`) com, para cada elemento: classe IFC, tipo, pavimento e cota, materiais, sistemas, propriedades-chave e quantidades. As quantidades seguem esta prioridade:

1. **Quantidades do IFC** (`IfcElementQuantity` / BaseQuantities, ou propriedades de quantidade exportadas pelo Revit). Na ficha aparecem marcadas como “IFC”.
2. **Medição geométrica** do elemento quando o IFC não traz quantidades. Aparece como “medido”:
   - volume pelo teorema da divergência sobre a malha fechada;
   - área líquida de paredes = volume ÷ espessura (vãos já descontados);
   - área de lajes = face superior;
   - comprimento, largura e altura pelo menor retângulo envolvente em planta;
   - Ø equivalente de tubos = diâmetro do cilindro de mesmo volume e comprimento.

Para usar os valores oficiais do Revit, exporte o IFC com **“Exportar quantidades base”** (e, se quiser, “Exportar conjuntos de propriedades do Revit”) marcados e rode a conversão de novo.

## Atualizar os modelos de exemplo

1. Substitua os IFCs em `assets/IFC/…` (a lista fica em `scripts/convert-ifc-to-fragments.mjs`).
2. Rode `pnpm run convert:fragments`. Para cada modelo são gerados, em `assets/fragments/<obra>/`:
   - `.frag` (geometria otimizada);
   - `.collider` (colisão da caminhada, só arquitetura e estrutura);
   - `.bim.json` (índice BIM).
3. O `assets/fragments/models.json` recebe os hashes usados para invalidar o cache do navegador.
4. Faça commit dos arquivos gerados junto com o IFC.

IFCs abertos pelo botão **Abrir IFC** são convertidos e indexados no próprio navegador. Nada é enviado a servidor; o resultado fica em cache (IndexedDB) para reabrir rápido.

## Publicação

Todo push na `main` dispara `.github/workflows/deploy-pages.yml`: instala com `pnpm install --frozen-lockfile`, gera o build e publica `dist/` no GitHub Pages. Em *Settings → Pages*, a origem deve ser **GitHub Actions**.

## Decisões de arquitetura

Ver `docs/decisions/`:

- 001: colisão da caminhada independente dos Fragments.
- 002: explosão e cortes.
- 003: índice BIM e quantitativos.
