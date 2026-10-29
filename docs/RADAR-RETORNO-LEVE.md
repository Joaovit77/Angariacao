# Radar — contrato de retorno leve com opt-in estrito

A rota autenticada `POST /api/radar/verificar` negocia somente o formato/caminho explicitamente solicitado. A propriedade de negociação não é acrescentada pelos emissores automáticos.

## Requisição e seleção

- Sem `contratoRetorno`: preserva `buscarColetaPaginadaRadar → finalizarColetaCentralAngariacao → persistirColetaRadar`, sem importar ou chamar o motor resumível. O snapshot histórico `anunciosColetados` permanece conforme a resposta legada.
- `contratoRetorno = radar_resumivel_retorno_leve_v1`: somente para Chaves e contexto canônico suportado, com rota de universo disponível. O motor é importado dentro desse ramo e recebe `incluirAnunciosColetados: false`.
- Valor desconhecido, null, string vazia, booleano, número, objeto, array ou contexto incompatível: erro controlado antes de aquisição, import do motor ou escrita funcional. Autenticação e leitura da busca salva podem ocorrer para validar o contexto.

Dono, filtros e universo continuam vindo da busca salva vinculada ao usuário autenticado. Filtros ou evidências enviados no corpo não substituem esses dados. Não há ampliação da matriz geográfica ou de tipos/finalidades.

## Motor e banco

A opção servidora de retorno é opcional e mantém `true` como comportamento histórico. Somente `false` acrescenta o décimo argumento nomeado `p_incluir_anuncios_coletados=false` à RPC de avanço. As chamadas sem adesão continuam com nove argumentos.

O modo leve devolve `contratoRetorno`, progresso, coleta, orçamento e demais receipts, permitindo omitir `anunciosColetados` sem executar o SELECT do snapshot no contrato SQL instalado. Cards continuam vindo da consulta privada paginada existente. O modo não muda persistência, qualificação, coverage, baseline/Novo, first_seen/last_seen, vistos ou isolamento.

A migration H e os overloads compatíveis são pré-requisitos do ambiente. Este receptor não aplica migrations, altera ledger ou infere estado remoto pelo schema local. Não existe fallback silencioso para o outro modo; falhas após tentativa válida conservam o tratamento de erro/janela da rota publicada.

## Emissores e passividade operacional

`verificarBuscaRadar`, `executarMonitorRadar`, `/api/cron/radar` e o componente global de monitoramento permanecem publicados/legados. O navegador envia somente `buscaId` e `origem`; o cron não seleciona retorno leve nem passa a usar diretamente o motor. Não há flag, novo endpoint, mudança de timer, scheduler, timeout ou budget.

A capacidade no receptor só é exercida por uma requisição com opt-in explícito e válido. Adesão automática de navegador/cron exige decisão e gate próprios.

## Validação

Os testes da rota comparam o caminho sem versão ao handler do commit Production de referência e verificam ordem, argumentos, receipts, snapshot, erros, dono e negociação inválida. Um grupo isolado falha se o módulo resumível for importado pelo legado. Testes dos emissores usam Chaves explícito e exigem ausência de H.

O teste do motor verifica nove/dez argumentos e retorno sem snapshot. Os ensaios SQL/PGlite e a regressão da fundação usam fixtures locais já validadas, sem Supabase, portais ou credenciais reais. Testes reais ou publicação não são autorizados por este contrato.
