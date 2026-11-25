# Portfólio Gabriel Biagini

Site estático (Vite) publicado no GitHub Pages. Vitrine de projetos com pranchas anonimizadas e modelos 3D simples.

## Requisitos

- Node.js 22
- pnpm 11 (o mesmo do workflow de publicação)

## Comandos

```bash
pnpm install              # dependências
pnpm dev                  # servidor local em http://localhost:5173
pnpm build                # gera dist/ (Vite + cópia de assets)
pnpm preview              # serve o dist/ gerado
npm run build:css         # regenera o tailwind.css (rode depois de mudar classes Tailwind ou a paleta)
```

## Estilos e imagens do portfólio

- **CSS:** `style.css` guarda os componentes do portfólio e `tailwind.css` os utilitários do Tailwind. O `tailwind.css` é gerado (não edite à mão) por `npm run build:css`, que lê `tailwind.config.cjs` e as classes usadas em `index.html`, `script.js` e `src/`. Sempre que usar uma classe Tailwind nova, rode o comando e faça commit do arquivo gerado.
- **Vitrine de projetos:** os cards e o modal são gerados em `script.js` a partir de `assets/vitrine/projetos.json` (obras agrupadas por disciplina). Cada obra tem pranchas em `assets/vitrine/<disciplina>/<obra>/NN.webp`, uma `capa.webp` e, quando há IFC, um modelo 3D simples em `assets/vitrine/modelos/<obra>.frag` (`src/vitrine/MiniViewer.js`: só gira e dá zoom, carregado quando a pessoa abre a aba "Modelo 3D").

## Pipeline da vitrine (`scripts/vitrine/`)

Os PDFs e IFCs originais **não entram no repositório**: ficam numa pasta local (`PORTIFOLIO_FONTE`, padrão `Desktop/NOVAS MIDiAS PORTIFOLIO`) e só as saídas anonimizadas são versionadas.

```bash
node scripts/vitrine/render-sheets.mjs        # PDFs -> WebP, cobre carimbos e textos sensíveis
node scripts/vitrine/processar-imagens.mjs    # JPG/PNG já exportados -> WebP anonimizado
node scripts/vitrine/convert-modelos.mjs      # IFC -> .frag (só geometria, nomes removidos)
node scripts/vitrine/build-manifest.mjs       # capas + assets/vitrine/projetos.json
node scripts/vitrine/verificar-texto.mjs      # texto que sobrou fora das áreas cobertas
node scripts/vitrine/extrair-plugins.mjs      # ícones e nomes dos botões pyRevit -> assets/plugins
```

- `obras.mjs` é o catálogo: tipo de obra (sem nome de cliente), retângulos de redação por obra, lista `BLOQUEIO` de termos proibidos, metragens aproximadas (`AREAS`) e IFCs (`MODELOS`).
- Depois de rodar, confira as imagens: `folha-contato.mjs` e `folha-cantos.mjs` montam folhas de revisão. Nada deve ser publicado sem essa leitura.
- Os relatórios (`scripts/vitrine/relatorios/`) citam os nomes dos arquivos de origem e por isso ficam fora do git e do site.
- Para uma obra nova, acrescente-a em `obras.mjs`, rode os scripts e revise as imagens.

## Publicação

Todo push na `main` dispara `.github/workflows/deploy-pages.yml`: instala com `pnpm install --frozen-lockfile`, gera o build e publica `dist/` no GitHub Pages. Em *Settings → Pages*, a origem deve ser **GitHub Actions**.
