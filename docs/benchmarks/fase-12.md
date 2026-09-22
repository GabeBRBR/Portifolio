# Benchmarks da Fase 12

## Metodo

Cada instantaneo e copiado pelo icone de desempenho do visualizador publicado, sem usar parametro de depuracao. A comparacao entre motores so e valida quando modelo, computador, navegador e perfil de qualidade forem equivalentes.

## Resultados

| Data UTC | Motor | Modelo | Qualidade | FPS | Medio | p95 | Draw calls | Triangulos | Geometrias | Texturas | Primeiro uso |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-09-22 01:11 | Fragments | Casa Terrea | Alto | 144 | 6,95 ms | 8 ms | 322 | 1.034.318 | 312 | 1 | 5.878 ms |

## Leitura inicial

O instantaneo da Casa Terrea mostra navegacao responsiva no perfil Alto: o p95 de 8 ms permanece abaixo do orcamento de 16,7 ms associado a 60 FPS. Este resultado e uma referencia inicial, nao uma comparacao final com o motor legado. Ainda faltam os cenarios de Galpao Industrial, modelo pequeno e o mesmo conjunto no fallback legado.
