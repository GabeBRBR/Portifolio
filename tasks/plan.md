# Plano de Implementacao Fase 11 Validacao Final e Legado

## Visao geral

Consolidar o viewer Fragments somente com evidencias de paridade funcional. O legado continua ativo como alternativa ate que cortes, explosao e fundo tenham equivalentes no Fragments e a matriz de regressao seja aprovada.

## Inventario atual

- Aprovados no Fragments: carga hospedada e local, cache, federacao, selecao, propriedades, busca, arvore, visibilidade, isolamento, enquadramento, caminhada, colisao e qualidade adaptativa.
- Pendentes no Fragments: explosao, cortes e fundo; os controles exibem aviso e ainda dependem do motor legado.
- Controles transversais mantidos: abrir, fechar, tela cheia, troca de exemplo e importacao por projeto.

## Tarefas

### Iteracao 1 Paridade dos controles visuais

- [ ] Migrar fundo para a cena Fragments e confirmar persistencia da cor.
- [ ] Migrar explosao sem modificar coordenadas de federacao permanentes.
- [ ] Migrar cortes usando os mecanismos de clipping compativeis com Fragments.

### Iteracao 2 Matriz de regressao

- [ ] Executar matriz manual em modelo pequeno, medio, pesado e IFC externo.
- [ ] Registrar falhas de selecao, caminhada, cache, troca de projeto e qualidade adaptativa.

### Iteracao 3 Consolidacao

- [ ] Remover o legado somente se todas as funcoes criticas tiverem equivalentes aprovados.
- [ ] Atualizar documentacao de execucao, conversao e publicacao.

## Checkpoint

- O motor legado nao sera removido nesta iteracao: tres controles visuais ainda nao possuem substituto no Fragments.
- Cada iteracao com alteracao funcional sera publicada no GitHub antes do teste do usuario.
