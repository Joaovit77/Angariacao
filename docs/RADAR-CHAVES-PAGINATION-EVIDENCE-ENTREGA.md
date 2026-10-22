# Radar — revisão da evidência paginada do Chaves

`RADAR_CHAVES_PAGINATION_EVIDENCE_CONTRACT_REVISED_READY_FOR_SMOKE_RERUN`

Data: 22/10/2026. Branch `codex/radar-baseline-novos`, HEAD `0e952d6`, sem commit.
Escopo: adapter/evidence contract do Chaves na Mão. Implementação e validação somente locais.
O [smoke real anterior](RADAR-SMOKE-REAL-JARDIM-TOKIO.md) permanece histórico em HOLD; não houve rerun pago.

Atualização posterior de 22/10/2026: o [rerun real da rodada 1](RADAR-JARDIM-TOKIO-RERUN-RODADA1-20261022.md)
foi autorizado e executado. P2 foi admitida; o ensaio terminou em HOLD por `limite_tempo` antes de P3.
O READY acima identifica a entrega local anterior, não um PASS de baseline real.

## Regra anterior e regra revisada

Antes, cada página precisava publicar sua URL ordinal exata em `RealEstateListing.url`. A URL base
no JSON-LD de P2 encerrava a aquisição como `evidencia_inconsistente`; qualquer ID repetido entre
páginas também fechava o gate. Sem next publicado, o coletor não tentava o ordinal seguinte.

Agora, somente no Chaves, P2+ é admitida pela combinação de pedido exato, HTTP bem-sucedido, URL
efetiva conhecida da própria aquisição, ausência de redirect, sequência contígua, navegação anterior
consistente quando publicada, IDs nativos qualificados, pelo menos um ID novo na página e total
positivo estável/compatível. Retorno efetivo à base, URL final desconhecida, salto, loop, ausência de
progresso, total divergente/excedido e mudança de contexto continuam interrompendo a prova.

`RealEstateListing.url` e canonical **não foram ignorados**: continuam sendo lidos e validados.
Em P2+, só podem identificar a página atual ou a base do mesmo contexto. Quando identificam a base,
o adapter registra `portal_document_url_not_pagination_aware`. URLs documentais de outro bairro,
query estranha, múltiplas canonicals/listagens e navegação materialmente conflitante continuam
fechando o gate. URL documental não é usada para inventar a URL efetiva da aquisição.

Firecrawl conserva `metadata.url` como URL final, `sourceURL` quando disponível e o status do portal;
a URL enviada vem do pedido efetivo. O HTTP direto conserva `Response.url` e `Response.redirected`.
A distinção de campos segue o [contrato público de scrape](https://docs.firecrawl.dev/api-reference/endpoint/scrape)
e a [implementação pública do provedor](https://github.com/firecrawl/firecrawl/blob/main/apps/api/src/scraper/scrapeURL/index.ts#L1126).
Ausência desses fatos em P2+ fecha a prova. O cache preserva transporte, ID, instante e hash da
observação original; conteúdo antigo não recebe fatos de transporte ou horário fabricados.

## Continuação e término

Quando a página não publica next e a união ainda está abaixo do total declarado, o adapter pode
**tentar apenas o ordinal consecutivo da mesma rota**, dentro do teto existente. A tentativa precisa
comprovar seu próprio transporte, contexto e progresso. Total declarado não comprova uma quantidade
presumida de itens restantes, nem garante que essa próxima tentativa produzirá cobertura válida.

Assim, 30/33 em P2 permite tentar P3; não certifica cobertura. A cobertura só pode fechar depois de
adquirir e admitir a página final, reconciliar a união com o total e comprovar ausência de continuação.
Total atingido com next publicado continua aberto. Falha na tentativa, desconhecido, parcial ou teto
antes do fim mantêm baseline ausente e zero Novos certificados. Os limites continuam dez páginas e
dez chamadas pagas por rodada; não foram alterados configuração, scheduler ou monitor do produto.

## Patrocinados repetidos e prova SQL

Sobreposição entre páginas não é rejeitada por si só. O adapter consolida ocorrências **idênticas**
com o mesmo native ID qualificado e preserva a primeira ocorrência. Sem identidade forte, o anúncio
continua disponível para a base privada, sem deduplicação global posicional. Conteúdos divergentes
continuam chegando à ponte, que mantém seu bloqueio conservador para conflito de dados.

Cada página precisa acrescentar pelo menos um native ID. A evidência enviada à RPC atribui cada
identidade à primeira página que a comprovou; `ids_observados` preserva também os IDs repetidos.
URLs documentais, transporte e avisos acompanham o payload persistido. Ocorrências repetidas são
contabilizadas em `resultadosObservados` quando diferem da quantidade de anúncios consolidados.

O validador SQL continua exigindo sequência, IDs únicos, total integral, fim comprovado e vínculo
com anúncios qualificados. **Nenhuma migration ou linha do schema foi alterada nesta revisão.**
A normalização no adapter permite usar o contrato transacional existente sem relaxar o gate global.
Baseline/Novo continuam fail-closed. First_seen, avanço de last_seen entre observações, RLS,
ações privadas, Casa/Apartamento e Locação/Venda permanecem protegidos pelos testes existentes.

## Arquivos alterados nesta revisão

- [Leitura e prova combinada de coverage](../web/lib/servidor/coberturaRadar.ts).
- [Orquestração paginada e consolidação do Chaves](../web/lib/servidor/paginacaoRadar.ts).
- [Proveniência Firecrawl e cache](../web/lib/servidor/firecrawlCentralAngariacao.ts).
- [Proveniência HTTP direto](../web/lib/servidor/fallbackHttpChaves.ts).
- [Serialização da evidência na ponte](../web/lib/servidor/ingestaoRadar.ts).
- [Regressões novas A–H](../web/tests/radar-chaves-evidencia-paginada.test.ts).
- [Regressões paginadas existentes](../web/tests/radar-paginacao.test.ts).
- [Teste transacional e fixtures de transporte](../web/tests/radar-baseline-cobertura-novos.test.ts).
- [Contrato permanente](../PROJECT.md#baseline-cobertura-e-novidade-do-radar).

Além deste relatório, o smoke anterior recebeu apenas uma referência à revisão local. As alterações
anteriores e ainda não commitadas no worktree foram preservadas; não pertencem todas a esta fatia.
Checkpoint anterior: `radar-antes-revisao-evidencia-chaves.zip`, nos artefatos locais deste chat.

## Testes A–H e evidência de regressão

Os 14 casos novos de adapter foram executados antes da correção: seis falharam com o contrato
anterior, incluindo P2 documental na base, progressão até P3 e sobreposição patrocinada. Após a
correção, todos passaram. Isso reproduz o comportamento do blocker, sem copiar contatos ou HTML
bruto do portal para as fixtures versionadas.

| Caso | Comportamento verificado localmente |
|---|---|
| A | P2 pedida/efetiva correta, HTTP 200, JSON-LD/canonical base, IDs novos: admitida e aviso registrado |
| B | P2 repete integralmente IDs: interrompe por inconsistência; anúncios continuam consultáveis |
| C | URL efetiva de P2 volta à base: rejeitada, mesmo com IDs diferentes |
| D | P1→P2→P3 admitidas; total pendente permite tentativa de P3 mesmo sem next publicado em P2 |
| E | 30/33 no teto sem página final: parcial; não inventa término |
| F | Total atingido com next: não certifica coverage |
| G | Página final admitida, sem continuação, com total/união coerentes: elegível para completa |
| H | OLX, Viva Real, ZAP e Wimóveis não recebem o contrato Chaves; regressões compartilhadas preservadas |

Casos adicionais: sobreposição patrocinada com progresso, URL efetiva ausente e canonical de outro
bairro. No banco local em memória (PGlite, migrations reais), o novo teste integrado percorreu:
parcial 30/33 sem baseline/zero Novos e 30 cópias privadas → P3 → baseline com zero → repetição com
zero → identidade inédita com exatamente um Novo. Confirmou first_seen preservado, last_seen
avançado, aviso persistido e patrocinado repetido sem duplicação privada.

As fixtures existentes passaram a informar URL final/status/redirect quando simulam transporte
bem-sucedido; expectativas de baseline, Novo, teto, cache e isolamento não foram enfraquecidas.
O caso de ausência de next passou a simular falha na tentativa seguinte, conforme a mudança de
contrato expressamente pedida: o gate continua parcial, agora após tentar o ordinal consecutivo.

## Resultados das verificações

- Suíte comum: **7.835 passaram / 5 falharam / 7.840 no total**, em 389 arquivos.
- Os cinco arquivos focados de evidência/paginação/ponte/rota/cache totalizam **147 testes**, todos
  aprovados na suíte completa. As demais regressões do Radar, acesso parcial, interface, leitura
  paginada, vistos/repetidos, cron, transporte e outros portais também passaram.
- As cinco falhas ficaram exclusivamente em `mensagens-agendadas.test.ts`, já registradas na
  [entrega anterior](RADAR-BAIRRO-UNIVERSO-ENTREGA.md). As falhas são verificações textuais
  de SQL/CRLF. Esse domínio não foi alterado nesta revisão.
  São backlog lateral, sem evidência de bloqueio do objetivo de paginação/coverage do Radar.
- TypeScript: aprovado (`tsc --noEmit`).
- Lint: zero erros; um aviso preexistente `_choices` em `ia-contrato-requisicao.test.ts:657`.
- Build: aprovado (`npm run build -- --webpack`), com credenciais pagas/privilegiadas desabilitadas.
- Referências locais e `git diff --check`: conferidos ao fechar a entrega.

Logs locais: `radar-revisao-suite-completa.log`, `radar-revisao-typescript.log`,
`radar-revisao-lint.log`, `radar-revisao-build.log` e `radar-revisao-ponte.log`, na pasta de artefatos
`C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/`.
Não foram carregadas credenciais de `.env.local` por testes nem executados ensaios OpenAI reais.

## Contenção operacional do próximo smoke

O transporte temporário do ensaio anterior já bloqueia tanto Firecrawl quanto HTTP externo quando
`rodada: null`. Foi testado localmente por `validar-barreira-local.mjs`, com **fetch totalmente
simulado** em pasta independente do ledger real. Cinco tentativas fora de rodada foram bloqueadas
antes do envio simulado, inclusive após fechamento; nenhuma incrementou o consumo. O teto de dez
foi exercitado com dez respostas simuladas, e a décima primeira foi bloqueada. Não houve rede real.

Prova: `radar-tokio-real-smoke/preflight-barreira-local.json`. Nenhum scheduler/monitor do produto
foi alterado para resolver o ensaio. Ledger real preservado: duas chamadas e dois créditos do smoke
anterior; nenhuma nova chamada nesta revisão. O servidor do produto continua encerrado e o controle
real permanece fechado. As sete varreduras HTTP extras anteriores permanecem registradas como
incidente histórico e não foram reclassificadas como segunda rodada.

## Limites e próxima ação

**Validação automatizada concluída, mas o fluxo real não foi exercitado nesta revisão. Aguardando
smoke manual de rerun.** Os HTML antigos não contêm por si só a prova de URL efetiva exigida; não
foram promovidos retroativamente a coleta completa. A página 3 real não foi adquirida, e 33 não é
constante do produto nem garantia do inventário atual.

Após autorização específica para nova execução, o roteiro é manter a barreira fechada fora da janela,
confirmar o mesmo universo/URL efetiva, adquirir páginas sequenciais dentro do teto, conferir total,
união, término, créditos, baseline/zero e acesso aos anúncios. Repetição fresca só após ausência de
blocker material na primeira rodada. Registrar cache como reutilização, nunca como observação fresca.
Encerrar o servidor/aba e fechar ambos os transportes ao terminar ou interromper. Este roteiro não
constitui autorização para executar o rerun.

Permanecem fora: universo de 3.080, geografia, novos recortes, aumento de cap, scheduler,
RAD-20/Strategy A, Retirados, Supabase remoto e Production. Sem commit, push ou deploy.

**STOP após implementação e validação local. Nenhum smoke pago iniciado automaticamente.**

## Revalidação complementar — 22/10/2026

A implementação acima já existia ao entrar nesta sessão. Foram adicionados somente dois controles
explícitos de loop P2→P2/P3→P2 ao teste de evidência Chaves, mantendo os demais casos e o produto.
A regressão inicial teve 1.477 PASS e dois timeouts de filesystem. Na suíte comum com dois workers,
foram 7.836 PASS/6 FAIL/7.842 testes: cinco falhas de Mensagens já documentadas e um timeout.
Os dois arquivos com timeout passaram isoladamente: 70/70, sem alteração dos limites ou expectativas.
A suíte global não está integralmente aprovada; Mensagens permanece backlog alheio a esta fatia.
TypeScript e build Webpack passaram; lint sem erros, com o aviso preexistente de `_choices`.

A barreira `.mjs` atual foi testada em cópia independente, fetch simulado e ledger próprio: cinco
bloqueios fora da rodada, dez respostas simuladas e bloqueio da 11ª. Controle/ledger/transporte reais
permaneceram byte-exatos e a rodada real continuou fechada. Nenhuma aquisição externa foi executada.
Nenhuma migration/schema ou código de produto foi alterado nesta revalidação; monitor/scheduler intactos.

[Relatório, logs e preservação desta execução](C:/Users/Corretor/Documents/GitHub/Angariacao/.worktrees/radar-chaves-revalidation-20261022/REVALIDACAO.md).
Aguardando smoke manual especificamente autorizado. Nenhum rerun/rodada 2/commit/push/deploy iniciado.
