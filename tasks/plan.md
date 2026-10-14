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
