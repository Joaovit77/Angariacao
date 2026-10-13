# Radar R6.0c-B2.6-B1 — Venda local

**PASS R6.0c-B2.6-B1 LOCAL.**

Data: 13/10/2026. Checkpoint restrito à implementação e validação local.
Sem commit, push, Preview ou Production.

## 1. Base canônica

`git fetch origin --prune` executado. `origin/main` e HEAD inicial do worktree:
`6b0f2582432bde90807cbace6244742764c64e9d`. Production informada pelo usuário:
`dpl_Hhwync6JDfQnd35ofLTiKegcp7oT`; nenhuma consulta ou alteração remota foi
necessária para este checkpoint. Há 83 migrations versionadas, última
`20261011203141_radar_ofertas_por_finalidade.sql`.

## 2. Branch, worktree e rollback

Branch: `codex/radar-r6-0c-b2-6-b1-venda-zap-viva-chaves`.
Worktree novo: `C:/Users/Corretor/.codex/worktrees/radar-b1-venda/Angariacao`.
Criado exatamente de `origin/main`, sem reutilizar ou modificar o trabalho B0.
O checkout inicial `codex/main` e seus diretórios não rastreados foram preservados.
O ponto de rollback permanece no SHA acima; todas as mudanças B1 estão sem commit
e sem staging, disponíveis para revisão.

## 3. Arquitetura auditada

| Portal | Builder em `servidor/centralAngariacao.ts` | Transporte | Parser Venda |
| --- | --- | --- | --- |
| ZAP | `urlZap`, URLs Casa/Apartamento comprovadas com `/venda/`, `onde` e `tipos` | Aquisição compartilhada Firecrawl; HTML/cache antes do parsing | `extrairVendaRadar`, cards `rp-property-cd` |
| Viva Real | `urlVivaReal`, `/venda/parana/londrina/{tipo}_residencial/` | Aquisição compartilhada; navegador alternativo também usa parser completo | `extrairVendaRadar`, links `DS-Card` |
| Chaves | `urlChaves`, `/{casas,apartamentos}-a-venda/pr-londrina/` | Aquisição compartilhada Firecrawl/fallback; parser sobre HTML completo | `extrairVendaRadar`, link `/imovel/.../id-N/` |

Fluxo comum: builder → transporte → `extrairAnunciosFirecrawl` → parser Venda →
`comCaracteristicasDoAnuncio` → `anuncioAdmitidoRecorteRadar`/capability →
`finalizarColetaCentralAngariacao` → `prepararRegistro` → RPC B0
`registrar_comparavel_mercado` → `comparaveis_mercado` → observações.
O caminho Venda preserva a finalidade retornada pelo parser; não a reclassifica
durante a normalização. A persistência B0 não foi editada.

## 4. Arquivos e classificação do delta

**A — produção:** `web/lib/calculo/aquisicaoRadar.ts`,
`web/lib/calculo/identidadeVendaRadar.ts`, `web/lib/servidor/centralAngariacao.ts`,
`web/lib/servidor/firecrawlCentralAngariacao.ts` e
`web/lib/servidor/parserVendaRadar.ts`.

**B — testes/fixtures:** suíte `web/tests/radar-venda-b1.test.ts`; integração
`web/integration/radar-b1-venda-local.test.ts`; configuração
`web/vitest.radar-b1-local.config.ts`; seis HTMLs, manifesto e README em
`web/tests/fixtures/radar-venda-b1/`; quatro runners em
`web/tests/harness/radar-r6-0c-b2-6-b1/`; atualização de expectativas de capacidade
nos sete arquivos de testes de aquisição/ZAP/Viva/Chaves existentes listados pelo Git.

**C — docs:** `PROJECT.md` descreve o contrato permanente; este relatório registra
a validação. Nenhum arquivo de UI/CSS foi modificado.

## 5. ZAP — contrato

Card individual ligado por URL/ID ao Product, à Offer e ao target. BuyAction
explícito e PriceSpecification BRL concordante com Offer.price e preço principal.
House/Apartment do mesmo ID não pode contradizer o tipo textual. RentAction,
agrupados, links não individuais, divergências e ambiguidades são recusados.
O caminho de Locação e `precoAluguelZap` permanecem intactos.

## 6. Viva Real — contrato

Product com ID nativo e URL individual; Offer.url e BuyAction.target devem apontar
para a mesma URL canônica. Card e Product.name devem concordar no tipo. Preço BRL
concordante nas três fontes. Duplicação literalmente idêntica representa um item;
qualquer variação estrutural do Product é ambígua e recusada. O parser de Locação
permanece intacto.

## 7. Chaves na Mão — contrato

Offer individual dentro de RealEstateListing, URL `/imovel/.../id-N/`, itemOffered
com @id correspondente e SellAction explícito conforme a captura. Offer.price BRL
deve coincidir com `p[aria-label="Preço"] b`. Tipo textual, tipo de itemOffered e
geografia publicada devem ser coerentes. `/lancamento`, comercial, agrupados e
preço “a partir de” são recusados. O parser de Locação permanece intacto.

## 8. Identidade

Hosts HTTPS fixos por portal, caminho individual, ID nativo, URL canônica sem
query/fragmento e vínculos estruturados coerentes. Não há índice de card, título,
preço, endereço isolado, hash de HTML ou URL de busca como identidade.

## 9. Finalidade

ZAP/Viva: BuyAction. Chaves: `https://schema.org/SellAction`. Somente após comprovar
o contrato individual o parser emite `finalidadeObservada=venda`. Ausência ou
Locação observada não é substituída pelo filtro; a admissão rejeita antes da RPC.
O guard SQL B0 continua rejeitando Venda sem observação explícita.

## 10. Preço

Preço total positivo e finito, moeda BRL e concordância estrutural/visual.
Condomínio e IPTU ocupam campos separados; divergência entre fontes de condomínio
deixa esse acessório nulo. Não se aceita condomínio, IPTU, mensalidade, parcela,
entrada, direitos, repasse, valor por m², preço antigo riscado ou “a partir de”
como preço total. Nenhum preço é extraído do slug ou da faixa solicitada.

## 11. Tipo

Casa/Apartamento vêm do título individual e são confrontados com o nome do
Product/Offer e referências estruturadas disponíveis. O recorte solicitado apenas
restringe; não preenche o observado. Sobrado, Condomínio, Kitnet, Studio e Loft
não são promovidos. Os contratos anteriores de Locação foram preservados.

## 12. Negativos e evidência original

Casos por portal incluem finalidade ausente/Locação, link individual ausente,
ID/Offer URL/target divergentes, tipo textual/estruturado incompatível, preço
divergente/acessório/por m², moeda incorreta, agrupados/lançamentos, comercial,
direitos, Sobrado e objetos contraditórios. ZAP/Viva também cobrem
PriceSpecification divergente, acessória e em moeda diferente,
além de House/Apartment contraditório. Duplicações idênticas são deduplicadas.

O discovery original foi localizado no chat B2.6-A e confirmado no cache do
worktree `radar-r6-0c-b2-6-a-venda-discovery`, incluindo relatório, manifestos e
capturas 3–8. Os seis SHA-256 do HTML original foram conferidos antes da extração.
As fixtures preservam relações/IDs/preços/seletores; não incluem contatos,
anunciantes, sessão, hidratação ou HTML completo. O manifesto registra os hashes.

O confronto offline com as capturas completas admitiu, conservadoramente:
ZAP Casa 23/Apartamento 17; Viva Casa 17/Apartamento 17; Chaves Casa 12/Apartamento 10.
Essas contagens não atestam completude. São mais restritas que a triagem do discovery
quando há ambiguidade, duplicação ou descrição comercial incompatível.

## 13. Matriz antes/depois

| Portal | Locação antes/depois | Venda antes | Venda B1 local |
| --- | --- | --- | --- |
| ZAP | 2/2 → 2/2 | 0/2 | 2/2 |
| Viva Real | 2/2 → 2/2 | 0/2 | 2/2 |
| Chaves na Mão | 2/2 → 2/2 | 0/2 | 2/2 |
| OLX | 2/2 → 2/2 | 0/2 | 0/2, bloqueada |
| Wimoveis | 2/2 → 2/2 | 0/2 | 0/2, bloqueada |
| Total | 10/10 → 10/10 | 0/10 | 6/10 |

Suporte restrito a Londrina/PR, primeira página, sem bairro. Sem paginação,
promessa de recência, completude, baseline global ou implementação de “Novo”.

## 14. Testes de parser

A suíte B1 usa as seis fixtures derivadas das capturas e negativos adversariais.
Testa também o transporte controlado passando pelo parser de produção.
174/174 passaram no delta final: ZAP 60/60, Viva Real 60/60, Chaves 52/52 e
bloqueios OLX/Wimoveis 2/2 (cada caso verifica ambos os tipos).

## 15. Testes de finalidade

Para os seis recortes: solicitado Venda + observada ausente → zero escrita;
observada Locação → zero escrita; observada Venda comprovada → escrita com
`finalidade=venda`, `finalidade_observada=venda` e preço integral. O teste de rota
ZAP também prova que HTML real minimizado de Locação não vira oferta Venda.

## 16. Mutantes

7/7 mortos por asserções; zero sobrevivente. Controle passou. Checks removidos:
finalidade observada, BuyAction, ID do Product, preço principal, preço acessório;
promoção indevida de OLX; troca Venda→Locação. Originais restaurados ao final.
Nenhuma migration ou implementação B0 foi mutada neste checkpoint.

## 17. Regressão dirigida

Primeira execução aprovada: 460/460, 15 arquivos, incluindo capacidades, builders,
parsers, transporte, normalização, Central/Radar, comparáveis, persistência B0,
referências de Avaliação e Locação multiportal. O delta final foi novamente coberto
pela suíte integral e pelos controles finais de mutantes/smoke.
O subconjunto desses 15 arquivos na integral final passou em 480/480.
As expectativas antigas de bloqueio dos seis recortes foram atualizadas por
mudança explícita de requisito. Nenhum contrato funcional de Locação foi removido.

## 18. Stack local

Stack nova `radar-b1-local`: PostgreSQL 17/pgvector, GoTrue, PostgREST e Kong;
API `127.0.0.1:56321`, banco `56322`, Next `56330`. Containers B0 e demais stacks
existentes preservados. Reconstrução pelo procedimento agregado já aprovado:
baseline histórico + migrations posteriores, incluindo B0, equivalente ao schema
das 83 migrations; não se afirma um novo ledger remoto ou migration criada.

O transporte de teste intercepta as seis URLs comprovadas e retorna somente suas
fixtures. Qualquer outro fetch externo falha. Auth, Next, PostgREST, RPC e RLS são
reais locais; credenciais sintéticas ficam exclusivamente no cache ignorado.

## 19. Persistência Venda 6/6

Cada recorte foi requisitado no endpoint Next real, passou por parser, normalização,
preparação, RPC B0 e observações. Preços: ZAP Casa 485.000/Apt 699.440;
Viva Casa 349.570/Apt 720.000; Chaves Casa 265.000/Apt 530.000. Todos com
`finalidade=venda`. Reobservação mantém uma oferta, sem duplicar identidade.
UUIDs e histórico estão em `evidencias-local.json`, no cache desta rodada.

## 20. Collision smoke

Mesmo usuário, portal, ID `SYNTHETIC-123`, URL e fingerprint físico:
dois UUIDs distintos. Locação 3.200→3.300; Venda 650.000→640.000.
Quatro observações ligadas às ofertas corretas. Reobservações reutilizam os UUIDs.
Nenhum overwrite cruzado ou fusão de históricos.

## 21. RLS/autoria

Conta B não atualiza oferta A, não insere fingindo A e não lê histórico A.
RPC com `user_id=A` sob sessão B grava para B, obedecendo `auth.uid()`.
Troca de finalidade é rejeitada pelo trigger. Venda sem observação ou observada
Locação é recusada pelo guard SQL. Nenhuma policy, grant ou autenticação mudou.

## 22. Locação 10/10

Os dez recortes mantêm parsers/contratos automatizados e finalização/reobservação
no banco local real, uma oferta por identidade/finalidade. Os parsers específicos
de Locação não foram editados. Aquisição ao vivo não foi realizada.

## 23. Venda local 6/10

Os seis recortes B1 retornam HTTP 200 com um anúncio válido por fixture e escrita
confirmada. Não são sucessos vazios ou validações apenas de mocks de RPC.
O smoke final completo passou em 12/12 casos agregados.

## 24. OLX/Wimoveis

Casa e Apartamento de ambos continuam HTTP 422 antes da aquisição. Matriz e testes
impedem promoção incidental. Não houve implementação de parser/builder Venda para eles.

## 25. Avaliação e UI

Referência Radar→Avaliação e resolução de IDs continuam escolhendo Locação,
mesmo com Venda da mesma identidade mais recente. Conta B recebe 404 para a
referência privada A. Nenhuma liberação ou alteração de Avaliação Venda.

Smoke visual no build local: cartão sintético de R$ 3.300 → Avaliar → “Dados
preenchidos a partir do Radar”, Locação ativa, Rua Sintética, 123, Centro,
Londrina/PR, Apartamento, 80 m², dois quartos. Nenhum cálculo ou aquisição acionado.
A aba limpa registrou zero erro/warning. O primeiro login teve um erro transitório
de bootstrap; consultas diretas às seis tabelas e novo carregamento passaram.

A Central atual solicita Locação explicitamente; não foi acrescentado seletor de
finalidade nem redesenhada a tela. A habilitação Venda B1 é do contrato de aquisição,
endpoint e persistência. Nenhum ajuste visual/CSS, inclusive incidental, foi feito.

## 26–28. Suítes integrais e comparação

Exportação limpa do SHA base, mesma instalação de dependências, `maxWorkers=2`,
sem build ou outras suítes integrais concorrentes: 7.139 passed / 5 failed / 7.144 total.
Os nomes exatos e resultados B1 finais constam abaixo. Não foi assumido baseline fixo.

A primeira integral B1 ainda continha duas expectativas de capacidade anteriores
ao requisito B1, depois atualizadas, e uma falha de temporização do mapa. O mesmo
teste temporal foi reexecutado na exportação limpa: 16 passed / 1 failed / 17 total,
reproduzindo a asserção de espera de 1,1 s. Teste e implementação de mapa não mudaram.
As falhas preexistentes não foram corrigidas ou mascaradas.

A integral do delta final com dois workers registrou 7.305 passed / 6 failed /
7.311 total: as cinco falhas da base e o guard estrutural
`localizacao-radar-fronteira.test.ts`, “a classificação só é consumida pelo monitor
(telemetria) e pelo score”. O scanner AST levou 5.993 ms, excedendo o timeout padrão
de 5 s; passou em 5/5 isoladamente (primeiro caso: 4.668 ms, contra 4.683 ms na base).
Nenhuma asserção, timeout ou implementação desse guard foi alterada. A integral
foi então repetida com um worker, para evitar disputa de recursos; resultado abaixo.

## 29–32. Quality gates

TypeScript `--noEmit`: PASS. ESLint: PASS, zero erros; único warning preexistente
`tests/ia-contrato-requisicao.test.ts:657`, `_choices` não utilizado.
`git diff --check`: PASS. Build Next 16.3.1 de produção local: PASS, 68 páginas.

A primeira tentativa de build encontrou um ciclo no junction temporário criado
para compartilhar dependências com a exportação-base. Somente esse junction foi
removido, e o build passou; nenhum ajuste no produto foi necessário.

## 33–35. Externos e banco

Firecrawl real=0; OpenAI/embeddings=0; RapidAPI=0; WhatsApp=0; Sophia=0;
Supabase remoto=0 operações; Production write=0; migration nova=0;
mudança RLS=0; alteração da persistência B0=0; OLX Venda=0; Wimoveis Venda=0;
R6.1/R6.2=0. Houve apenas fetch Git e leituras de documentação como suporte.
Nenhuma credencial remota foi carregada. Nenhum commit, push ou deploy.

## 36. Riscos, limites e validação manual

Suíte global mantém falhas preexistentes explicitadas abaixo. A seleção é
conservadora: mudanças futuras no HTML/JSON-LD podem reduzir resultados e falham
fechadas. Recência/completude não foram comprovadas. Portais ao vivo, Preview e
Production não foram exercitados, por escopo. O fluxo real solicitado LOCAL foi
exercitado; não há smoke manual local pendente para este checkpoint.

Para repetir a revisão local, usar somente a stack B1 e seu transporte controlado:
confirmar seis HTTP 200 com escrita/histórico, quatro HTTP 422, dois UUIDs na colisão,
isolamento das contas e handoff de Locação. Não iniciar aquisição paga ou publicação
como parte desse roteiro. A UI permanece no escopo anterior de Locação.

## 37. Evidências e estado final

Cache ignorado: `web/node_modules/.cache/b1/` (base, suítes, smoke, mutantes,
schema, tipos, lint, build, capturas originais analisadas, console e screenshot).
Resultados da base também em `web/node_modules/.cache/baseline-full.json` e
`mapa-base.json`. Credenciais e HTML bruto não são entregues ao Git.

Parado para revisão do delta local. Não iniciar B2.6-B2.

## Resultado final consolidado

| Validação | Passed | Failed | Total |
| --- | ---: | ---: | ---: |
| Base limpa, 2 workers | 7139 | 5 | 7144 |
| B1 final, 1 worker | 7306 | 5 | 7311 |
| Contratos B1/parser/finalidade/transporte | 174 | 0 | 174 |
| Regressão dirigida final, subconjunto de 15 arquivos da integral | 480 | 0 | 480 |
| Smoke real local | 12 | 0 | 12 |
| Mutantes mortos | 7 | 0 | 7 |

Mesmas versões de Node/dependências e máquina. Apenas o número de workers da
integral final foi reduzido; asserções e timeouts permaneceram originais.
O guard de localização e o teste temporal passaram na integral serial.
**Zero falha nova atribuível ao B1. A suíte global não está sem falhas.**

### Nomes exatos das cinco falhas mantidas

| Arquivo | Teste | Base limpa | B1 final |
| --- | --- | --- | --- |
| mensagens-agendadas.test.ts | claim_mensagens_agendadas vence linhas presas em processando no schema canônico, uma reserva de consolidação órfã é tratada ANTES da regra genérica, como consolidação interrompida | Falha | Falha |
| mensagens-agendadas.test.ts | claim_mensagens_agendadas vence linhas presas em processando no migration M3/M4, uma reserva de consolidação órfã é tratada ANTES da regra genérica, como consolidação interrompida | Falha | Falha |
| mensagens-agendadas.test.ts | M3/M4 — reserva de consolidação e efetivação atômica no schema canônico, `efetivar_consolidacao_contato` é definer com search_path vazio, só service_role, e fecha tudo pela reserva na mesma conta | Falha | Falha |
| mensagens-agendadas.test.ts | M3/M4 — reserva de consolidação e efetivação atômica no migration M3/M4, `efetivar_consolidacao_contato` é definer com search_path vazio, só service_role, e fecha tudo pela reserva na mesma conta | Falha | Falha |
| mensagens-agendadas.test.ts | M3/M4 — reserva de consolidação e efetivação atômica no migration 1a-C2.1b.2, `efetivar_consolidacao_contato` é definer com search_path vazio, só service_role, e fecha tudo pela reserva na mesma conta | Falha | Falha |

### Inventário final do Git

29 arquivos no delta: 5 de produção, 22 de testes/fixtures/harness e 2 de documentação.
Nada staged. HEAD permanece na base canônica. Sem migration nova, alteração SQL/RLS,
commit, push, Preview, Production ou início de B2.6-B2. Servidores Next temporários
encerrados; stack B1 e evidências locais preservadas para revisão.

```text
 M ../PROJECT.md
 M lib/calculo/aquisicaoRadar.ts
 M lib/servidor/centralAngariacao.ts
 M lib/servidor/firecrawlCentralAngariacao.ts
 M tests/aquisicao-radar-capacidade.test.ts
 M tests/aquisicao-radar-execucao.test.ts
 M tests/aquisicao-radar-transporte.test.ts
 M tests/locacao-chaves-wimoveis.test.ts
 M tests/viva-real-locacao.test.ts
 M tests/zap-casa-fluxo.test.ts
 M tests/zap-casa-radar.test.ts
?? ../docs/RADAR-R6.0c-B2.6-B1-RELATORIO-LOCAL.md
?? integration/radar-b1-venda-local.test.ts
?? lib/calculo/identidadeVendaRadar.ts
?? lib/servidor/parserVendaRadar.ts
?? tests/fixtures/radar-venda-b1/README.md
?? tests/fixtures/radar-venda-b1/chaves-na-mao-apartamento.html
?? tests/fixtures/radar-venda-b1/chaves-na-mao-casa.html
?? tests/fixtures/radar-venda-b1/manifesto.json
?? tests/fixtures/radar-venda-b1/viva-real-apartamento.html
?? tests/fixtures/radar-venda-b1/viva-real-casa.html
?? tests/fixtures/radar-venda-b1/zap-apartamento.html
?? tests/fixtures/radar-venda-b1/zap-casa.html
?? tests/harness/radar-r6-0c-b2-6-b1/mutantes.mjs
?? tests/harness/radar-r6-0c-b2-6-b1/preparar-local.mjs
?? tests/harness/radar-r6-0c-b2-6-b1/smoke-local.mjs
?? tests/harness/radar-r6-0c-b2-6-b1/transporte-local.mjs
?? tests/radar-venda-b1.test.ts
?? vitest.radar-b1-local.config.ts
```

**PASS R6.0c-B2.6-B1 LOCAL. Parado para revisão.**

