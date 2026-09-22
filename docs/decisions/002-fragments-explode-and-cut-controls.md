# ADR-002: Explosão e cortes globais no visualizador Fragments

## Status

Aceito

## Data

2026-09-21

## Contexto

Na migração da Fase 11, os controles de fundo já usavam a cena Fragments, mas os botões de explosão e cortes ainda mostravam uma mensagem de recurso não implementado. O visualizador precisa manter os painéis existentes e oferecer os mesmos recursos ao abrir IFCs locais ou modelos otimizados.

## Decisão

Aplicar explosão por elemento IFC. Para cada modelo, o visualizador consulta os IDs que possuem geometria, recupera a `MeshData` original de cada item e sua definição de material pelo worker Fragments. Durante a explosão, uma vista temporária posiciona cada elemento radialmente a partir do centro do conjunto; em `0,0 m`, ela é ocultada e os Fragments originais voltam a ser exibidos sem alterar o IFC.

Aplicar cortes como seis planos globais no `SimpleRenderer` de That Open, delimitados pelos controles X, Y e Z do painel existente. Os planos atuam sobre a geometria Fragments renderizada, em vez de alterar buffers ou criar cópias da malha.

## Alternativas consideradas

### Deslocar somente raízes de disciplina

Rejeitada: separa arquitetura, estrutura e instalações, mas não revela como lajes, paredes, portas, pilares e equipamentos se relacionam — não atende à expectativa de uma vista explodida BIM.

### Alterar vértices dos Fragments

Rejeitada: quebraria a reutilização de instâncias, exigiria recomputar a geometria e dificultaria desfazer a explosão.

### Caixa de corte simulada no painel

Rejeitada: manteria um controle visual sem efeito real no modelo.

## Consequências

- Explodir preserva o modelo original e é reversível ao voltar para 0 m.
- A vista temporária preserva cor, opacidade e transparência de cada elemento IFC; não reutiliza o material interno de LOD de uma disciplina.
- Seleção e caminhada ficam indisponíveis enquanto os elementos temporários estão separados; ambas retornam ao restaurar o modelo Fragments original.
- Cortes atingem todos os modelos visíveis, incluindo IFCs locais e modelos publicados.
- A matriz de regressão foi aprovada pelo usuário em 2026-09-21. O motor padrão continua disponível somente como fallback explícito, até uma futura fase dedicada à sua retirada.
