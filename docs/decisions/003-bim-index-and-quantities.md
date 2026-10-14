# ADR-003: Índice BIM pré-calculado e quantidades geométricas

## Status

Aceito

## Data

2026-10-12

## Contexto

O visualizador passa a ser uma ferramenta de consulta com clientes: ficha do elemento com área, volume e pavimento, navegador do projeto e quantitativos. Os IFCs de exemplo, exportados do Revit, não trazem `IfcElementQuantity`: nenhum dos sete arquivos tem área ou volume. Consultar relações (pavimento, tipo, material, sistema) elemento a elemento pelo worker dos Fragments a cada clique também não sustenta agrupamentos e somatórios de milhares de elementos.

## Decisão

Gerar um **índice BIM** por modelo com `buildBimIndex` (`src/bim/ifc-index-builder.js`), usando web-ifc:

- Na conversão (`pnpm run convert:fragments`), para os exemplos publicados: gera `*.bim.json` ao lado do `.frag`, com hash no manifesto.
- Num Web Worker, para IFCs abertos pelo usuário: o índice é gerado em paralelo à conversão da geometria e guardado no mesmo cache IndexedDB do Fragment.

O índice guarda, por elemento: GlobalId, classe, tipo, pavimento (com cota), materiais, sistemas, propriedades-chave, caixa envolvente e quantidades. O navegador associa cada elemento ao `localId` dos Fragments pelo **GlobalId** (`getLocalIdsByGuids`).

As quantidades vêm do IFC quando existem (Qto / propriedades de quantidade do Revit). Caso contrário, são medidas na malha (volume por divergência, área líquida de parede por volume ÷ espessura, face superior de lajes, retângulo mínimo em planta, Ø equivalente de tubos). A origem é sempre exibida (“IFC” ou “medido”) e exportada.

## Alternativas consideradas

### Consultar o worker dos Fragments sob demanda

Rejeitada para agrupamentos: exige uma ida ao worker por relação e não oferece quantidades quando o IFC não as tem.

### Exigir reexportação com BaseQuantities

Rejeitada como única fonte: o visualizador também recebe IFCs de terceiros que raramente trazem quantidades. A reexportação continua recomendada e tem prioridade quando existe.

### Calcular quantidades a partir da `MeshData` dos Fragments

Rejeitada: os Fragments otimizam e instanciam geometria. O web-ifc dá acesso à tessellation de origem com a mesma base de coordenadas do IFC, e o mesmo código serve ao conversor e ao navegador.

## Consequências

- A ficha, o navegador, os quantitativos e a visão geral respondem instantaneamente, sem consultas ao worker. Só os Psets completos de um elemento são lidos sob demanda.
- Cada IFC alterado precisa ser reconvertido para atualizar o `.bim.json`.
- Quantidades medidas dependem de malhas fechadas. Volumes inválidos (maiores que a caixa envolvente) são descartados, e representações duplicadas do mesmo sólido são contadas uma vez.
- Elementos duplicados entre disciplinas (por exemplo, vigas modeladas na arquitetura e na estrutura) somam nos totais federados. O filtro por disciplina dos quantitativos evita a dupla contagem.
- As caixas do índice usam as coordenadas do IFC, as mesmas do `getMergedBox` dos Fragments. Elas servem para enquadrar e para montar plantas, descartando elementos isolados e distantes.
