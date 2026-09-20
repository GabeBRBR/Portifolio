# Plano de Implementacao Fase 10 Qualidade Adaptativa

## Visao geral

Levar a qualidade adaptativa ao motor Fragments sem alterar o viewer legado: perfis Alto, Equilibrado e Desempenho, escolha manual persistente e reducao temporaria de custo enquanto a camera se move ou o frame time excede o limite.

## Decisoes de arquitetura

- Concentrar a politica no `FragmentsPilot`, que e o unico motor ativo com `ifcEngine=fragments`.
- Manter sombras desativadas e usar pixel ratio, antialiasing efetivo e politica de LOD/culling como controles de custo disponiveis na versao instalada.
- A escolha manual define o teto de qualidade; a protecao automatica apenas reduz um degrau e restaura gradualmente depois de estabilidade.
- Expor o perfil no toolbar do viewer e salvar a preferencia em `localStorage`.

## Tarefas

### Fundacao

- [ ] Criar o controlador de perfis e aplicar pixel ratio, LOD e frequencia de atualizacao de Fragments.
- [ ] Medir frame time em janela curta e alternar o degrau automatico sem oscilacao.

### Interface e integracao

- [ ] Adicionar seletor Qualidade com Alto, Equilibrado e Desempenho ao viewer Fragments.
- [ ] Propagar a escolha da interface para o `FragmentsPilot` e preservar a preferencia entre aberturas.

### Verificacao

- [ ] Validar alteracao manual, reducao durante movimento e restauracao apos a camera parar.
- [ ] Executar build de producao e teste do visualizador em `?ifcEngine=fragments&ifcDebug=1`.

## Riscos e mitigacoes

| Risco | Mitigacao |
| --- | --- |
| Oscilacao de qualidade | Histerese por frame time e periodo minimo entre mudancas |
| LOD agressivo prejudica caminhada | Caminhada mantem o modo de visibilidade exigido pelo controlador atual |
| Preferencia manual ignorada | O modo automatico nunca excede o perfil escolhido |
