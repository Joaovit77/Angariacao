# Radar R6.0c-B2.6-B2 — OLX e Wimoveis Venda local

**PASS R6.0c-B2.6-B2 LOCAL.** Checkpoint exclusivamente local;
sem commit, staging, push, Preview, deploy ou Production. B1 permanece encerrado.

## 1–3. Base, branch, worktree e HEAD

`git fetch --prune` foi executado no checkout inicial. `origin/main` confirmado:
`43b4708a7fe1ed40d27557ec2fa697cca0231e0f`, exatamente o SHA aprovado.
O checkout inicial `codex/main`, em outra revisão, e seus arquivos preexistentes
foram preservados. Nenhum avanço foi absorvido.

Branch: `codex/radar-r6-0c-b2-6-b2-venda-olx-wimoveis`.
Worktree: `C:/Users/Corretor/.codex/worktrees/radar-b2-venda-olx-wimoveis/Angariacao`.
HEAD inicial e final: `43b4708a7fe1ed40d27557ec2fa697cca0231e0f`.
O ponto de rollback é esse SHA; todo o delta está sem commit e sem staging.
Production informada pelo usuário: `dpl_4AoUmr7wgTsFfxKaQmuTgNiaHM73`.
Nenhuma consulta ou alteração em Production foi feita.

## 4. Delta completo por categoria

**A — produção (6)**

- `web/lib/calculo/aquisicaoRadar.ts`
- `web/lib/calculo/identidadeVendaRadar.ts`
- `web/lib/servidor/centralAngariacao.ts`
- `web/lib/servidor/firecrawlCentralAngariacao.ts`
- `web/lib/servidor/parserOlx.ts`
- `web/lib/servidor/parserVendaOlxWimoveis.ts`

**B — testes (9)**

- `web/integration/radar-b2-venda-local.test.ts`
- `web/tests/aquisicao-radar-capacidade.test.ts`
- `web/tests/aquisicao-radar-execucao.test.ts`
- `web/tests/aquisicao-radar-transporte.test.ts`
- `web/tests/monitor-radar-angariacao.test.ts`
- `web/tests/olx-locacao.test.ts`
- `web/tests/radar-venda-b1.test.ts`
- `web/tests/radar-venda-b2.test.ts`
- `web/vitest.radar-b2-local.config.ts`

**C — fixtures/harness (9)**

- `web/tests/fixtures/radar-venda-b2/manifesto.json`
- `web/tests/fixtures/radar-venda-b2/olx-apartamento.html`
- `web/tests/fixtures/radar-venda-b2/olx-casa.html`
- `web/tests/fixtures/radar-venda-b2/wimoveis-apartamento.html`
- `web/tests/fixtures/radar-venda-b2/wimoveis-casa.html`
- `web/tests/harness/radar-r6-0c-b2-6-b2/mutantes.mjs`
- `web/tests/harness/radar-r6-0c-b2-6-b2/preparar-local.mjs`
- `web/tests/harness/radar-r6-0c-b2-6-b2/smoke-local.mjs`
- `web/tests/harness/radar-r6-0c-b2-6-b2/transporte-local.mjs`

**D — documentação (3)**

- `PROJECT.md`
- `docs/RADAR-R6.0c-B2.6-B2-RELATORIO-LOCAL.md`
- `web/tests/fixtures/radar-venda-b2/README.md`

## 5–10. Contratos, identidade, finalidade, preço e agrupados

Antes: Locação 10/10, Venda 6/10; OLX/Wimoveis Venda eram recusados antes de aquisição.
Agora: os quatro recortes faltantes usam parsers exclusivos de Venda. Builders usam
as URLs de Venda comprovadas. O dispatcher, a admissão e a normalização existentes
transportam `finalidadeObservada=venda` até a preparação da RPC B0.

**OLX:** `section.olx-adcard` → um link individual → ID terminal e URL canônica
concordantes com `ads[].listId/url`, extraídos como JSON de `self.__next_f.push`.
Não há posição, título, índice ou hash como identidade. Objetos completos duplicados
são ambíguos; cards duplicados não produzem ofertas duplicadas. O leitor RSC existente
foi somente exportado, sem mudança de algoritmo ou contrato de Locação.

Categoria e `real_estate_type` precisam concordar: `Venda - casa em rua pública`
ou `Venda - apartamento padrão`, com `re_types=Padrão`. O título individual
precisa observar o tipo correspondente; o pedido apenas restringe. Ausência,
Aluguel, subtipo ou conflito não são preenchidos a partir do filtro.

`ads[].price`, `priceValue` e um único bloco `.olx-adcard__price` precisam indicar
o mesmo preço integral positivo. Concordância numérica não supera semântica de
direitos, entrada, repasse, parcela, sinal ou financiamento no título, descrição
ou texto individual disponível. Preço antigo, badge promocional, installments,
valor riscado e promoção ambígua são recusados. Grouped, empreendimento,
identidade insegura e “a partir de” também são recusados, sem persistência.

**Wimoveis:** `data-id/data-to-posting` → `listStore.listPostings[].postingId/url`
→ ação do posting → `SellAction.object.url` JSON-LD. Todos apontam para a mesma
URL individual HTTPS `/propriedades/...-N.html`, em host fixo. O estado é lido
como JSON de `window.__PRELOADED_STATE__`, com delimitação de objeto que respeita
strings; scripts nunca são executados. Posting ou ação duplicados são ambíguos.

Exige `SellAction` nas duas fontes e uma única operação `Venda`, ID `1`.
`PROPERTY`, `data-posting-type=PROPERTY` e lista de unidades vazia são obrigatórios.
`DEVELOPMENT`, unidades agrupadas, lançamento e “a partir de” falham fechados.
Tipo textual de posting/card/generatedTitle, categoria e tipo das ações precisam
concordar. Sobrado, condomínio, Kitnet, Studio, Loft e Flat não são promovidos.

Exige um preço individual em `prices`, `currency=R$`, `currencyId=3`, amount
positivo e formattedAmount concordantes com o único `POSTING_CARD_PRICE`.
Condomínio e IPTU são lidos separadamente de expenses/iptu, sem somá-los nem
usá-los como fallback. Múltiplos preços, moeda diferente, promoção percentual,
parcialidade e preço antigo são recusados.

As quatro fixtures vieram das capturas aprovadas 1/2/9/10. Os quatro SHA-256
originais foram conferidos. O manifesto inclui hashes das fixtures minimizadas.
Casa Wimoveis usa ID 3016632657: o exemplo inicial do discovery menciona condomínio
na descrição, portanto não foi promovido a positivo. Contatos, anunciantes e
sessões não foram versionados. Nenhuma fixture de Locação ou do B1 mudou.

Confronto offline com os HTMLs completos: OLX Casa 27/Apartamento 27; Wimoveis
Casa 6/Apartamento 19 admitidos. Não representam completude ou recência.

## 11–14. Capability e regressões de Locação/Venda/B1

| Portal | Locação antes/depois | Venda antes | Venda B2 local |
| --- | --- | --- | --- |
| OLX | 2/2 → 2/2 | 0/2 | 2/2 |
| ZAP | 2/2 → 2/2 | 2/2 | 2/2 |
| Viva Real | 2/2 → 2/2 | 2/2 | 2/2 |
| Chaves na Mão | 2/2 → 2/2 | 2/2 | 2/2 |
| Wimoveis | 2/2 → 2/2 | 0/2 | 2/2 |
| Total | 10/10 → 10/10 | 6/10 | 10/10 |

Primeira página de Londrina/PR, sem bairro. Nenhuma ampliação de geografia,
paginação, recência, completude, filtro de portal ou Avaliação Venda.
Os parsers de Locação e o parser Venda B1 permanecem com o comportamento anterior.
Apenas o helper RSC OLX ganhou export para reutilização.

Os seis contratos B1 passam novamente nas mesmas fixtures. Na suíte B1, somente
os dois testes finais que proibiam OLX/Wimoveis foram atualizados para o requisito
B2; não houve ajuste nos 172 testes dos contratos ZAP/Viva/Chaves. Os outros
cinco arquivos de testes alterados atualizam a matriz e mantêm bloqueios por
geografia/capacidade inválida. Nenhuma expectativa funcional de Locação foi removida.

## 15–17. B0, smoke real local e colisão

Stack nova `radar-b2-local`, API 127.0.0.1:56421, PostgreSQL 56422, Next 56430.
Docker local com Auth/GoTrue, PostgREST e Kong. As outras stacks foram preservadas.
Schema reconstruído pelo procedimento já validado: baseline histórico
20260828115824 + migrations posteriores, equivalente ao schema das 83 migrations
versionadas; última 20261011203141_radar_ofertas_por_finalidade.
Não se afirma um novo ledger remoto nem 83 arquivos aplicados individualmente.
O harness verifica quantidade/última migration antes de reconstruir somente
os schemas da stack descartável B2.

Smoke: 14/14 casos agregados passaram. Cada um dos dez recortes Venda fez POST
real ao endpoint Next → transporte de fixture → parser de produção → normalização
→ finalização → RPC B0 → banco → observações. Reobservação não duplica oferta.
As quatro ofertas B2 também receberam Locação da mesma identidade externa:
dois UUIDs, atualizações e históricos independentes, sem overwrite cruzado.

A finalidade observada chega ao B0; ausência ou conflito é recusado antes da RPC.
RPC real também recusa Venda sem observação e troca de finalidade. Conta B não
escreve fingindo A nem lê o histórico A. Nenhum contrato B0 foi editado.

O caso `SYNTHETIC-123`, no mesmo usuário, portal, URL e fingerprint físico:
Locação 3.200→3.300 e Venda 650.000→640.000, com dois UUIDs distintos e quatro
observações vinculadas corretamente. Valores/UUIDs estão na evidência local.

| Finalidade | UUID | Histórico de preço |
| --- | --- | --- |
| Locação | `b4e8336d-1876-4860-8036-93a3f4f66bce` | 3.200 → 3.300 |
| Venda | `17b25850-0aa0-4321-a235-ff0accdfe65f` | 650.000 → 640.000 |

Os dez recortes Locação preservaram finalização, reobservação e persistência local.
Os parsers de aquisição Locação foram cobertos pelos testes offline dos cinco portais.

Central/Radar→Avaliação: resolução autenticada escolhe Locação mesmo com Venda
mais recente da mesma identidade. Referência privada acessada por B retorna 404.
Smoke visual no build local: login sintético → referência do Radar → “Dados
preenchidos a partir do Radar”, Locação ativa, Rua Sintética, 123, Centro,
Londrina/PR, Apartamento, 80 m² e dois quartos. Zero erro/warning de console e
zero requisição externa no navegador. Nenhum cálculo ou aquisição foi acionado.
A captura foi inspecionada; nenhum ajuste visual/CSS foi feito. O processo Next
foi encerrado ao terminar. A UI existente permaneceu no escopo de Locação.

## 18. Mutantes

12/12 mortos, 100% dos planejados, zero sobreviventes. Controle 239/239 passou.
Morte exige exit 1 e falha de asserção, não erro de compilação ou inicialização.
O runner restaura o arquivo original em `finally`; não muta B0, schema ou RLS.

1. OLX: aceitar Venda sem contrato observado.
2. OLX: fallback de identidade pela posição do card.
3. OLX: direitos como preço integral.
4. OLX: entrada/repasse/parcela como preço integral.
5. OLX: grouped admitido apesar do sinal de agrupamento.
6. OLX: preço antigo/promocional ambíguo.
7. Wimoveis: dispensar SellAction/operação observada.
8. Wimoveis: DEVELOPMENT/unidades agrupadas como PROPERTY.
9. Wimoveis: “a partir de” como preço individual.
10. Wimoveis: posting com URL incoerente.
11. Wimoveis: operação diferente de Venda.
12. Wimoveis: condomínio/IPTU como fallback de preço.

Cada mutante e as asserções que o mataram estão em `mutantes.json` no cache.

## 19–25. Testes e quality gates

| Validação | Passed | Failed | Total |
| --- | ---: | ---: | ---: |
| Base limpa SHA aprovado, 380 arquivos, 1 worker | 7305 | 6 | 7311 |
| Primeira integral B2, 381 arquivos, 1 worker | 7542 | 8 | 7550 |
| Integral B2 final, 381 arquivos, 1 worker | 7545 | 5 | 7550 |
| Dirigidos iniciais, 16 arquivos | 805 | 0 | 805 |
| Domínio/regressão final, 17 arquivos, sem o teste suplementar de mapa | 858 | 0 | 858 |
| Dirigidos finais incluindo mapa, 18 arquivos | 874 | 1 | 875 |
| Mapa isolado na exportação limpa do SHA base | 17 | 0 | 17 |
| Parser/finalidade/preço/transporte B2 | 239 | 0 | 239 |
| Regressão de contratos B1 | 174 | 0 | 174 |
| Smoke real local agregado | 14 | 0 | 14 |
| Mutantes mortos | 12 | 0 | 12 |

A base limpa foi medida **antes de editar qualquer arquivo do produto**, neste
worktree, com as mesmas dependências instaladas offline. Base e integrais B2 usaram
`node node_modules/vitest/vitest.mjs run --maxWorkers=1 --reporter=json`.
Nenhum build ou outra suíte integral rodou simultaneamente a essas integrais.
Não foi assumido um número histórico de falhas.

A primeira integral identificou duas expectativas antigas de capability no teste
do monitor (OLX Venda proibida). Elas foram atualizadas para manter a recusa fora
de Londrina, conforme a nova capacidade solicitada. Código do monitor e scheduler
não mudou. Também falhou a asserção temporal do mapa: 1093,9843 ms contra 1095 ms;
na regressão suplementar, 1094,075 ms contra 1095 ms. O teste e seu código não foram
alterados, nem seus timeouts/asserções. Passou isoladamente na base e na integral
B2 final. A falha C13B/STACK_TRACE_ERROR da base não se repetiu na final; não se
atribui uma correção ao B2.

**Zero falha nova na integral final. A suíte global mantém cinco falhas
preexistentes e não está integralmente aprovada.** As mesmas cinco asserções
falharam na base limpa e no B2 final:

1. `mensagens-agendadas.test.ts`: claim_mensagens_agendadas vence linhas presas em processando no schema canônico, uma reserva de consolidação órfã é tratada ANTES da regra genérica, como consolidação interrompida.

2. `mensagens-agendadas.test.ts`: claim_mensagens_agendadas vence linhas presas em processando no migration M3/M4, uma reserva de consolidação órfã é tratada ANTES da regra genérica, como consolidação interrompida.

3. `mensagens-agendadas.test.ts`: M3/M4 — reserva de consolidação e efetivação atômica no schema canônico, `efetivar_consolidacao_contato` é definer com search_path vazio, só service_role, e fecha tudo pela reserva na mesma conta.

4. `mensagens-agendadas.test.ts`: M3/M4 — reserva de consolidação e efetivação atômica no migration M3/M4, `efetivar_consolidacao_contato` é definer com search_path vazio, só service_role, e fecha tudo pela reserva na mesma conta.

5. `mensagens-agendadas.test.ts`: M3/M4 — reserva de consolidação e efetivação atômica no migration 1a-C2.1b.2, `efetivar_consolidacao_contato` é definer com search_path vazio, só service_role, e fecha tudo pela reserva na mesma conta.

A comparação completa com mensagens de erro está em
[comparacao-full-final.json](../web/node_modules/.cache/b2/comparacao-full-final.json).
Os logs anteriores foram preservados, incluindo a execução dirigida com falha
temporal; não houve enfraquecimento de teste para obter o resultado final.

- **TypeScript:** `node node_modules/typescript/bin/tsc --noEmit`, exit 0, sem erros.
- **ESLint:** `npm run lint`, exit 0, zero erros. Warning preexistente único:
  `tests/ia-contrato-requisicao.test.ts:657:20`, `_choices` não utilizado; intocado.
- **Build:** `node node_modules/next/dist/bin/next build`, exit 0; Next 16.3.1,
  TypeScript concluído e 68/68 páginas geradas. Configuração só da stack local B2,
  chaves externas vazias, OpenAI desabilitada. Esse build foi usado no smoke visual.
- **Diff-check:** `git diff --check`, exit 0. Verificação adicional de espaço final
  nos 27 arquivos novos/modificados: zero ocorrência. Links/referências conferidos.
- **Capability:** Locação 10/10 e Venda 10/10 comprovadas na suíte B2 e nos
  testes de matriz/builder/execução. Geografia e recortes inválidos continuam bloqueados.
- **Smoke:** 14/14 via Next/Auth/PostgREST/RPC/RLS locais, mais handoff no navegador.
  Dez chamadas de aquisição interceptadas e respondidas por fixtures; zero encaminhamento externo.


## 26–29. Externos, banco remoto e migrations

Firecrawl real=0; OpenAI/embeddings/transcrição=0; RapidAPI=0; WhatsApp=0;
Sophia=0; portais reais=0; Supabase remoto=0 operações; Production=0 alterações.
A interceptação de Firecrawl no smoke só devolve fixtures locais e não encaminha
a requisição. Qualquer outro fetch externo falha. Não foram carregadas credenciais
remotas ou `.env.local`. Houve fetch Git e leituras de documentação oficial,
separados de aquisição e integração funcional.

Nenhuma migration, schema, policy/RLS, índice, trigger ou RPC B0 foi alterado.
Nenhuma UI/CSS, ajuste visual incidental, R6.1/R6.2, scheduler ou novidade global.
Não houve commit, staging, push, Preview ou deploy. B1 não foi reaberto.

## 30. Git, evidências, riscos e revisão

Evidências ignoradas: `web/node_modules/.cache/b2/` — baseline, integral B2,
comparação de falhas, dirigidos, mutantes, schema, smoke, transporte, tipos, lint,
build, captura e console local. Exportação limpa adicional para diagnóstico temporal
em `C:/Users/Corretor/.codex/worktrees/radar-b2-venda-olx-wimoveis/base-limpa-b2-mapa`,
fora do checkout de produto. Credenciais sintéticas ficam apenas nesse cache.

Riscos: contrato conservador pode recusar anúncios legítimos que mencionem
financiamento/entrada ou subtipos não comprovados. Mudança de estrutura do portal
falha fechada. Não há promessa de completude ou recência. As falhas globais
preexistentes permanecem separadas. A UI da Central continua solicitando Locação;
a nova capacidade Venda é do contrato de aquisição, endpoint e persistência.

Portais ao vivo, Preview e Production não foram exercitados, por escopo.
O fluxo real solicitado LOCAL foi exercitado com integrações locais reais e
transporte exclusivamente de fixtures. Nenhuma validação externa fica implícita.

Para revisão/repetição local: usar apenas a stack B2 e o transporte controlado;
rodar os testes dirigidos e `smoke-local.mjs`, confirmar dez HTTP 200 de Venda,
Locação 10/10, dois UUIDs/históricos na colisão, isolamento e handoff de Locação.
Não executar aquisição real, reabrir B1 ou promover como parte desse roteiro.

Estado final: 12 arquivos rastreados modificados e 15 novos, todos sem staging;
27 arquivos no delta, classificados acima. HEAD/origin/main continuam no SHA inicial.
Nenhuma migration, RLS, RPC B0, UI/CSS não relacionada, R6.1/R6.2, scheduler,
novo filtro de portal ou mudança de produto fora de B2. Sem smoke manual local
pendente neste checkpoint. Portais e ambientes externos permanecem fora do escopo.

## 31. Conclusão

**PASS R6.0c-B2.6-B2 LOCAL. Parado para revisão. NÃO COMMIT. NÃO PUSH.
NÃO PREVIEW. NÃO DEPLOY. NÃO PRODUCTION. NÃO AQUISIÇÃO REAL.**
