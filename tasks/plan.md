# Plano de Implementacao Fase 12 Consolidacao e retirada controlada do legado

## Visao geral

Concluir a migracao para Fragments com evidencias reproduziveis de qualidade, regressao e desempenho. O objetivo nao e apagar o motor padrao prematuramente: primeiro o Fragments se torna o caminho padrao com uma reversao explicita; a retirada do codigo legado so ocorre depois da matriz final aprovada.

## Decisoes de arquitetura

- Fragments passa a ser o motor padrao. Durante a validacao, `?ifcEngine=legacy` continua como rota de contingencia explicita; o usuario comum nao precisa mais de parametro para usar o novo motor.
- As metricas de diagnostico existentes serao registradas como instantaneos comparaveis, sempre com modelo, motor, perfil de qualidade e data. A coleta nao exibira painel de depuracao no link publico de teste. Como nao existe baseline historico salvo da Fase 1, a comparacao final sera estabelecida novamente entre legado e Fragments no mesmo navegador e nos mesmos modelos.
- A remocao do legado depende da matriz aprovada, de um build limpo e de documentacao operacional. Nao sera feita como efeito colateral de outras iteracoes.

## Dependencias

```text
instantaneos de benchmark + matriz de regressao
    -> Fragments como padrao com fallback explicito
        -> nova validacao publicada
            -> retirada do legado e limpeza de residuos
                -> documentacao operacional e encerramento
```

## Iteracao 1 Evidencias reproduziveis

### T12.1 Instantaneos de benchmark no diagnostico

- [ ] Permitir copiar ou exportar um instantaneo com FPS, frame time medio e p95, draw calls, triangulos, memoria, primeiro frame, modelo, motor e perfil de qualidade.
- [ ] Coletar o recurso sem parametro de depuracao; a interface publica nao deve ganhar painel, parametros ou ruido de diagnostico.
- [ ] Validar em um modelo pequeno, medio e pesado no motor Fragments; registrar o mesmo conjunto no legado enquanto ele existir.

**Aceite:** cada resultado pode ser comparado fora do navegador sem transcricao manual ambigua.

**Verificacao:** build de producao e teste manual no link publico sem `ifcDebug`.

## Iteracao 2 Matriz de regressao publicada

### T12.2 Checklist de aceite por modelo e fluxo

- [ ] Registrar os testes de carregamento, orbita, selecao, propriedades, disciplinas, clipping, fundo, tela cheia, caminhada, troca de obra, upload, cache e federacao.
- [ ] Cobrir pequeno, medio, pesado e IFC externo; anotar ambiente, modelo e falha encontrada, se houver.
- [ ] Publicar a iteracao e obter aprovacao do usuario antes de trocar o motor padrao.

**Aceite:** nenhum fluxo critico fica sem resultado explicitamente registrado.

**Verificacao:** matriz preenchida, build de producao e teste do usuario na pagina publicada.

## Iteracao 3 Fragments como padrao com reversao

### T12.3 Inverter o feature flag

- [ ] Abrir Fragments sem parametro de URL e manter `?ifcEngine=legacy` como reversao temporaria.
- [ ] Exibir o motor ativo no diagnostico, sem expor essa configuracao na interface publica.
- [ ] Repetir o fluxo de IFC hospedado e externo, cache, caminhada, cortes e explosao no caminho padrao.

**Aceite:** a pagina publicada abre no Fragments e o fallback funciona apenas pela URL de contingencia.

**Verificacao:** build de producao, teste local e teste do usuario apos publicacao.

## Iteracao 4 Retirada do legado e limpeza

### T12.4 Remover somente codigo comprovadamente substituido

- [ ] Isolar e remover o parser, renderizador, UI e dependencias exclusivas do motor legado depois da aprovacao da Iteracao 3.
- [ ] Eliminar IDs, listeners, estilos e caminhos de codigo orfaos; o script principal do site continua separado do motor IFC.
- [ ] Corrigir o aviso de build relacionado ao carregamento de `script.js` sem alterar funcionalidades do portfolio.

**Aceite:** uma unica arquitetura do viewer e build sem avisos relacionados ao viewer ou ao carregamento do script principal.

**Verificacao:** build, auditoria de imports e regressao completa no Fragments.

## Iteracao 5 Operacao e encerramento

### T12.5 Documentacao operacional

- [ ] Criar README com instalar, desenvolver, buildar, converter IFCs para Fragments e publicar no GitHub Pages.
- [ ] Registrar resultados finais, limitacoes conhecidas e decisoes de retirada no historico de arquitetura.

**Aceite:** uma pessoa nova consegue executar e publicar o viewer a partir do repositorio.

**Verificacao:** seguir os comandos documentados em uma sessao limpa e executar o build.

## Checkpoints de publicacao

- Cada iteracao funcional termina em commit, push para `main` e deploy do GitHub Pages antes do teste do usuario.
- Nenhuma remocao de codigo legado e iniciada sem a aprovacao do checkpoint anterior.

## Riscos e mitigacoes

| Risco | Impacto | Mitigacao |
| --- | --- | --- |
| Metricas variam por hardware | Medio | Comparar motores na mesma maquina, navegador, modelo e perfil. |
| Retirada remove um recurso ainda usado | Alto | Usar fallback temporario e matriz completa antes de apagar o legado. |
| IFC externo revela caso nao coberto | Alto | Incluir upload e reabertura por cache na matriz em cada checkpoint. |
| Limpeza afeta o portfolio | Medio | Alterar somente scripts e estilos ligados ao viewer; validar navegacao geral. |
