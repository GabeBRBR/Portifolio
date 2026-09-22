# Plano de Implementacao Fase 11 Validacao Final e Legado

## Visao geral

Consolidar o viewer Fragments somente com evidencias de paridade funcional. O legado continua ativo como alternativa ate que cortes, explosao e fundo tenham equivalentes no Fragments e a matriz de regressao seja aprovada.

## Resultado consolidado

- Aprovados no Fragments: carga hospedada e local, cache, federacao, selecao, propriedades, busca, arvore, visibilidade, isolamento, enquadramento, caminhada, colisao, qualidade adaptativa, fundo, cortes e explosao por elemento.
- A explosao preserva cor, opacidade e transparencia de cada elemento por meio das definicoes de material do Fragments; ela desabilita selecao e caminhada somente enquanto a vista temporaria estiver ativa.
- A matriz manual foi aprovada pelo usuario em 2026-09-21, inclusive com a correção final de materiais no modo explodido.
- Controles transversais mantidos: abrir, fechar, tela cheia, troca de exemplo e importacao por projeto.

## Tarefas

### Iteracao 1 Paridade dos controles visuais — concluida

- [x] Migrar fundo para a cena Fragments e confirmar persistencia da cor.
- [x] Migrar explosao por elemento, sem modificar coordenadas de federacao permanentes.
- [x] Migrar cortes usando os mecanismos de clipping compativeis com Fragments.

### Iteracao 2 Matriz de regressao — concluida

- [x] Executar matriz manual no IFC externo e no fluxo Fragments com depuracao.
- [x] Registrar e corrigir falhas de explosao, selecao, caminhada e materiais; aprovação do usuario obtida.

### Iteracao 3 Consolidacao — concluida

- [x] Manter o motor padrao como fallback explicito; o caminho Fragments e o recomendado para teste e uso corrente.
- [x] Atualizar o plano e a lista de verificacao com a decisao e a aprovacao.

## Decisao de encerramento

- O motor legado nao foi apagado nesta fase: ele e uma rota de contingencia, nao uma dependencia dos controles Fragments. A remocao definitiva exigiria uma fase dedicada, com plano de reversao para usuarios existentes.
- A Fase 11 foi aprovada pelo usuario. Cada iteracao funcional desta fase foi publicada no GitHub antes do teste correspondente.
