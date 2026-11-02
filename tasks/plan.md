# Plano de Implementação Fase 13: Visualizador como dashboard BIM

## Visão geral

Transformar o visualizador em uma ferramenta de consulta para clientes, que também sirva de vitrine no portfólio. Para cada elemento: área, volume, pavimento, tipo, materiais e sistema. Para o projeto: navegação por pavimento, disciplina, categoria e sistema; quantitativos exportáveis; e uma visão geral com indicadores e qualidade dos dados.

A fase começa concluindo a retirada do legado da Fase 12 (T12.4) e a documentação operacional (T12.5).

## Decisões de arquitetura

- **Índice BIM pré-calculado** (ADR-003): `*.bim.json` por modelo, gerado na conversão e, para IFCs locais, num worker com cache em IndexedDB. A associação aos Fragments é feita por GlobalId.
- **Quantidades**: as do IFC têm prioridade; na falta delas, medição geométrica com a origem sempre indicada.
- **Interface tipo aplicativo** com três abas (Modelo, Quantitativos, Visão geral) sobre um único motor 3D (`ViewerEngine`), que nunca é recriado ao trocar de aba.
- **Seleção única**: clique no 3D, navegador, tabela e gráficos usam o mesmo caminho (`Highlighter` → `onSelectionChange`).
- **Cores, raio-X e planta** usam estilos do `Highlighter` com prioridade: seleção > raio-X > planta > cores por parâmetro.
- **Sem novas dependências**: exportação XLSX/CSV própria, gráficos em HTML/CSS.

## Iterações

### 13.0 Base

- [x] T12.4: remover motor legado, `hero-3d.js` e `ifc-viewer.js` da raiz, `assets/js/`, `src/viewer/performance/` e o Three r128 do CDN.
- [x] Carregar `script.js` como módulo (remove o aviso do Vite e a cópia manual no build).
- [x] Renomear `FragmentsPilot` para `ViewerEngine` e tirar dele a renderização de painéis.
- [x] Corrigir caixa de corte e enquadramento: usar `model.box` dos Fragments em vez de `Box3.setFromObject` (inválido em BatchedMesh).

### 13.1 Índice BIM

- [x] `buildBimIndex`: pavimento (contenção + agregação), tipo, materiais (camadas, perfis, constituintes), sistemas, Psets-chave, Qto e unidades.
- [x] Métricas geométricas com eliminação de sólidos duplicados e descarte de volumes inválidos.
- [x] Conversor gera `.bim.json` com hash no manifesto (saída determinística).
- [x] Worker e cache para IFCs locais.

### 13.2 Ficha do elemento

- [x] Faixa de quantidades por tipo de elemento, com origem (IFC ou medido).
- [x] Pavimento com cota, tipo e família, materiais, sistema, função (estrutural, externo), classe, marca, GlobalId.
- [x] Ações: enquadrar, isolar, ocultar, selecionar mesmo tipo, copiar GlobalId.
- [x] Psets completos sob demanda com filtro.
- [x] Seleção múltipla (Ctrl + clique) com totais, composição e exportação.

### 13.3 Navegador do projeto

- [x] Abas Pavimentos, Disciplinas, Categorias (com tipos) e Sistemas.
- [x] Busca por nome, tipo, material, pavimento ou GlobalId.
- [x] Selecionar, isolar e ocultar grupos; mostrar tudo.
- [x] Planta do pavimento: isolamento, corte a 1,2 m da cota, vista superior ortográfica e convenção de cores.
- [x] Disciplinas com visibilidade, "só esta" e remoção de IFC local.

### 13.4 Quantitativos

- [x] Agrupamento em dois níveis (categoria, tipo, pavimento, material, disciplina, sistema, diâmetro).
- [x] Filtros por disciplina, pavimento e texto.
- [x] Linha da tabela seleciona e enquadra no 3D ao lado.
- [x] Exportação Excel (Resumo + Elementos) e CSV pt-BR.

### 13.5 Visão geral

- [x] Indicadores: elementos, concreto, paredes, tubulações, ambientes.
- [x] Gráficos por disciplina, pavimento, tipo de parede e diâmetro.
- [x] Tabela de ambientes.
- [x] Qualidade dos dados: pavimento, tipo, material, classificação e origem das quantidades.

### 13.6 Ferramentas

- [x] Colorir por parâmetro com legenda clicável (oito cores validadas e "Outros").
- [x] Raio-X.
- [x] Medição de distância e de área.
- [x] Vistas salvas por projeto.
- [x] Layout responsivo com gavetas no celular.

## Verificação

- Testes automatizados em Chromium (headless) sobre um build esbuild equivalente, nos dois exemplos:
  - seleção no 3D;
  - navegador e busca;
  - cores e raio-X;
  - planta;
  - quantitativos e XLSX validado com openpyxl;
  - visão geral;
  - medição;
  - vistas;
  - celular;
  - importação local com reabertura pelo cache.
- O build oficial com Vite roda no GitHub Actions ou localmente (`pnpm build`).

## Próximos passos possíveis

- Reexportar os IFCs com quantidades base e reconverter.
- Link compartilhável de seleção ou vista.
- Seções verticais e cotas automáticas na planta.
- Checagem IDS (requisitos de informação) na aba Visão geral.

---

# Fase 14: Visualizador com experiência de Autodesk Viewer

## Visão geral

Aproximar o visualizador do padrão de uso do Autodesk Viewer: cubo de navegação, barra de navegação compacta, árvore de modelo e propriedades fixas nas laterais, menu de contexto, destaque ao passar o mouse e caixa de corte com alças. O foco é o hábito de uso, não a cópia visual: a identidade do portfólio (paleta ocre, tipografia e ícones Phosphor) continua. O Autodesk Viewer é proprietário, então nenhum ícone, texto ou layout dele é copiado literalmente.

Escopo fora desta fase: anotações e markups, multimodelos com alinhamento automático e compartilhamento de vista (já em "próximos passos" da Fase 13).

## Estado de partida

- Comandos existentes: Enquadrar tudo, Órbita, Caminhar, Caixa de corte, Medição, Coordenadas, Vistas salvas, Tela cheia, Raio-X, Vista explodida, Colorir por parâmetro.
- Painéis flutuantes em `BimApp.js` (`FLOAT_PANELS`), navegador numa aba, ficha do elemento numa aba.
- Não existe cubo de navegação nem menu de contexto.
- `ViewerEngine.js` com 2318 linhas concentra colisão, explosão, corte, cores e planta.

## Decisões de arquitetura

- **Refatorar antes de criar.** Os recursos novos (destaque no hover, menu de contexto, alças) mexem em seleção e câmera. Extrair antes evita que o `ViewerEngine.js` cresça mais.
- **Painéis laterais reaproveitam `ProjectNavigator` e `ElementSheet`.** Não criar componentes paralelos: os mesmos módulos viram painel fixo, e a aba correspondente deixa de existir ou vira atalho.
- **Cubo de navegação próprio**, desenhado com uma segunda câmera e um pequeno renderizador sobre a mesma cena. Sem dependência nova. Ele só lê a orientação da câmera principal (`CameraControls`).
- **Seleção continua única** (`Highlighter` → `onSelectionChange`). O destaque ao passar o mouse usa outro estilo do `Highlighter`, com prioridade abaixo da seleção.
- **Layout guardado em `localStorage`** (quais painéis estão abertos e recolhidos). É preferência de visitante, não estado compartilhado.
- **Nada de dependências novas** sem pedir antes.

## Iterações

### 14.0 Base e referência

- [x] Validar o visualizador publicado no GitHub Pages (pendência da Fase 13). Abre sem erros no console.
- [x] Capturar capturas de tela de referência (desktop e celular) para comparar antes e depois. Desktop 1440×900 feita; celular fica para 14.6.
- [x] Registrar o desempenho atual com o painel de benchmark (primeira abertura e quadros por segundo). Casa Térrea local: 3134 ms até usável, 15 fps em GPU de software (só comparável em relação ao antes e depois).

### 14.1 Refatoração do motor (sem mudança de comportamento)

- [x] Extrair de `ViewerEngine.js` para módulos próprios via mixin: `walk.js`, `collision.js`, `explodedView.js` e `clipBox.js`. A apresentação (cores, raio-X, planta) ficou para uma etapa posterior, porque mexe em pontos da seleção que o 14.4 também toca.
- [x] Funções puras de corte de polígono movidas para `src/viewer/geometry/polygonClip.js`, com 6 testes em `tests/polygonClip.test.mjs` (`npm test`, sem navegador).
- [x] Verificado: build (`vite build`) passa; explosão gera 88 peças e volta a 0; caixa de corte ajusta e reseta; caminhada posiciona no piso e sai para a órbita; sem erros novos no console. Limitação: o Pointer Lock não funciona na aba embutida, então o controle com mouse não foi testado.

### 14.2 Layout de aplicativo

- [x] Barra de navegação compacta (Órbita, Caminhar e Enquadrar) no canto superior direito do modelo. No celular os mesmos botões ficam na barra inferior.
- [x] Navegador à esquerda e propriedades à direita, recolhíveis pelos botões da barra superior. Em telas estreitas continuam como gavetas.
- [x] Preferência de painéis guardada em `localStorage` (com `try/catch`).
- [x] Layout móvel mantido e verificado em 375 px.
- Obs.: o painel de propriedades já tinha campo de busca nos Psets (Fase 13), então não foi duplicado.

### 14.3 Cubo de navegação

- [x] Faces, arestas e cantos clicáveis (`src/viewer/ViewCube.js`), com vistas ortogonais e isométricas.
- [x] Cubo acompanha a rotação da câmera principal (eixos do modelo fixos: Frente é a vista de +Z).
- [x] Botões de vista padrão passam por `setViewDirection`, o mesmo caminho do cubo.
- [x] Oculto no modo caminhada e no celular.
- Pendente: botão Início ao lado do cubo (hoje "Enquadrar" já cumpre esse papel).

### 14.4 Interação

- [x] Destaque ao passar o mouse com tinta própria (`src/viewer/hover.js`) e tooltip com nome, categoria, tipo e pavimento.
- [x] Menu de contexto com o clique direito: Propriedades, Isolar, Ocultar, Enquadrar, Copiar GlobalId, Enquadrar tudo e Mostrar tudo (`src/app/ContextMenu.js`).
- [x] Atalhos: F (enquadrar), I (isolar), H (ocultar), U (mostrar tudo), Esc (limpar seleção) e ? (lista de atalhos). Desligados no modo caminhada e ao digitar em campos.
- Obs.: Ctrl+Z para desfazer ocultação não foi feito; a ocultação se desfaz com U.

### 14.5 Caixa de corte com alças

- [x] Seis alças nas faces da caixa, coloridas por eixo, que acompanham a face na tela (`src/app/ClipHandles.js`). Arrastar move a face ao longo do eixo.
- [x] Setas do teclado movem a face em 10 cm (a alça é focável).
- [x] Os sliders continuam no painel e são atualizados junto.
- Obs.: os sliders não foram movidos para "Avançado" ainda; ficam como estão.

### 14.6 Acessibilidade e polimento

- [x] Tab fica preso dentro do visualizador enquanto ele está aberto; setas esquerda e direita trocam de aba.
- [x] Barra de abas e botões do cubo, alças e menu têm nomes para leitor de tela.
- [x] Revisão do celular: a barra inferior mostra a navegação e os painéis viram gavetas.
- [ ] Remover comentários e código morto de versões anteriores: não feito nesta etapa.
- [ ] Revisão completa com leitor de tela: não feita.

## Verificação

- Testes de funções puras (14.1) em Node: `npm test` (6 testes, passando).
- Verificação visual em Chromium (headless, por esbuild como na Fase 13) com capturas antes e depois, nos dois exemplos e no celular.
- Por fase: seleção, navegador, quantitativos e medição não podem regredir (checklist da Fase 13 em "Verificação").
- Build oficial com `pnpm build` antes de cada entrega.
- Não há commits nem push sem pedido explícito.

## Pontos em aberto

- Cubo de navegação próprio (recomendado, sem dependência) ou biblioteca pronta?
- Mobile é prioridade ou fica para depois de 14.5?
- Atalhos: manter o padrão do Autodesk ou usar um conjunto próprio?
