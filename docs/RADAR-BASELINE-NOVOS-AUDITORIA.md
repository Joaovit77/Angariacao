# Radar — auditoria e proposta de baseline + cobertura + Novo

Data: 21/10/2026. Base escolhida pelo usuário: `0e952d6`, R6.1-B.
Branch de trabalho: `codex/radar-baseline-novos`.

## Limite desta entrega

Auditoria de código e proposta para revisão. Nenhuma implementação, migration ou aplicação de SQL.
O pedido determina: “Se migration for indispensável para este slice: PARAR e apresentar antes de aplicar.”
A implementação depende da ponte transacional descrita abaixo; portanto fica parada nesse limite.
A decisão `RAD20_STRATEGY_A_CURRENT_BOOTSTRAP_COMPOSITION_PAUSED_STRICT_CONTRACT_PRESERVED`
é uma restrição desta retomada. Nenhum código ou artefato dessa composição foi alterado.
Não foram reabertos NtOpenFile, root admission, minifilters, ALT_PARTIAL_PACKAGE_01,
SPEC V1/V2, AD-01 ou H2/B01. Production, Retirados, Docker e secrets permanecem fora do escopo.

## Estado encontrado no código

Os estados abaixo descrevem implementação local, não comprovação de deploy ou do banco remoto.

| Item | Estado | Fonte e comportamento encontrado |
| --- | --- | --- |
| Buscas salvas | IMPLEMENTED | `web/lib/radarAngariacao.ts`: `salvarBuscaRadar` grava busca e resultados iniciais como vistos. O parâmetro chamado baseline é apenas uma lista, sem evidência de cobertura. |
| monitor_navegador | IMPLEMENTED | `verificarBuscaRadar` informa a origem ao cliente da Central; `web/components/central/MonitorRadarAngariacao.tsx` executa o monitor e atualiza pendências. |
| Firecrawl | IMPLEMENTED | `web/lib/servidor/firecrawlCentralAngariacao.ts`: cache, single-flight, retry limitado e parsers; saída principal é uma lista de anúncios. |
| radar_anuncios | IMPLEMENTED | Persistência privada por usuário/busca; UNIQUE em busca + portal + ID; upsert com ignoreDuplicates. |
| Workers/crons | IMPLEMENTED | `web/lib/servidor/monitorRadarAngariacao.ts` e `web/app/api/cron/radar/route.ts`; limites de rodada e relógio diário separado do monitor/manual. |
| Tipo/finalidade | IMPLEMENTED | `web/lib/calculo/aquisicaoRadar.ts`: Casa/Apartamento, Locação/Venda, capacidade e admissão por recorte. Suporte depende da combinação/mercado, não é universal. |
| Identidade global qualificada | PARTIAL | Schema A usa portal + finalidade + ID; contratos de aquisição qualificam parte dos caminhos. O seletor legado usa portal + ID sem gate geral contra fallback. |
| first_seen / last_seen | PARTIAL | `radar_anuncios_globais.primeiro_visto_em/ultimo_visto_em` e triggers B preservam primeira observação e impedem regressão da última. Não há writer do produto nessas tabelas. |
| Baseline | PARTIAL | `radar_integridade.formar_baseline` exige success, proveniência e contagem positiva. É explícita e imutável; não há caller do produto. |
| Cobertura | PARTIAL | Campos em radar_varreduras e diagnósticos dos parsers. Não condicionam a classificação legada. Primeira página e limite de 50 resultados não demonstram universo completo. |
| Deduplicação | PARTIAL | UNIQUE e histórico evitam reinserção. `selecionarAnunciosNovosRadar` não acrescenta chaves encontradas ao Set durante o filtro e não elimina duplicatas dentro da mesma entrada. |
| Coleta global / distribuição | MISSING | Nenhum caller nas áreas web/lib e web/app usa as quatro tabelas globais. Compartilhar HTML no cache não implementa distribuição global persistente. |
| Estado privado | IMPLEMENTED | RLS por usuário no legado; tabelas globais sem acesso de cliente. Isso não comprova ainda isolamento numa distribuição global futura. |
| Novo conforme pedido | MISSING | Seletor compara apenas ausência no histórico da busca; a UI usa pendências/visto para mostrar Novo. Nenhuma baseline válida ou cobertura é exigida. |
| Base não revisada | MISSING | Não há classificação distinta na persistência/leitura/UI. |
| Exclusão da Imobiliária Atual | IMPLEMENTED | Não encontrada exclusão global nos caminhos de Radar/recorte examinados; manter eventual exclusão como critério privado configurável. |
| Carteira | PARTIAL | `web/lib/calculo/repeticaoCentralAngariacao.ts` já reconhece URL/endereço e regras distintas por tipo. Não ampliar matching neste slice. |
| Slice completo sem migration | BLOCKED | As primitivas internas globais não têm ponte no produto; falta vínculo/classificação persistente entre universo, assinatura e anúncio privado e operação atômica para registrar/distribuir. |

## Comportamento anterior e risco

Ao salvar uma busca, os resultados disponíveis são inseridos com visto=true. Nas verificações
seguintes, todo ID ausente no histórico daquela busca é inserido com visto=false. Isso vale para
verificação manual, monitor do navegador e cron. Uma busca sem resultados iniciais pode receber
uma coleta inteira como Novo. Um anúncio antigo omitido na coleta inicial também pode gerar Novo.
`idDoAnuncio` ainda pode produzir fallback que inclui índice posicional. A detecção desse fallback
existe, mas não é uma condição geral do seletor legado.

Os caminhos globais A/B são inertes. Sua existência no SQL não significa ingestão funcional,
integração ao cliente ou migrations aplicadas remotamente; nenhum ambiente remoto foi consultado.

## Código a reaproveitar

- As quatro tabelas globais A e seus índices de identidade/idempotência.
- As primitivas B de registrar presença, finalizar, formar baseline e expirar execução.
- Contratos de aquisição, qualificadores nativos e matriz de capacidade existentes.
- Parsers, cache/single-flight, normalização e observabilidade da Central.
- Buscas privadas, filtros, regras de carteira e fronteira autenticada existentes.
- Helpers de data de `web/lib/datas.ts` e testes locais com mocks/PGlite.

Não criar coletor, scheduler ou arquitetura de dados paralelos.

## Migration proposta — ainda não escrita nem aplicada

Uma migration aditiva posterior a A/B, acompanhada do espelho no schema canônico, deve:

1. Acrescentar vínculo persistente da busca privada ao universo/versionamento correspondente e
   um marco de adesão/comparação. Uma assinatura nova não transforma o histórico global em Novo.
2. Vincular a distribuição privada à oferta global e à varredura que fundamenta a classificação,
   distinguindo Base não revisada de Novo e de visto. Visto continua sendo uma ação privada.
3. Disponibilizar uma fronteira de servidor restrita a service role que reutilize as primitivas
   internas B. Não expor o schema interno nem conceder acesso global a anon/authenticated.
4. Executar sob transação/locks a deduplicação, preservação de primeira observação, avanço de última
   observação, presença, fechamento e formação inicial de baseline. Retry deve ser idempotente;
   falha não pode publicar baseline ou novidade pela metade.
5. Distribuir somente para assinaturas elegíveis, filtradas pelo usuário confiável, universo,
   tipo/finalidade e critérios privados. Nunca copiar visto, salvo, descarte, investigação ou interesse
   entre usuários. Nenhum payload privado deve entrar em dados_objetivos globais.
6. Manter A/B existentes intactas; não executar backfill automático nem promover o histórico legado
   a uma baseline confiável. Não alterar schema ou estado de Retirados.

A forma final das colunas e a assinatura da operação devem ser revisadas com o SQL antes da aplicação.
Esta proposta não autoriza aplicação remota. Acessibilidade das funções pelo transporte Supabase
atual também deve ser resolvida nessa ponte, sem ampliar a exposição do schema interno.

## Contrato mínimo de cobertura do slice

Não tratar ok=true, HTTP 200, capacidade suportada ou contagem positiva como prova de cobertura.
A coleta deve carregar contexto canônico, proveniência real da aquisição (inclusive idade do cache),
versão, plano de páginas e evidência de conclusão do alcance declarado. Cobertura parcial,
desconhecida, truncada ou incompatível com o baseline deve bloquear Novo.

Amostra da primeira página ordenada por relevância, isoladamente, não satisfaz a regra estrita do
pedido. Embora B permita formar baseline observacional com cobertura=amostra, o gate do produto
precisa ser mais restritivo. Não relaxar B nem renomear uma amostra para completa. Até um caminho
existente produzir evidência suficiente, manter Base não revisada e nenhum Novo nesse caminho.
Vazio legítimo exige contrato próprio: B atualmente recusa baseline com zero admitidos.

Primeira coleta válida forma baseline e registra observações, sem Novos. Identidade preferencial:
portal + finalidade + ID nativo qualificado. Nunca promover fallback posicional, URL ou fingerprint.
Identidades já conhecidas, inclusive reaparecimentos e observações anteriores parciais, não devem
ser promovidas a Novo. Observações repetidas conservam first_seen e avançam last_seen.
Novo é descoberta qualificada pelo Radar, não prova de publicação recente no portal.

## Testes necessários para a implementação

Manter os testes existentes e acrescentar cenários de produto:

A. Primeira coleta válida: baseline formada, zero Novos.
B. Segunda coleta igual: zero Novos.
C. Segunda coleta válida com um ID inédito: exatamente um Novo.
D. Coleta parcial/desconhecida/truncada, antes ou depois da baseline: zero Novos.
E. Reordenação e duplicata entre páginas: zero Novos extras; fallback nunca entra no global.
F. Reobservação e reaparecimento: first_seen imutável, last_seen avança.
G. Usuário/assinatura novos: histórico entregue como Base não revisada, sem Novos em massa.
H. Casa/Apartamento e Locação/Venda separados no contexto; identidade global conforme contrato.
I. Duas contas: nenhuma ação privada compartilhada; consultas privilegiadas filtradas pelo dono.

Acrescentar concorrência monitor/cron, retry, rollback, cache antigo e falha entre ingestão/distribuição.
Mocks/PGlite não comprovam ACL, concorrência e transporte reais de PostgreSQL/PostgREST.

## Validação e próximo passo

Nenhuma mudança no código de produto. Os testes existentes selecionados serão registrados na entrega.
Não executar APIs pagas, produção ou smoke com efeitos externos. Não foram adicionados testes A–I,
pois a implementação está parada no limite de migration definido pelo pedido.

Próximo slice: revisar a migration aditiva e seu contrato de cobertura, depois implementar a ponte
servidora e conectar manual/navegador/cron à mesma regra. Antes de merge, executar os checks exigidos
pelo projeto e smoke seguro local com duas contas, coletas controladas e estados privados distintos.
Verificar na UI Base não revisada, zero Novos na baseline, exatamente um Novo na comparação válida
e zero Novos na parcial. O fluxo real ainda não foi exercitado.

### Resultado da verificação da base

- Seis arquivos de teste, 232 testes existentes aprovados: radar-angariacao,
  radar-angariacao-persistencia, monitor-radar-angariacao, cron-radar,
  radar-r6-1-a-fundacao-global e radar-r6-1-b-invariantes-globais.
- A primeira execução na base escolhida teve 230 aprovados e dois timeouts de 5 segundos.
  A repetição completa com um worker e limite de 20 segundos por teste passou sem mudar arquivos,
  mocks ou expectativas. Isso é verificação da base existente, não dos requisitos A–I ainda ausentes.
- Uma tentativa inicial na pasta antiga foi impedida por EPERM no cache temporário e não executou
  testes. A execução válida acima ocorreu no novo worktree, com diretório temporário controlado.
- Comando válido: `npm test -- tests/radar-angariacao.test.ts tests/radar-angariacao-persistencia.test.ts tests/monitor-radar-angariacao.test.ts tests/cron-radar.test.ts tests/radar-r6-1-a-fundacao-global.test.ts tests/radar-r6-1-b-invariantes-globais.test.ts --maxWorkers=1 --testTimeout=20000`.
- Alteração somente em Markdown; TypeScript, lint e build não executados nesta entrega.
- Nenhum teste de portal real, PostgreSQL/PostgREST real, UI autenticada ou API paga executado.
- `git diff --check` sem erros; a verificação sem índice cobre também o relatório ainda não rastreado.

Arquivo alterado/criado: somente este relatório. Nenhum teste novo, commit, push, deploy ou aplicação
remota. Risco restante principal: o produto existente ainda pode classificar falsos Novos; esta
auditoria não modifica nem corrige esse comportamento. Aguardando revisão da migration proposta.
