# Plano de Implementacao Fase 9 Upload Cache Progressivo

## Visao geral

Concluir o fluxo de IFC local no motor Fragments: importar no navegador, converter sem envio a servidores, reabrir por cache IndexedDB e tornar seus limites e estados compreensiveis na interface.

## Decisoes de arquitetura

- Manter importacao sequencial: o conversor e o worker compartilham memoria; processar um arquivo por vez preserva a responsividade e isola falhas.
- Guardar apenas o buffer Fragments e metadados por SHA-256. O IFC original nao e persistido.
- Limitar a tres modelos locais e oito totais por sessao; a interface deve comunicar esses limites corretamente.
- Tratar o cache como acelerador: qualquer falha de IndexedDB cai para conversao normal.

## Tarefas

### Bloco 1 Fluxo e feedback do cache

- [x] Exibir no painel de modelos se um IFC local foi convertido agora ou reaberto do cache, incluindo o tamanho do Fragment.
- [x] Alinhar a nota de limites da interface com tres IFCs locais e oito modelos totais.
- [x] Solicitar o contexto do IFC antes da conversao: federar ao projeto atual ou iniciar outro projeto sem apagar o cache.
- [ ] Documentar o contrato de progresso e de falha por arquivo sem bloquear os demais.

### Checkpoint 1

- [x] Um IFC local e convertido no navegador e aparece no painel com estado claro (IFC de 40,1 MB; Fragment de 2,7 MB).
- [x] O build Vite conclui e nenhum IFC local e enviado ao servidor.

### Bloco 2 Reabertura e ciclo de sessao

- [x] Reabrir o mesmo IFC e comprovar leitura do IndexedDB sem novo parsing.
- [ ] Confirmar visibilidade, isolamento, selecao e enquadramento para modelo local.
- [ ] Trocar de obra e comprovar descarte da geometria de sessao sem apagar o cache.

### Checkpoint 2

- [ ] Uma falha de arquivo nao remove os demais nem deixa o viewer inconsistente.
- [ ] Registrar manualmente tempos de primeira conversao e reabertura com um IFC de teste autorizado.

## Riscos e mitigacoes

| Risco | Mitigacao |
| --- | --- |
| IFC grande esgota memoria | Limites por arquivo e por sessao, processamento sequencial e aviso claro |
| IndexedDB indisponivel ou sem espaco | Cache opcional, aviso no console e conversao normal preservada |
| Estado da interface diverge do motor | Usar os mesmos limites declarados pelo FragmentsPilot e expor origem/cache por modelo |
