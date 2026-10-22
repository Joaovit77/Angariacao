# Radar — rerun real da rodada 1 de Jardim Tókio

**RADAR_JARDIM_TOKIO_FIRST_VALID_BASELINE_HOLD_TIME_BUDGET_BEFORE_PAGE_3**

Data: 22/10/2026. Aquisição entre **12:17:14 e 12:17:32 BRT** (15:17 UTC).
Branch `codex/radar-baseline-novos`, HEAD `0e952d6`, sem commit.
Uma rodada real executada. Nenhuma rodada 2. STOP no primeiro blocker factual.

Atualização local posterior: a [reserva de tempo por fase foi revisada](RADAR-PAGINACAO-ORCAMENTO-TEMPO-ENTREGA.md)
e validada sem chamadas pagas. O HOLD real abaixo permanece factual; nenhum novo smoke foi executado.

## Resultado

A correção anterior foi confirmada no transporte real: P2 foi admitida mesmo com JSON-LD/canonical
na base, pois URL solicitada/efetiva, HTTP, sequência e 15 IDs adicionais foram consistentes.
O aviso `portal_document_url_not_pagination_aware` foi persistido. Não houve loop nem redirect
efetivo de P2 para a base.

O produto encerrou a coleta por **`limite_tempo` antes de adquirir P3**. Foram adquiridas/admitidas
duas páginas, com 30 native IDs únicos, diante de 33 ofertas declaradas. O fim não foi comprovado.
A API classificou a cobertura como `parcial`; o banco manteve a varredura `partial`, cobertura
`desconhecida`, baseline NULL e zero Novos. Essa diferença de rótulo reflete o armazenamento
conservador já existente para cobertura não certificada; não foi tratada como completa.

**Não houve baseline válida e não há PASS.** Nenhuma regra foi ajustada durante o smoke.

## Pré-condição operacional e estado preservado

O Docker local estava inicialmente parado; a stack preservada foi recuperada após abertura manual
pelo usuário. Não foram recriados banco, busca ou universo. Auth, PostgREST e PostgreSQL continuaram
locais, com portas publicadas apenas em `127.0.0.1:56521` e `127.0.0.1:56522`. Não houve migration.

Antes de qualquer custo, a barreira do rerun foi exercitada com fetch inteiramente simulado:
Firecrawl e HTTP externo foram bloqueados com rodada fechada, após fechamento, com rodada 2 e
com janela expirada. Nove tentativas fechadas foram recusadas; dez envios simulados exercitaram o
teto, e o décimo primeiro foi recusado. Nenhum envio real ocorreu nesse pré-guard. O transporte
carregado nos processos do produto também registrou a barreira fechada antes da rodada real.

O orçamento deste rerun foi separado do histórico: **uma rodada, até dez páginas/dez chamadas pagas**,
sem suporte operacional à rodada 2, com expiração da janela externa em 180 segundos. Isso não
alterou o prazo interno do produto nem o scheduler. Nenhuma aba de consulta ficou aberta durante
a aquisição; a interface foi aberta somente depois de ambos os transportes estarem fechados.
A tabela local `cron.job` tinha zero jobs.

Fotografia inicial: **oito varreduras, 30 ofertas globais, 30 anúncios privados, nenhuma baseline e
nenhum Novo certificado**. As oito varreduras eram a manual Firecrawl anterior e sete observações
HTTP automáticas do incidente histórico. Elas foram preservadas integralmente, sem promoção a
baseline nem reclassificação como rodada 2. A fotografia final tem exatamente essas oito mais
uma nova varredura manual Firecrawl: nove no total, ainda sem baseline e com zero Novos.

## Universo e busca

- Busca salva anterior: `9b526f48-9c31-4d7a-8f67-845d4597a30d`, da mesma conta local.
- Universo: `32e1fdc8-3395-4bcd-889a-763da61abbb4`.
- Identidade: `chaves-na-mao | locacao | PR | londrina | casa | todos | v2 | bairro=jardim tokio`.
- Nova varredura: `25aad7de-d016-473a-bf63-0caa5cd31914`.
- Serviço: Firecrawl `/v2/scrape`, `proxy: basic`, somente `rawHtml`, `maxAge: 0`.

A aquisição percorreu o endpoint autenticado real `/api/radar/verificar`, busca salva sob o owner,
coletor, parser, finalização, ponte global/RPC e distribuição privada. A sessão foi renovada somente
no Auth local. Não foram usados mocks no fluxo real nem credenciais Supabase remotas.

## Páginas realmente adquiridas

| Evidência | P1 | P2 |
|---|---|---|
| URL solicitada | https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/ | https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/?pg=2 |
| URL efetiva do provedor | Igual à solicitada | Igual à solicitada, com `?pg=2` |
| HTTP API / portal | 200 / 200 | 200 / 200 |
| Native IDs / novos no acumulado | 15 / 15 | 15 / 15 |
| Total declarado | 33 | 33 |
| JSON-LD / canonical | URL base | URL base; aviso informativo registrado |
| Navegação publicada no HTML | Link para P2 | Sem próximo link observado em `a`/`link rel=next` |
| Decisão do adapter | Admitida | Admitida |

Native IDs de P1:
`47187345, 34439815, 39963587, 47434792, 47267522, 47695161, 46658242, 23571777, 44858460, 44963020, 33741658, 33821843, 46116312, 46717399, 45285969`.

Native IDs de P2:
`45191402, 47363904, 47571699, 47033119, 45330426, 47695205, 46528809, 34169884, 45370014, 8342561, 46717400, 47210704, 46963316, 45597290, 33855459`.

União: 30; sobreposição entre páginas: zero. As identidades são nativas e qualificadas pelo portal,
sem fallback posicional. P1 publicou P2. Após P2, o total ainda não reconciliado permitia apenas a
tentativa ordinal consecutiva `?pg=3`; essa candidata não era prova de fim nem de três anúncios
restantes. A tentativa não começou porque o orçamento de tempo a bloqueou. **P3 não foi adquirida.**

## Blocker exato: reserva de tempo antes de P3

A [rota real](../web/app/api/radar/verificar/route.ts) mantém `maxDuration = 120` segundos.
Antes de iniciar cada página, o [coletor](../web/lib/servidor/paginacaoRadar.ts) exige pelo menos
`75.000 + RESERVA_PROCESSAMENTO_CENTRAL_MS` disponíveis: 60 segundos Firecrawl, 15 de fallback HTTP
e 35 de reserva de finalização, totalizando **110 segundos**.

As duas aquisições pagas consumiram cerca de 11,5 segundos somente entre início da primeira chamada
e fim da segunda. Ao avaliar P3 já não havia 110 segundos disponíveis no prazo de 120. O coletor
lançou `limite_tempo` antes de reservar/consultar a terceira página. O prazo total não chegou a
expirar: foi a condição preventiva de reserva para o pior caso que encerrou a rodada.

Esse é um blocker direto de concluir a coleta nesta execução, e não uma falha do novo contrato
JSON-LD/canonical. Não foi aumentado prazo, diminuída reserva, alterado retry ou modificado teto.
A revisão dessa reserva, se desejada, exige uma próxima instrução; nenhuma correção foi iniciada.

## Coverage, baseline, Novos e histórico

| Medida | Resultado factual |
|---|---|
| Páginas adquiridas / admitidas | 2 / 2 |
| Páginas planejadas no registro | 3 |
| IDs únicos / total declarado | 30 / 33 |
| Fim comprovado | Não |
| Motivo de término | `limite_tempo` |
| Coverage da resposta / evidência da aquisição | `parcial` |
| Status / coverage da varredura no banco | `partial` / `desconhecida` |
| Classificação das cópias privadas | `desconhecida`, exibida como Coleta parcial |
| Baseline ID / conclusão | NULL / NULL |
| Novos / certificações privadas | 0 / 0 |
| Ofertas globais / anúncios privados finais | 30 / 30 |

Os 30 IDs já existiam em observações parciais; todos tiveram first_seen preservado e last_seen
avançado pela nova observação real. Isso não é rodada 2 nem prova de repetição válida: este rerun
continuou parcial. Nenhuma observação anterior recebeu certificação de primeira coleta válida.
A ação privada de visto já existente permaneceu preservada.

## Acesso aos anúncios pela interface

A interface real, autenticada na mesma conta local, mostrou a busca salva de Jardim Tókio, zero
Novos, **Base não revisada**, **Coleta parcial**, preço, localização e portal. A opção
“Mostrar 1 visualizado/repetido” permitiu consultar a oferta já vista; após a ação, foram conferidos
**30 links diretos**, exatamente o mesmo conjunto das 30 URLs privadas persistidas.
Não foi necessário abrir individualmente todos os links. Nenhum anúncio foi importado ou contato
real enviado. O botão “Verificar agora” não foi acionado na interface.

Não havia necessidade de carregamento adicional: 30 anúncios cabem na leitura inicial de 120.
Fotos não apareceram neste ensaio porque o proxy de imagens da aplicação tentou transporte externo
fora da janela e foi bloqueado pela barreira; retornos 502 ficaram no log local. Isso é limitação
de contenção do ensaio, sem evidência de descarte dos registros ou indisponibilidade dos links.
Não foi aberta investigação nem alterada UI/proxy para contornar a barreira.

Evidências e lista com preços/links:
`C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-rerun-rodada-1-20261022/`.
Arquivos: `anuncios-coletados.md`, `links-ui.json`, `interface-ax.txt`, `radar-resumo-parcial.png`,
`radar-parcial-consultavel.png`, `prova-por-pagina.json`, `banco-antes.json`, `banco-final.json`,
`resultado-rodada-1.json`, `ledger.json`, `resumo-smoke.json` e `preflight-barreira-local.json`.
Credenciais e capturas brutas ficam fora do Git e não integram a entrega versionável.

## Consumo e telemetria

**Nesta rodada: duas chamadas pagas realmente enviadas e dois créditos reportados pelo provedor**,
um por página, sem retry e sem fallback HTTP enviado. Não há estimativa monetária.
Chamadas bloqueadas localmente, inclusive tentativas de buscar imagens, não contam como custo pago.
O histórico anterior tinha duas chamadas/dois créditos; somados os dois ensaios: quatro/quatro.

A resposta HTTP 200 levou 17.977 ms. A nova telemetria `central-busca-ok` registrou 16.327 ms,
`reutilizacao: nenhuma`, aquisição Firecrawl, duas tentativas respondidas, 30 coletados/30 após filtro,
33 declarados, motivo `limite_tempo`, aviso documental de P2 e zero Novos. O nome do evento não
representa certificação de cobertura. Nenhuma captura em cache foi apresentada como aquisição fresca.

## Encerramento e pendências laterais

Após a resposta, o controle foi fechado imediatamente (`rodada: null`, `expiraEm: null`). A interface
foi consultada sob contenção; não houve varredura adicional. A aba foi fechada e o servidor dedicado
encerrado, preservando os containers e os dados locais. Não há execução ou autorização implícita de
rodada 2. Os tetos de dez páginas/dez chamadas permaneceram intactos.

Pendências laterais: avisos Watchpack ao consultar arquivos de sistema do Windows e fotos bloqueadas
pela barreira de transporte do ensaio. Não bloquearam a confirmação de acesso aos anúncios. Não
foram corrigidas nem abertas novas frentes. O único blocker de coverage identificado neste rerun é
a reserva de tempo antes de P3.

Nesta etapa não foram modificados código, schema, migration ou configuração do produto. As suítes
locais da revisão anterior permanecem descritas na [entrega do contrato](RADAR-CHAVES-PAGINATION-EVIDENCE-ENTREGA.md).
A validação nova foi o smoke real; verificações documentais e `git diff --check` foram executadas no
fechamento. Não foram repetidos testes pagos, executados ensaios OpenAI ou aplicadas alterações remotas.

**STOP no HOLD. Sem rodada 2, correção durante o smoke, universo de 3.080, novos recortes,
alteração de scheduler/geografia, Supabase remoto, Production, commit, push ou deploy.**
