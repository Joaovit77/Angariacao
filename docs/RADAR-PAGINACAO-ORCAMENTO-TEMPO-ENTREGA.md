# Radar — orçamento de tempo por fase na paginação

`RADAR_PAGINATION_TIME_BUDGET_REVISED_READY_FOR_JARDIM_TOKIO_SMOKE_RERUN`

Execução real posterior: [rodada única de Jardim Tókio](RADAR-JARDIM-TOKIO-BUDGET-RERUN-RODADA1-20261022.md). P3 adquirida; HOLD por ItemList acumulado de 45 IDs diante de total declarado 33. Este documento preserva a entrega e a validação anteriores à execução.

Data: 22/10/2026. Branch `codex/radar-baseline-novos`, HEAD `0e952d6`, sem commit.
Implementação e validação local, sem nova aquisição paga.
O [HOLD real anterior](RADAR-JARDIM-TOKIO-RERUN-RODADA1-20261022.md) permanece histórico factual.

## Comportamento anterior

Antes de cada página, o coletor exigia 110 segundos: 60 de Firecrawl, 15 de fallback e 35 de
processamento/finalização. Como o prazo existente é de 120 segundos, após P1/P2 consumirem cerca de
11,5 segundos, P3 era bloqueada preventivamente. O fallback contingencial estava reservado como se
fosse obrigatório em toda página.

## Política revisada

| Momento | Condição mínima de tempo restante |
|---|---:|
| Iniciar página e enviar Firecrawl | 60s de timeout + 35s de processamento/finalização = **95s** |
| Após falha, iniciar fallback HTTP | 15s de timeout + os mesmos 35s = **50s**, reavaliados naquele momento |
| Reutilização de cache HTTP, sem nova aquisição | Preservar os 35s existentes |

**A margem de 35 segundos foi mantida**, sem redução arbitrária. Ela cobre interpretação,
consolidação, coverage, persistência, baseline/Novo, distribuição e resposta. Os timeouts de transporte
continuam 60 segundos no fetch Firecrawl (55 segundos de scrape + margem já existente de transporte)
e 15 segundos no HTTP direto. Não foi alterado `maxDuration = 120` nem o valor de `maxAge`.

`TempoRodadaRadar` transporta a mesma função de tempo restante do chamador e sua reserva. Não cria
um relógio ou período novo. Na rota, o cálculo continua equivalente a `deadline - performance.now()`
a partir do início capturado; no cron, permanece o prazo absoluto da rodada. A callback é compartilhada
por página, Firecrawl, fallback e política de retry. Nenhuma fase reinicia a janela.

O guard é conferido antes da página e novamente antes de cada tentativa Firecrawl, depois de cache
ou espera e **antes de reservar crédito/enviar**. O fallback reavalia depois da falha/cache e reconfere
antes do próprio envio. Tempo insuficiente, negativo ou não finito retorna `limite_tempo`; não inicia
transporte adicional. Falha na primeira página por limite produz coleta não certificada vazia; falha
posterior mantém a base parcial já adquirida.

A política de retry continua existente: no máximo uma segunda tentativa onde admitida, nunca uma
terceira; Chaves não recebe retry Firecrawl, pois já tem fallback próprio. Retry e espera usam o mesmo
restante da rodada, e cada envio continua sujeito ao teto pago compartilhado. Nada foi habilitado
para Central, mercado ou caminho legado por inferência: o novo contrato temporal é um parâmetro
opcional enviado explicitamente pela paginação Radar.

## Arquivos alterados nesta fatia

- [Orçamento Radar](../web/lib/servidor/orcamentoRadar.ts): contrato temporal e guard de fase.
- [Paginação](../web/lib/servidor/paginacaoRadar.ts): reserva primária de 95s e mesmo relógio em todas as fases.
- [Firecrawl](../web/lib/servidor/firecrawlCentralAngariacao.ts): conferir tempo antes de cada envio pago.
- [Fallback HTTP](../web/lib/servidor/fallbackHttpChaves.ts): reavaliação contingencial e guard antes do envio HTTP.
- [Novos testes de tempo](../web/tests/radar-orcamento-tempo.test.ts): 17 cenários com relógio controlado e fetch simulado.
- [Mock do monitor](../web/tests/monitor-radar-angariacao.test.ts): expõe a constante existente de 60s;
  nenhuma expectativa foi removida ou alterada. O código do monitor/scheduler não mudou.
- [Contrato permanente](../PROJECT.md#baseline-cobertura-e-novidade-do-radar): orçamento por fase.

O worktree já continha alterações de outras fatias; elas foram preservadas. Checkpoint da entrada:
`radar-antes-revisao-budget-tempo.zip`, nos artefatos locais. O diff exclusivo está em
`radar-budget-tempo.diff`. Arquivos operacionais/credenciais dos smokes permanecem fora do Git.

## Testes obrigatórios e regressão

Os 14 casos iniciais do teste novo foram rodados antes da alteração: sete falharam, incluindo a
progressão para P3 e o limite exato de 95 segundos. Depois da correção e da inclusão de três casos
adicionais, os **17 casos passaram**, sem chamadas externas. A fixture HTTP usa o href relativo já
contratado pelo parser existente; nenhuma regra de identidade/coverage foi relaxada para fazê-la passar.

| Caso | Evidência local |
|---|---|
| A | Prazo único de 120s; P1=5,8s e P2=5,5s: P3 inicia com 108,7s e a sequência pode concluir |
| B | 100s permitem Firecrawl, mesmo sem os 110s do pior caso somado |
| C | Falha Firecrawl deixando 35s: HTTP não inicia; `limite_tempo`; anúncios anteriores preservados |
| D | Falha com 59s: fallback de 15s inicia e termina com 44s para processamento/finalização |
| E | Restante abaixo de 95s, negativo, NaN ou infinito não inicia página nem consome chamada |
| F | Firecrawl de 60s começando com 95s e HTTP de 15s começando com 50s preservam exatamente 35s |
| G | Dez páginas/dez chamadas continuam sendo o teto; continuação mantém parcial; teto pago independente preservado |
| H | Coverage, baseline/Novo, contratos de evidência e distribuição continuam sob a regressão existente e sem edição |

Casos adicionais comprovam: limite já na primeira página não inventa anúncio; atraso no cache é
descontado antes do envio Firecrawl; preparação do fallback pode tornar seu orçamento insuficiente,
e o último guard impede o envio. Os limites de duração de cada transporte continuam presentes nos
Requests simulados. Não foram usados `.env.local`, credenciais reais ou suites reais da OpenAI.

Resultado focado final: **305 testes passaram em dez arquivos**, cobrindo orçamento, paginação,
evidência Chaves, ponte com PGlite/migrations reais, baseline/Novo, rota autenticada, cache, fallback,
retry e monitor. Isso inclui primeira baseline com zero, repetição com zero, identidade inédita com
um Novo, preservação de first_seen, avanço de last_seen e acesso à base parcial.

Resultado da suíte comum: **7.853 passaram / 6 falharam / 7.859 no total**, em 390 arquivos.
Cinco falhas são as verificações textuais SQL/CRLF de `mensagens-agendadas.test.ts` já documentadas.
A sexta é a oscilação temporal também conhecida de `garimpo-g1-logradouro-mapa.test.ts`: intervalo
medido de 1.092,262ms diante do mínimo esperado de 1.095ms. Nenhum desses domínios foi alterado.
A reexecução isolada do mapa passou: **17/17 testes**, registrada em `radar-budget-tempo-mapa-isolado.log`.
São pendências laterais já registradas na [entrega anterior](RADAR-BAIRRO-UNIVERSO-ENTREGA.md),
sem evidência de bloquear o objetivo de orçamento da paginação. Não foram enfraquecidos seus testes
nem aberta uma frente de correção. Nenhuma suíte do Radar falhou no resultado geral.

TypeScript (`tsc --noEmit`): aprovado. Lint: zero erros, um aviso preexistente `_choices` em
`ia-contrato-requisicao.test.ts:657`. Build (`npm run build -- --webpack`): aprovado com credenciais
pagas/privilegiadas desabilitadas. Links locais e `git diff --check` conferidos no fechamento.

Logs locais: `radar-budget-tempo-antes.log`, `radar-budget-tempo-focados-final.log`,
`radar-budget-tempo-suite-completa.log`, `radar-budget-tempo-typescript.log`,
`radar-budget-tempo-lint.log` e `radar-budget-tempo-build.log`, em
`C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/`.

## Invariantes e limitações

Comparação por bytes com o checkpoint confirmou **nenhuma mudança** em:
coverage Chaves, ponte de ingestão/baseline/Novo, rota autenticada e seu `maxDuration`, monitor/scheduler,
schema e migration. Os limites de páginas/chamadas continuam com padrão 10/10; as funções que os
configuram/reservam foram preservadas. Freshness, native IDs, geografia e universo também não mudaram.

Coverage parcial/desconhecida continua sem baseline e sem Novo certificado; atingir teto não prova
completude. A primeira coleta válida continua formando baseline com zero Novos. A distribuição
privada e o direito de consultar anúncios parciais, com links/preços/localização/vistos/repetidos,
seguem preservados. RLS e ações privadas não foram alterados.

A correção permite tentar P3 quando couber no deadline; não garante coverage completa em qualquer
latência ou universo. Aquisições lentas ainda podem terminar por `limite_tempo`, mantendo a margem
segura e os anúncios adquiridos. Nada foi iniciado para as 3.080 ofertas ou para novos recortes.

**Validação automatizada concluída, mas o fluxo real não foi exercitado nesta revisão. Aguardando
smoke manual de rerun autorizado separadamente.** Este gate não executou aquisição paga nem rodada 2.
Os dois transportes de smoke permanecem fechados e o servidor dedicado continua encerrado.

Próximo roteiro, somente após autorização: mesma busca salva e universo de Jardim Tókio; confirmar
barreira, adquirir páginas dentro de 10/10 e do prazo existente, registrar orçamento/URLs/IDs/total/fim,
coverage, baseline/zero e acesso aos anúncios. Se houver blocker, parar e registrá-lo sem ajustar regras
no ensaio. Não executar rodada 2 por consequência de um eventual PASS da primeira.

**STOP após implementação e validação local. Sem smoke pago automático, alteração de scheduler,
Supabase remoto, Production, commit, push ou deploy.**
