# ADR-001: Separar a colisão da caminhada dos Fragments renderizados

## Status

Aceito

## Data

2026-09-07

## Contexto

O modo de caminhada construía um `ObjectBVH` sobre todos os objetos Fragments visíveis. A geometria disponível muda com câmera, culling e LOD. Perto do modelo, mais triângulos e objetos eram materializados; iniciar ou atualizar a caminhada podia então bloquear a thread principal. Um raycast recursivo pela cena completa era usado como contingência do clique e agravava o problema.

A colisão do jogador precisa ser estável, pequena e independente da qualidade visual. Também deve manter pisos modelados como `IfcBuildingElementProxy`, preservar vãos de portas e ignorar `IfcSpace`, instalações, mobiliário e detalhes.

## Decisão

Gerar, durante `pnpm run convert:fragments`, um arquivo binário `.collider` para cada disciplina arquitetônica ou estrutural:

- pisos: lajes, escadas, lances, rampas, fundações, pavimentos, terreno e modelos genéricos;
- obstáculos: paredes, colunas, fachadas-cortina e coberturas;
- portas, espaços IFC, MEP, mobiliário e demais categorias não entram no colisor.

O arquivo contém posições e índices separados entre pisos e obstáculos. O navegador combina apenas os colliders das disciplinas visíveis e constrói um `MeshBVH` estático para cada grupo. Detecção de apoio consulta somente pisos; colisão lateral consulta somente obstáculos. O clique pode usar o seletor GPU dos Fragments para obter o ponto visual, mas nunca percorre recursivamente a geometria renderizada.

## Alternativas consideradas

### `ObjectBVH` da cena Fragments completa

- Vantagem: não exige artefato adicional.
- Rejeitada: custo e conteúdo variam com LOD/culling; causou travamentos próximos ao modelo e acoplou física à renderização.

### Caixas envolventes por elemento

- Vantagem: muito pequenas e rápidas.
- Rejeitada: fechariam vãos reais de portas, distorceriam rampas e escadas e criariam colisões invisíveis.

### Física sobre todos os triângulos IFC

- Vantagem: máxima fidelidade geométrica.
- Rejeitada: instalações e detalhes não melhoram a locomoção e aumentam memória, tempo de BVH e número de falsos bloqueios.

## Consequências

- O custo da caminhada deixa de crescer quando o LOD visual aumenta.
- Alternar visibilidade reconstrói BVHs pequenos; mover a câmera ou cair não reconstrói colisão.
- Os arquivos `.collider` precisam ser regenerados e publicados junto dos `.frag` quando um IFC muda.
- Elementos excluídos da física continuam visíveis e selecionáveis, mas não bloqueiam o jogador.
- Modelos genéricos arquitetônicos podem funcionar como piso, conforme necessário na Casa Térrea.
