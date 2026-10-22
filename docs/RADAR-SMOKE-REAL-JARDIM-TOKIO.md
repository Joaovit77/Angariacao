# Radar — smoke integrado real de Jardim Tókio

**RADAR_BASELINE_COVERAGE_NOVO_FUNCTIONAL_SMOKE_HOLD_CHAVES_PAGE_2_JSONLD_URL_POINTS_TO_PAGE_1**

Aquisição manual: 21/10/2026, 16:51 BRT (19:51 UTC). Relatório fechado em 22/10/2026.

Atualização local: o [contrato de evidência Chaves foi revisado](RADAR-CHAVES-PAGINATION-EVIDENCE-ENTREGA.md)
e está pronto para rerun. O resultado real documentado abaixo permanece HOLD; não houve nova aquisição paga.
Branch `codex/radar-baseline-novos`, HEAD `0e952d6`, sem commit.

## Resultado e blocker material

O fluxo real autenticado adquiriu duas páginas consecutivas, ingeriu 30 ofertas globais e distribuiu
30 anúncios privados utilizáveis. A cobertura ficou `desconhecida`, a varredura ficou `partial`,
a baseline permaneceu NULL e o resultado foi **zero Novos**. Não houve certificação de cobertura.

A resposta efetiva de `?pg=2` contém 15 identidades diferentes das 15 da primeira página, mas seu
`RealEstateListing.url` identifica a URL inicial, sem `?pg=2`. O contrato vigente exige que esse dado
estruturado comprove a página consultada. A evidência da segunda página foi rejeitada e a coleta
terminou por `evidencia_inconsistente`. A canonical HTML da segunda página também aponta à inicial;
o blocker é a divergência de identidade no JSON-LD, não apenas a canonical.

O portal declarou **33 ofertas** durante a aquisição, diferente das 19 observadas na preparação.
Foram adquiridas 30 identidades únicas; as três restantes não foram comprovadas. O fim da paginação
não foi certificado. O produto planejou três páginas pelo total declarado, mas parou na inconsistência
da segunda, antes de uma terceira chamada. Não se tratou de parada pelo teto.

**Rodada 2 paga não executada**, conforme a regra de parar no primeiro blocker material.
Não houve correção do contrato para forçar o smoke a passar nem ampliação de arquitetura/geografia.

## Ambiente e percurso exercitado

Aplicação Next.js do worktree, autenticação real local, PostgREST e PostgreSQL/Supabase locais
exclusivos do ensaio. Foram aplicadas 43 migrations canônicas somente nesse banco isolado,
incluindo a migration local de baseline/coverage/Novo. Não foram usados mocks na aquisição,
autenticação, ingestão, transação ou leitura privada. O banco começou sem anúncios e sem baseline.

O endpoint real `/api/radar/verificar` recebeu a busca salva da conta autenticada e percorreu coletor,
parser, filtros, ingestão global, gate e distribuição privada. A interface leu os registros persistidos.
A captura Firecrawl usou `maxAge: 0`; a telemetria informa `reutilizacao: nenhuma`.

API local em `127.0.0.1:56521` e banco em `127.0.0.1:56522`; servidor do produto era `127.0.0.1:56530`.
O servidor do produto foi encerrado ao fechar o ensaio; os dados locais foram preservados.
Não houve aplicação remota, acesso ao Supabase de Production ou chamada OpenAI. Nenhum scheduler
foi alterado. Credenciais e capturas brutas permanecem fora do Git e fora deste relatório.

## Universo e aquisição paga — rodada 1

Universo: `chaves-na-mao | locacao | PR | londrina | casa | todos | v2 | bairro=jardim tokio`.

Universo persistido: `32e1fdc8-3395-4bcd-889a-763da61abbb4`.
Varredura manual: `a739a17a-98d1-4ffd-9b2f-99414914e357`.

| Página adquirida | URL efetiva | IDs nativos | Total declarado | HTTP | Créditos informados |
|---|---|---:|---:|---:|---:|
| 1 | https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/ | 15 | 33 | 200 | 1 |
| 2 | https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/?pg=2 | 15 | 33 | 200 | 1 |

IDs distintos entre páginas: 30; sobreposição: zero. Todos usam native ID do portal em URL
`/id-<numero>/`, qualificados por portal e finalidade. Nenhum fallback posicional foi usado.
A primeira página publicou o link da segunda. Isso não comprova a completude do universo.

Serviço: Firecrawl `/v2/scrape`, `proxy: basic`, somente `rawHtml`, sem extras de IA/browser/proxy.
**Consumo real: duas chamadas pagas e dois créditos**, informados pelos metadados do provedor.
Não foi inferido valor em reais/dólares a partir desses créditos. Teto configurado: dez páginas e
dez chamadas por rodada, vinte chamadas no total; rodada 2 consumiu zero. Não houve aumento de teto.

## Coverage, baseline e Novos

| Medida | Resultado real |
|---|---|
| Páginas adquiridas / planejadas | 2 / 3 |
| Anúncios brutos / admitidos / distribuídos na rodada manual | 30 / 30 / 30 |
| Status da varredura | `partial` |
| Cobertura | `desconhecida` |
| Código de resultado | `cobertura_insuficiente` |
| Motivo da parada | `evidencia_inconsistente` |
| Fim comprovado | Não |
| Baseline | Não formada; ID e conclusão NULL |
| Novo | 0; nenhum `novidade_varredura_id` privado |

O gate funcionou de forma conservadora e não impediu o acesso aos anúncios coletados.
A regra de primeira coleta **válida** formar baseline com zero Novos ainda não foi exercitada
neste universo real: a primeira coleta não foi válida para certificação.

## Acesso real pela interface

A conta local abriu a Central/Radar e consultou a busca de Jardim Tókio. Os 30 links diretos presentes
na interface correspondem exatamente às 30 URLs privadas da fotografia inicial do banco.
A interface exibiu preço, localização, portal, **Base não revisada** e **Coleta parcial**.
Não foram criados anúncios artificiais para preencher essa tela.

Foi aberto no portal o anúncio **45597290**, Casa/Sobrado, Jardim Tókio, Londrina/PR, R$ 2.800/mês.
A visualização ficou persistida (`visto = true`). A opção “Mostrar 1 visualizado/repetido” permitiu
consultá-lo novamente e passou a “Ocultar repetidos”; a lista voltou a conter os 30 links.
Nenhuma mensagem, contato, WhatsApp ou solicitação de visita foi enviada.

**Limite desta prova:** um link foi aberto individualmente; os demais 29 tiveram presença e URL
conferidas, sem abertura individual. O botão “Carregar mais anúncios” não apareceu porque os 30
registros cabem na primeira leitura privada (120 por página). Portanto, o carregamento adicional
não foi exercitado com dados reais neste smoke; permanece coberto apenas pelos ensaios controlados
anteriores. Não se deve apresentar isso como paginação real validada na interface.

Lista com preços, localidades e links diretos, captura do anúncio aberto e provas locais:
`C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-real-smoke/`.
Arquivos principais: `anuncios-coletados.md`, `links-ui.json`, `anuncio-aberto-45597290.png`,
`prova-paginas.json`, `resultado-rodada-1.json`, `banco-rodada-1.json`, `banco-final.json`,
`ledger.json`, `resumo-smoke.json`. As fotografias do banco são evidências locais, não arquivos para commit.

## first_seen, last_seen e observações extras

Na fotografia imediatamente posterior à rodada manual, as 30 ofertas têm `primeiro_visto_em`
e `ultimo_visto_em` iguais a `2026-10-21T19:51:12.021+00:00`. Não existia observação anterior.

Durante a espera, a aba permaneceu aberta e seu monitor disparou **sete varreduras HTTP diretas**,
com **14 requisições externas sem custo Firecrawl**, entre `2026-10-21T21:53:52.810Z` e
`2026-10-22T10:28:46.811Z`. Foi uma falha na contenção temporal do ensaio: a barreira de custo
bloqueava Firecrawl fora da rodada, mas inicialmente permitia o fallback HTTP. Essas observações
não deveriam ter prosseguido após o HOLD. Foram preservadas e registradas, sem apagamento nem
reclassificação como rodada 2. Todas ficaram parciais, com cobertura desconhecida e zero Novos.

Na fotografia final há oito varreduras (uma manual Firecrawl e sete HTTP do navegador), 30 ofertas
globais e 30 anúncios privados. `first_seen` permaneceu idêntico nas 30. `last_seen` avançou em 20
até `2026-10-22T10:28:46.811+00:00`, por causa dessas observações extras; nas outras dez permaneceu
igual ao inicial. Esse avanço **não comprova a segunda rodada autorizada** nem repetição com
cobertura válida. Baseline e certificações de Novo continuam ausentes.

Contenção final: servidor Next.js encerrado, rodada fechada (`rodada: null`), transporte temporário
do ensaio ajustado para também bloquear HTTP externo fora de rodada. A versão efetivamente usada
foi preservada em `limite-transporte-executado.mjs.txt`. Não houve alteração do monitor/scheduler
do produto. Total pago permaneceu duas chamadas/dois créditos; as sete observações extras não
fizeram chamadas pagas reais. Tentativas Firecrawl na telemetria do produto, bloqueadas antes do
envio pelo transporte do ensaio, não devem ser somadas como cobranças.

## Telemetria e verificações

A requisição manual real respondeu HTTP 200 em **18.684 ms**. O evento `central-busca-ok` registrou
**17.337 ms**, duas tentativas Firecrawl respondidas, duas páginas, 30 coletados, 30 após filtro,
33 declarados, zero Novos e término `evidencia_inconsistente`. O nome do evento não representa
certificação de cobertura. `comparaveis_salvos` ficou NULL; não houve uso de embeddings/IA.

Foram comparados retorno da rota, ledger do transporte, HTML bruto gravado, IDs de JSON-LD,
registros globais/privados, URLs da interface e estado persistido de visualização. As fotografias
inicial e final foram preservadas separadamente, para distinguir a rodada manual das consultas extras.

Esta etapa não modificou código de produto, migration ou schema. Os testes automatizados anteriores
estão registrados na [entrega de bairro](RADAR-BAIRRO-UNIVERSO-ENTREGA.md). Não foram repetidas
suítes pagas nem acionados ensaios OpenAI. A validação nova é o smoke real descrito aqui, encerrado
em HOLD; não substitui os cenários de baseline válida, repetição e identidade inédita ainda pendentes.
Para as alterações somente documentais desta etapa foi executado `git diff --check` e conferida
a integridade das referências locais e das contagens dos artefatos.

## Pendências e STOP

Blocker para retomar o mesmo smoke: definir e validar o contrato de evidência da página 2 diante
do JSON-LD que aponta à primeira página, preservando o gate fechado até prova suficiente de
sequência, total e fim. Não corrigido nesta execução, conforme STOP no blocker real.

Backlog lateral: erro de console no carregamento inicial de dados Supabase (a autenticação,
leitura Radar e ação de visto funcionaram depois) e aviso de LCP do logo. Não tratados nesta fatia.
A contenção de todas as aquisições automáticas durante smoke precisa ser conferida antes de
qualquer repetição; a falha temporal identificada acima impede usar o estado final como duas rodadas
manuais limpas. Não é motivo para alterar agora o scheduler do produto.

Permanecem não exercitados no universo real: baseline certificada, rodada 2 válida, Novo por
identidade inédita, carregamento privado além de 120 e isolamento real com duas contas.
Cambé permanece apenas histórico do HOLD anterior; Londrina continua o cenário real do produto.
Nenhum trabalho iniciado para as 3.080 ofertas, recortes adicionais, RAD-20/Strategy A ou Retirados.

**STOP após o smoke. Sem commit, push, deploy, aplicação remota ou alteração de Production.**
