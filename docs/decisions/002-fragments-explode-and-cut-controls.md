# ADR-002: Explosão e cortes globais no visualizador Fragments

## Status

Aceito

## Data

2026-09-21

## Contexto

Na migração da Fase 11, os controles de fundo já usavam a cena Fragments, mas os botões de explosão e cortes ainda mostravam uma mensagem de recurso não implementado. O visualizador precisa manter os painéis existentes e oferecer os mesmos recursos ao abrir IFCs locais ou modelos otimizados.

## Decisão

Aplicar explosão somente nas raízes dos modelos federados: cada raiz guarda sua posição e centro originais e recebe um deslocamento radial reversível. Após a pausa no controle, o BVH de caminhada é reconstruído para coincidir com a posição visual.

Aplicar cortes como seis planos globais no `SimpleRenderer` de That Open, delimitados pelos controles X, Y e Z do painel existente. Os planos atuam sobre a geometria Fragments renderizada, em vez de alterar buffers ou criar cópias da malha.

## Alternativas consideradas

### Alterar vértices dos Fragments

Rejeitada: quebraria a reutilização de instâncias, exigiria recomputar a geometria e dificultaria desfazer a explosão.

### Caixa de corte simulada no painel

Rejeitada: manteria um controle visual sem efeito real no modelo.

## Consequências

- Explodir preserva a transformação original e é reversível ao voltar para 0 m.
- A caminhada só volta a usar colisão depois da reconstrução curta do BVH.
- Cortes atingem todos os modelos visíveis, incluindo IFCs locais e modelos publicados.
