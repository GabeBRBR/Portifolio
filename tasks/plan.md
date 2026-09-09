# Plano de Implementacao Fase 9 Upload IFC Local

## Visao geral

Permitir que arquivos IFC escolhidos pelo usuario sejam convertidos para Fragments no navegador, adicionados ao modelo federado e reutilizados do cache local. Nenhum IFC sera enviado ao GitHub Pages ou a outro servidor.

## Decisoes de arquitetura

- Usar `OBC.IfcLoader` da versao instalada para converter `Uint8Array` IFC em Fragments e o worker local ja configurado pelo `FragmentsManager`.
- Configurar o loader com o WASM `web-ifc` emitido pelo Vite; nao usar CDN.
- Guardar apenas o buffer Fragments convertido e metadados no IndexedDB, identificado por SHA-256 do arquivo. O IFC bruto nao e persistido.
- Limitar a tres modelos locais e oito modelos totais por sessao, preservando as cinco disciplinas demonstrativas.
- Manter o cache como acelerador: falhas de leitura ou de armazenamento nao impedem a conversao normal.

## Tarefas

### Bloco 1 Importacao local

- [x] Criar adaptador de cache IndexedDB com leitura, escrita e falha segura.
- [x] Inicializar `IfcLoader` com WASM local no motor Fragments.
- [x] Encaminhar o botao Adicionar IFCs para o motor Fragments, com validacao e progresso por arquivo.

### Checkpoint 1

- [ ] Um IFC local e convertido no navegador e aparece no painel de modelos.
- [x] Build Vite conclui e nenhum arquivo local e enviado ao servidor.

### Bloco 2 Reabertura e gerenciamento

- [ ] Reutilizar Fragment do IndexedDB quando o hash ja existir.
- [ ] Preservar visibilidade, isolamento, selecao e enquadramento para modelos locais.
- [ ] Descartar a geometria local da sessao ao trocar de obra, sem apagar o cache.

### Checkpoint 2

- [ ] A segunda abertura do mesmo IFC evita parsing IFC.
- [ ] Falha de um arquivo nao remove os demais e a interface continua utilizavel.

## Riscos e mitigacoes

| Risco | Mitigacao |
| --- | --- |
| IFC grande esgota memoria | Limites por arquivo, limite de modelos e aviso de memoria |
| IndexedDB indisponivel ou sem espaco | Cache opcional com fallback para conversao normal |
| Conversao bloqueia a interface | Indicador de progresso, processamento sequencial e atualizacao de tela entre arquivos |
