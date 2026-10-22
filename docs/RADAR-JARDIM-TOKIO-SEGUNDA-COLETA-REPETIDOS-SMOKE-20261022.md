# Radar — segunda coleta válida, repetidos sem Novo

`RADAR_JARDIM_TOKIO_SECOND_VALID_SCAN_REPEAT_PASS`

Uma única rodada 2 real, fresca e completa, executada em **22/10/2026, 16:24:54.332–16:25:40.883 BRT**
(19:24:54.332–19:25:40.883 UTC). Resposta HTTP 200 em 46.551ms. Foram reencontradas 33 identidades
qualificadas já conhecidas: **Novos = 0**. Nenhuma identidade inédita natural surgiu nesta aquisição.
Este PASS comprova ausência de falso positivo pós-baseline; não comprova o caso positivo de Novo natural.

Worktree `codex/radar-baseline-novos`, HEAD `0e952d6`, sem commit/push/deploy.
Predecessor preservado: [primeira baseline válida](RADAR-JARDIM-TOKIO-PRIMEIRA-BASELINE-SMOKE-20261022.md).
Nenhum código de produto foi alterado e nenhuma migration foi aplicada nesta rodada.

## Antes da rodada

Mesmo ambiente isolado: `supabase_db_radar-tokio-real-smoke`, banco em `127.0.0.1:56522`,
API local em `127.0.0.1:56521`. Contêineres saudáveis, portas Docker restritas a loopback.

- Usuário sintético: `3bf45567-bfb5-4315-9f2d-10a35ac15a7c`.
- Busca: `9b526f48-9c31-4d7a-8f67-845d4597a30d`, mesmos filtros persistidos.
- Universo: `32e1fdc8-3395-4bcd-889a-763da61abbb4` —
  `chaves-na-mao | locacao | PR | londrina | casa | todos | v2 | bairro=jardim tokio`.
- Baseline: **`2cac4108-459d-4135-a64f-7ff9d32c0091`**, concluída em `2026-10-22T18:44:17.936956+00:00`.
- A RPC instalada foi conferida contra o corpo da migration de população qualificada já aplicada;
  o helper específico também estava presente. Não houve reaplicação ou preparação de registros.
- Snapshot de entrada integralmente igual ao encerramento do predecessor: 11 varreduras, 45 ofertas
  globais, 33 anúncios privados, um visualizado, zero Novos, uma baseline concluída.
- BEFORE contém global/native/private ID, first_seen, last_seen, primeira varredura, novidade,
  visto e a baseline/comparação vigentes. As 289 presenças históricas também foram fotografadas.

[BEFORE](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-second-valid-scan-20261022/BEFORE.json) e [presenças anteriores](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-second-valid-scan-20261022/presencas-antes.json).
Nenhum anúncio foi modificado, injetado ou promovido para preparar o teste.

## Contenção, orçamento e custo

Sem job em `cron.job`, sem servidor anterior na porta 56530 e sem aba do agente antes da aquisição.
O guard exclusivo desta execução autorizava apenas a rodada 2 e as URLs do mesmo bairro.
Testes com fetch simulado comprovaram Firecrawl e HTTP bloqueados fora da janela, janela expirada,
controle ilegível e rodada 3; décima chamada admitida e décima primeira recusada. Zero rede nesses testes.
O servidor real registrou o guard fechado e correto. Aquecimento autenticado devolveu 400 sem aquisição.

Teto: **10 páginas / 10 chamadas e créditos**. Configuração do produto 10/10; prazo 120s e guards
95/50/35 preservados, comprovados também por hashes dos arquivos. Não houve retry novo.
Serviço: Firecrawl `/v2/scrape`, proxy `basic`, somente `rawHtml`, `maxAge: 0`, sem extras.

Consumo desta rodada: **3 chamadas / 3 créditos informados**, uma chamada por página.
Sem cache, retry ou fallback HTTP externo. Nenhum valor monetário foi inferido dos créditos.
O ledger desta autorização é separado; os ledgers e capturas anteriores permanecem preservados.

**Incidente do instrumento local, após a resposta:** o fechamento por `renameSync` recebeu `EPERM`
no Windows. O arquivo de controle foi fechado operacionalmente às **19:26:21.778601 UTC**, sem
reexecutar o controlador nem corrigir código durante o smoke. Houve aproximadamente 40,9s entre a
resposta e esse fechamento confirmado. Ledger continuou em três chamadas; nenhuma aquisição extra
ocorreu. Firecrawl e HTTP foram então comprovadamente bloqueados pelo mesmo guard/controle real
com transporte simulado e ledger intacto, antes de abrir a UI.

O incidente não alterou o resultado persistido, a baseline, o teto ou o produto. Fica registrado como
pendência do instrumento para eventual execução futura, sem implementação neste gate.
[Registro do fechamento operacional](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-second-valid-scan-20261022/fechamento-operacional.json).

## Aquisição real por página

URLs solicitadas e efetivas coincidiram, sem redirects; cada resposta informou HTTP 200 na API e no portal.

| Página | Requested = effective URL | Restante antes da página | Transporte | Raw | Qualified | Fora | Indeterminados | Declarado | Créditos | Decisão |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| P1 | [Página 1](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/) | 119971.701ms | 6744ms | 15 | 15 | 0 | 0 | 33 | 1 | continuar |
| P2 | [Página 2](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/?pg=2) | 112652.798ms | 6253ms | 15 | 15 | 0 | 0 | 33 | 1 | continuar |
| P3 | [Página 3](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/?pg=3) | 105343.884ms | 5822ms | 15 | 3 | 12 | 0 | 33 | 1 | fim_comprovado |

- P1 publicou next para P2, sem prev.
- P2 publicou prev para P1 e nenhum next; adapter consultou apenas P3 porque 30 qualificados < 33.
- P3 publicou prev para P2, nenhum next; 33 qualificados reconciliados com o total estável 33.
- JSON-LD/canonical apontaram à URL base. P2/P3 conservaram o aviso informativo já contratado
  `portal_document_url_not_pagination_aware`, sem impedir a prova combinada de ordinal/transporte/progresso.
- 45 IDs nativos distintos, sem gap, loop ou identidade posicional; 12 extras objetivamente de outros bairros.
- Final: **45 raw / 33 qualified / 12 out-of-scope / 0 indeterminate / declared 33**.
- Motivo `fim_comprovado`, cobertura API `completa`, evidência `itemlist_paginado_qualificado_v1`.
  Varredura persistida `success / universo_comprovado / cobertura_integral`, páginas 3/3.

IDs e critérios individuais, next/prev, status HTTP, URLs, tempos e decisão do adapter:
[prova por página](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-second-valid-scan-20261022/prova-por-pagina.json). Reavaliação offline dos HTMLs frescos pelas mesmas
funções do worktree, sem nova aquisição.

## Comparação obrigatória com a baseline original

Nova varredura: **`0bc136a8-b6d8-4820-977d-8d227e100647`**, concluída em `2026-10-22T19:25:39.358943+00:00`.
Baseline de referência permanece **`2cac4108-459d-4135-a64f-7ff9d32c0091`**.
Objeto completo do universo, baseline ID e data de conclusão permaneceram idênticos ao BEFORE.
`baselineFormada = false`: nenhuma segunda baseline foi criada.
`comparacao_desde_varredura_id` e `comparacao_desde_em` da busca também ficaram idênticos.

| Contrato observado | Resultado |
|---|---|
| Qualificados já conhecidos | 33 |
| Qualificados realmente inéditos | 0 |
| Novos na API / certificados privados | 0 / 0 |
| IDs globais e first_seen preservados | 45 / 45 |
| last_seen avançou nos reobservados | 45 / 45 |
| IDs privados, datas de descoberta e vistos preservados | 33 / 33 |
| Anúncio visualizado preservado | 45597290, visto=true |
| Varreduras históricas integralmente preservadas | 11 |
| Presenças históricas preservadas | 289 |
| Varreduras novas | 1, exclusivamente a rodada 2 |

Os `ultimo_visto_em` anteriores estavam entre `2026-10-22T18:43:46.393+00:00` e
`2026-10-22T18:44:01.104+00:00`; passaram para `2026-10-22T19:25:02.904+00:00` a
`2026-10-22T19:25:16.725+00:00`. Nenhum `primeiro_visto_em` ou primeira varredura mudou.
Nenhum anúncio antigo ou extra de outro bairro recebeu `novidade_varredura_id`.
Sobrado e suas identidades/tipo original permaneceram preservados.

[Comparação por identidade](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-second-valid-scan-20261022/comparacao-identidades.json),
[resultado da comparação](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-second-valid-scan-20261022/comparacao-verificada.json),
[verificação final](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-second-valid-scan-20261022/verificacao-final.json).

**Caso positivo natural não exercitado:** não surgiu identidade qualificada inédita. Não foi inserida
identidade sintética e não se fabricou Novo. A classificação desta execução é somente REPEAT_PASS,
conforme o contrato autorizado; NEW_IDENTITY_PASS não é reivindicado.

## Interface após fechar os transportes

Na UI real local, mesma conta e busca Jardim Tókio/Londrina:

- última verificação manual às 16:25:39;
- contador **0 anúncios novos**;
- preços, localização, portal e links consultáveis;
- 32 links com o visualizado oculto; “Mostrar 1 visualizado/repetido” revela o registro preservado,
  passando a 33 URLs. Conjunto de links da UI exatamente igual ao conjunto privado do banco;
- visualizado `45597290` permanece com a etiqueta “Visualizado”;
- nenhum anúncio foi aberto individualmente nesta rodada; não houve verificar adicional, marcar como
  visto, importar, contato, WhatsApp ou visita.

Os rótulos históricos “Base não revisada” e “Coleta parcial” permanecem como backlog, sem correção
neste gate. Eles não foram usados para reclassificar a coverage completa da nova varredura.
Console da aba: nenhum erro ou aviso registrado nesta conferência. Miniaturas externas continuam
restritas pelo guard do ensaio. Com 33 registros, “Carregar mais” não é necessário e seu acionamento
real acima de 120 registros não foi exercitado.

[33 anúncios e links](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-second-valid-scan-20261022/anuncios-reais.md), [links obtidos da UI](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-second-valid-scan-20261022/links-ui.json),
[captura da rodada 2 com zero Novos](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-second-valid-scan-20261022/interface-resumo-rodada2.png).

## Telemetria e fechamento

Evento persistido `central-busca-ok`, execução `d65ae58c-7ef7-4bb9-8d6a-bf54d3d1f01b`,
reutilização `nenhuma`, três tentativas Firecrawl, 45 coletados, população 45/33/12/0,
`fim_comprovado`, Novos 0. [Telemetria real](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-second-valid-scan-20261022/telemetria-rodada.json).

Validações executadas: guard sem rede, schema/RPC já aplicada, BEFORE/AFTER, aquisição e transação
reais autenticadas, adapter sobre HTMLs frescos, baseline/comparação imutáveis, global/private IDs,
first_seen/last_seen/visto, presenças históricas, UI real, ausência de varredura extra e fechamento.
Os 1.065 arquivos de produto conferidos mantiveram seus hashes de entrada; `next-env.d.ts`, gerado
pelo Next dev, foi restaurado ao hash anterior após encerrar o servidor. Somente este relatório foi
acrescentado ao repositório. Sem mudança de código, a suíte completa/build não foram repetidos;
esta prova real não substitui o gate automatizado anteriormente documentado.

Snapshot pós-rodada e snapshot final após UI são integralmente idênticos. Aba fechada; servidor
exclusivo encerrado, porta 56530 sem listener; controle fechado, banco local preservado.
**Rodada 3 não executada.** Não houve Supabase remoto, Production, migration, scheduler, mudanças de
coverage/Sobrado/cap/budget, trabalho no universo maior, commit, push ou deploy.

Pendências: etiquetas históricas da UI; robustez do fechamento do instrumento local no Windows;
caso positivo de identidade natural inédita e paginação privada maior não exercitados.
Nenhuma dessas frentes foi iniciada automaticamente.

**STOP após a rodada 2.**
