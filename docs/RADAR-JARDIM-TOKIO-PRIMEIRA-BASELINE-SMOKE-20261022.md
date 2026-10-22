# Radar — primeira baseline válida de Jardim Tókio

`RADAR_JARDIM_TOKIO_FIRST_VALID_BASELINE_PASS`

Uma única rodada real e fresca em 22/10/2026, de **15:43:27.885 a 15:44:18.631 BRT**
(18:43:27.885–18:44:18.631 UTC), pelo fluxo autenticado do produto. Resposta HTTP 200 em 50.746ms.
A aquisição terminou por `fim_comprovado`: três páginas consecutivas, cobertura completa,
primeira baseline válida e **zero Novos**. Rodada 2 não foi executada.

Worktree `codex/radar-baseline-novos`, HEAD `0e952d6`, sem commit/push/deploy.
Os [HOLDs anteriores](RADAR-JARDIM-TOKIO-BUDGET-RERUN-RODADA1-20261022.md) e a
[entrega do contrato qualificado](RADAR-CHAVES-SOBRADO-POPULACAO-RECONCILIADA-ENTREGA.md)
continuam preservados. Nenhuma correção do produto foi realizada durante este smoke.

## Alvo e preparação local

Mesma conta sintética, busca `9b526f48-9c31-4d7a-8f67-845d4597a30d` e universo
`32e1fdc8-3395-4bcd-889a-763da61abbb4`:
`chaves-na-mao | locacao | PR | londrina | casa | todos | v2 | bairro=jardim tokio`.
Não houve nova busca, universo, cidade, bairro, alias, scheduler ou arquitetura.

A migration `20261022180000_radar_chaves_populacao_qualificada.sql` foi aplicada **somente**
no container `supabase_db_radar-tokio-real-smoke`, PostgreSQL em `127.0.0.1:56522`, API
`http://127.0.0.1:56521`. As portas Docker estavam vinculadas exclusivamente a loopback.
A RPC anterior correspondia literalmente ao corpo da migration C; o novo helper ainda não existia.
O conteúdo de D correspondia ao bloco literal do schema canônico. SHA-256 da migration aplicada:

`6df5964d738b9f323f679fcf0d027550bf0a1058078b92dd1bf0ed50bfe228d3`

Aplicação em transação explícita BEGIN/COMMIT, concluída às 18:42:08 UTC. Helper e RPC resultantes
foram conferidos contra a fonte; colunas permaneceram inalteradas. O ambiente havia sido preparado
por SQL direto e não possuía `supabase_migrations.schema_migrations`: nenhum ledger foi inventado
ou reconstruído. Os históricos existentes de Auth, Storage, Functions e Realtime permaneceram idênticos.

Snapshot integral dos dados do Radar antes/depois da migration: **idêntico** — 10 varreduras,
44 ofertas globais, 33 anúncios privados, baseline ID/conclusão NULL e zero Novos certificados.
Nenhuma varredura antiga foi promovida, reingerida ou alterada pela aplicação.

## Contenção e custo

O instrumento temporário de tempo foi corrigido fora do repositório: controle ilegível fecha os
transportes; observação não lança erro e retorna o mesmo relógio monotônico nativo; controlador
publica a abertura/fechamento por troca atômica do arquivo. Sem mudanças no orçamento do produto.

Preflight com fetch inteiramente simulado: Firecrawl e HTTP bloqueados fora da janela, rodada 2
bloqueada, expiração bloqueada, décima chamada simulada admitida e décima primeira recusada.
Controle vazio/malformado também bloqueia rede sem derrubar o observador. Zero rede/custo nesse teste.
Servidor real registrou o guard correto carregado e fechado; caps configurados 10 páginas/10 chamadas.
Cron local com zero jobs e nenhuma aba do agente aberta antes da aquisição.
Aquecimento autenticado com origem inválida devolveu 400 antes da coleta, sem consumo.

**Firecrawl `/v2/scrape`, proxy basic, rawHtml, maxAge 0: 3 chamadas / 3 créditos informados.**
Sem retry, cache, HTTP contingencial, IA/browser ou proxy reforçado. Não há custo monetário confirmado
no retorno; créditos não foram convertidos em reais/dólares. Orçamento 120s, guards 95/50s e reserva
35s preservados, sem aumento de teto.

Controle fechado imediatamente após a resposta; repetida a prova de bloqueio de Firecrawl e HTTP
com o mesmo guard/controle real e transporte simulado: zero rede e ledger intacto.
A aba foi fechada e o servidor dedicado encerrado. Banco local preservado. Rodada 2: zero chamadas.

## Páginas realmente adquiridas

URL base: https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/

| Página | URL efetiva e solicitada | HTTP API/portal | Restante antes da página | Duração transporte | Raw | Qualificados | Fora | Indeterminados | Declarado | Créditos |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| P1 | [Página 1](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/) | 200/200 | 119834.938ms | 7802ms | 15 | 15 | 0 | 0 | 33 | 1 |
| P2 | [Página 2](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/?pg=2) | 200/200 | 111089.627ms | 7514ms | 15 | 15 | 0 | 0 | 33 | 1 |
| P3 | [Página 3](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/?pg=3) | 200/200 | 102835.357ms | 5749ms | 15 | 3 | 12 | 0 | 33 | 1 |

Acumulado: **45 raw / 33 qualified / 12 fora por bairro / 0 indeterminados / total declarado 33**.
Todos os IDs são nativos qualificados por portal/finalidade, sem identidade posicional global.
As 45 identidades são distintas; não houve gaps, loops ou redirects. URLs efetivas coincidiram com
as solicitadas. Os 12 extras foram preservados globalmente, sem distribuição privada nesta busca.

- P1: next publicado para P2, sem prev; adapter continua.
- P2: prev para P1, sem next publicado; adapter pede somente o ordinal P3 porque 30 < 33.
- P3: prev para P2, sem next; qualificados acumulados = 33, indeterminados = 0; `fim_comprovado`.
- JSON-LD/canonical nas três páginas apontam para a URL base. P2/P3 registram o aviso informativo
  `portal_document_url_not_pagination_aware`; a prova combinada de transporte, progressão e população
  foi admitida pelo contrato existente. Não houve relaxamento durante a execução.

IDs brutos, qualificados, excluídos/razão, indeterminados, next/prev, JSON-LD, canonical, tempos,
status e decisão por página estão em [prova-por-pagina.json](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-first-baseline-smoke-20261022/prova-por-pagina.json).

## Baseline e integridade histórica

- Coverage API: `completa`; evidência `itemlist_paginado_qualificado_v1`.
- Varredura: `success`, `universo_comprovado`, `cobertura_integral`, páginas 3/3.
- Primeira baseline ID: **`2cac4108-459d-4135-a64f-7ff9d32c0091`**, ligada ao mesmo universo Jardim Tókio.
- Conclusão da varredura: 18:44:17.828675 UTC. Marco de formação da baseline:
  **2026-10-22T18:44:17.936956+00:00** (15:44:17 BRT).
- 45 presenças globais da rodada, incluindo **todos os 33 qualificados** e os 12 extras objetivos.
  Os extras não foram tratados como qualificados nem enviados à lista privada.
- Busca recebeu `comparacao_desde_varredura_id` da nova baseline e marco de comparação persistido.
- **Novos = 0; nenhum dos 33 anúncios recebeu `novidade_varredura_id`.**
- As dez varreduras anteriores permanecem integralmente idênticas no snapshot, sem promoção.
- Os 44 registros globais anteriores mantiveram ID, primeira varredura e `primeiro_visto_em`.
  Os 44 `ultimo_visto_em` avançaram: entre 18:43:46.393 e 18:44:01.104 UTC nesta aquisição.
- O Sobrado `45735542` passou a ter vínculo global, preservando o tipo original `Sobrado`,
  sem gerar Novo. Sua presença privada anterior e data de descoberta foram preservadas.
- O anúncio `45597290` continua visualizado; nenhuma ação privada foi zerada.
- Snapshot pós-rodada e snapshot final após UI são integralmente idênticos: nenhuma varredura extra.

Provas: [persistência](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-first-baseline-smoke-20261022/persistencia-verificada.json),
[presenças da baseline](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-first-baseline-smoke-20261022/presencas-baseline.json),
[verificação final](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-first-baseline-smoke-20261022/verificacao-final.json).

## Interface e acesso real

Interface local com autenticação real, depois do fechamento dos transportes externos:

- mesma busca Jardim Tókio/Londrina, última verificação manual às 15:44:17;
- contador **0 anúncios novos**;
- aviso da busca “aguardando coleta com cobertura suficiente” deixou de aparecer;
- preços, localização, portal e links diretos disponíveis;
- 32 links com o visualizado oculto; “Mostrar 1 visualizado/repetido” revela o registro preservado,
  ficando 33 links. O conjunto das 33 URLs da UI corresponde exatamente ao conjunto privado do banco;
- nenhuma ação de verificar, marcar como visto, importar, WhatsApp, contato ou visita foi acionada.

**Limite de apresentação:** os cartões antigos continuam exibindo “Base não revisada” para itens
não vistos/sem novidade e “Coleta parcial” pela cobertura guardada na descoberta original.
A formação da baseline não altera esses campos históricos. Não há selo positivo explícito de baseline
formada na tela existente; a mudança observável na busca é a ausência do aviso de baseline pendente.
Isso não deve ser apresentado como revisão humana dos 32 anúncios nem como atualização de todos os
rótulos para a cobertura da última rodada. Possível melhoria de clareza registrada em backlog abaixo.

As URLs foram conferidas na UI; não foram abertas individualmente as 33 páginas de anúncio nesta rodada.
“Carregar mais anúncios” não aparece: 33 registros cabem na primeira leitura privada de 120. Esse botão
não foi exercitado com dados reais neste smoke. Nenhuma cobertura adicional foi simulada.

[Catálogo dos 33 anúncios, preços e links](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-first-baseline-smoke-20261022/anuncios-reais.md).
[Captura do resumo com zero Novos](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-first-baseline-smoke-20261022/interface-resumo.png).
[Captura dos anúncios](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-first-baseline-smoke-20261022/interface-anuncios.png).

## Telemetria, validação e limites

Evento real `central-busca-ok` persistido, execução `88735135-2376-48ee-8269-0af582806a68`:
reutilização `nenhuma`, três tentativas Firecrawl (uma por página), fases de envio/resposta/interpretação,
45 coletados, população 45/33/12/0, total 33, `fim_comprovado`, Novos 0. O observador não causou
`Unexpected end of JSON input`. [Telemetria integral segura desta rodada](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-first-baseline-smoke-20261022/telemetria-rodada.json).

Validações deste smoke: preflight de contenção sem rede, aplicação local transacional/hash/espelho,
comparação integral pré/pós-migration, contrato real autenticado, adapter offline nos HTMLs frescos,
baseline/presenças/novidade, preservação de first/last_seen e visto, UI real, fechamento e hashes de
**1.065 arquivos** do produto preservados. `next-env.d.ts`, gerado pelo Next dev, foi restaurado ao
hash exato de entrada após encerrar o servidor. Nenhum arquivo de produto, migration ou schema foi
alterado durante o smoke; somente este relatório foi acrescentado ao repositório.

Não foi repetida a suíte completa nesta execução sem mudança de produto. O gate anterior continua
registrado como 7.902 testes aprovados e cinco falhas preexistentes em `mensagens-agendadas.test.ts`
(SQL/CRLF), com TypeScript e build aprovados e lint sem erros/um aviso preexistente. Não equivale a
novos resultados executados hoje após este smoke. `git diff --check` executado para a documentação.

Pendências laterais / limites conhecidos, sem implementação nesta frente:

1. Clareza da UI entre baseline formada, revisão humana pendente e cobertura da descoberta histórica.
2. Console da UI registrou uma ocorrência genérica “Falha ao carregar dados do Supabase: Object”.
   Não impediu a leitura autenticada do Radar, os 33 anúncios ou os links; origem não investigada.
   Não se afirma console limpo nem validação dos demais módulos nessa stack parcial.
3. Miniaturas externas permanecem indisponíveis sob a contenção do ensaio; não liberar rede por isso.
4. Paginação privada acima de 120 registros e comportamento em universos maiores não foram exercitados.
5. Repetição após baseline e eventual identidade realmente inédita exigem autorização separada de rodada 2.

**Nenhum blocker factual no percurso aquisição → coverage → primeira baseline → zero Novos → acesso.**
STOP após este smoke. Supabase remoto, Production, commit, push, deploy, scheduler e universo de
aproximadamente 3.080 ofertas não foram acionados.
