# Radar — auditoria offline da população declarada do Chaves

`RADAR_CHAVES_DECLARED_TOTAL_QUALIFIED_POPULATION_HOLD_SOBRADO_TYPE_NOT_QUALIFIED`

**A condição para alterar coverage não foi satisfeita.** A classificação dos 45 IDs usando o parser e
o qualificador reais encontrou **32 qualificados, 12 fora do universo por bairro e um indeterminado
para o recorte Casa**. O total declarado continua 33. Os 33 anúncios consultáveis são os 32
qualificados mais um Sobrado sem vínculo global; não são 33 ofertas qualificadas pela regra atual.
Não houve mudança de contrato, código, schema, migration ou dados. STOP conforme o item 5 do pedido.

Data: 22/10/2026. Branch `codex/radar-baseline-novos`, HEAD `0e952d6`, sem commit.
Estado de entrada e [HOLD real preservado](RADAR-JARDIM-TOKIO-BUDGET-RERUN-RODADA1-20261022.md):
`RADAR_JARDIM_TOKIO_FIRST_VALID_BASELINE_HOLD_PAGE_3_ITEMLIST_EXCEEDS_DECLARED_TOTAL`.
Este gate fez zero consultas externas, zero chamadas Firecrawl, zero chamadas HTTP e zero smoke pago.

## Evidência e método

Foram lidos somente os três HTMLs reais preservados, o ledger, `prova-por-pagina.json`, a resposta
da rodada e o snapshot `banco-final.json`, que já contém ofertas globais, cópias privadas e filtros
da busca salva. Nenhuma consulta ao banco ou ao portal foi necessária. Os arquivos originais não
foram sobrescritos; nove evidências foram conferidas por SHA-256 antes/depois.

Mesmo alvo: busca `9b526f48-9c31-4d7a-8f67-845d4597a30d`, universo
`32e1fdc8-3395-4bcd-889a-763da61abbb4`,
`chaves-na-mao | locacao | PR | londrina | casa | todos | v2 | bairro=jardim tokio`.

O script local transpila e executa as funções reais, sem reescrever o parser:

- [`extrairAnunciosFirecrawl`](../web/lib/servidor/firecrawlCentralAngariacao.ts): leitura de cada card.
- [`tipoRecorteObservadoRadar` / `anuncioAdmitidoRecorteRadar`](../web/lib/calculo/aquisicaoRadar.ts): contrato de tipo e admissão existente.
- [`anuncioPertenceAoMercado`](../web/lib/calculo/centralAngariacao.ts): cidade/UF observadas.
- [`chaveBairroRadar`](../web/lib/calculo/bairroUniversoRadar.ts): normalização canônica aplicada aos bairros publicados.
- [`qualificarOfertaRadar`](../web/lib/servidor/ingestaoRadar.ts): elegibilidade real da oferta para a camada global.
- [`lerEvidenciaPaginaRadar`](../web/lib/servidor/coberturaRadar.ts): IDs brutos, total e navegação do ItemList.

O marcador `server-only` foi neutralizado exclusivamente no carregador local. As funções de negócio
não foram simuladas. Fetch e transportes HTTP/TCP do processo foram bloqueados; contador final de
tentativas de rede = 0. Não foram carregados `.env.local`, credenciais ou sessões.

A finalidade atribuída pelo parser a partir do filtro não foi usada sozinha como prova: as 45 URLs
individuais publicadas contêm `para-alugar`, evidência também admitida pelo qualificador atual.
Os 45 cards publicam Londrina/PR; bairro veio do próprio card, sem substituição pelo bairro da busca.
Nenhum tipo foi preenchido com o tipo solicitado, com o slug da listagem ou por posição.

## Reconciliação individual

| Página | Raw IDs distintos | Qualificados | Fora do universo | Indeterminados | Total declarado |
|---|---:|---:|---:|---:|---:|
| P1 | 15 | 15 | 0 | 0 | 33 |
| P2 | 15 | 15 | 0 | 0 | 33 |
| P3 | 15 | 2 | 12 | 1 | 33 |
| Acumulado | **45** | **32** | **12** | **1** | **33** |

Os únicos dois novos IDs qualificados observados em P3 são `34189630` e `44107045`.
Não há repetição de native IDs entre as três páginas. Isso continua sendo evidência de conteúdo
distinto, independentemente da reconciliação do total da busca.

Os 12 fora do universo estão todos em P3, com bairro explicitamente diferente de Jardim Tókio:

| Bairro publicado | IDs excluídos do universo de Jardim Tókio |
|---|---|
| Universitário | 44062904, 43505231, 45151548 |
| San Remo | 46620605 |
| Portal de Versalhes 1 | 47142040 |
| Campo Belo | 47907316 |
| Quebec | 22719856 |
| Vila Ipiranga | 47495110 |
| Sabará I | 44571813 |
| Jardim Higienópolis | 46562714 |
| Jardim Agari | 47761625 |
| Terras de Santana II | 47569666 |

Esses 12 continuam presentes nos HTMLs, na classificação e nas ofertas globais do snapshot. A
existência global deles não prova presença qualificada no universo do bairro. Não foram apagados,
ignorados na evidência nem redistribuídos pela auditoria.

## O item que impede comprovar 33 qualificados

ID [`45735542`](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-250m2-RS2800/id-45735542/), P3:

- Portal Chaves na Mão; finalidade própria da URL Locação; cidade Londrina; UF PR; bairro Jardim Tókio.
- Título publicado: “Sobrado com 3 dormitórios para alugar, 150 m² por R$ 2.800,00/ano - Jardim Tókio - Londrina/PR”.
- Parser real: `tipoDeclarado = Sobrado`; `tipo = Sobrado`.
- Contrato real: `tipoRecorteObservadoRadar = null`; `qualificarOfertaRadar = null`.
- O JSON-LD preservado contém `itemOffered.@type = SingleFamilyResidence`. Esse fato foi registrado;
  o parser/qualificador atual não o usa para substituir a tipologia declarada no card.
- Snapshot: cópia privada presente; `anuncio_global_id = NULL`; oferta global ausente.

**INDETERMINADO refere-se à pertença ao recorte Casa pelas regras atuais**, e não à ausência do tipo:
“Sobrado” está explicitamente publicado. Não foi classificado como Casa por aproximação, nem como
anúncio comprovadamente de outro bairro/finalidade. A função canônica só reconhece Casa/Apartamento
e declara que Sobrado não é promovido. Não há autorização neste gate para mudar essa tipologia.

O caminho privado atual de Chaves/Casa admite consulta desse anúncio, enquanto a qualificação global
é mais estrita. Isso explica a diferença sem usar a tabela privada como prova de coverage:

`45 raw = 32 qualificados do universo + 12 fora por bairro + 1 tipo não qualificável atualmente`.

`44 ofertas globais = 32 do universo + 12 de outros bairros`.

`33 cópias privadas = 32 qualificadas do universo + 1 Sobrado consultável sem vínculo global`.

A igualdade entre 33 cópias privadas e total 33 não satisfaz a igualdade exigida entre **33 IDs
qualificados** e total 33. Contar esse item exigiria uma decisão adicional sobre a prova/tipologia,
fora da correção exclusivamente de reconciliação autorizada condicionalmente.

## Conclusão sobre A e B

A contagem raw não representa diretamente o total 33 nesta captura: existem 45 IDs reais distintos
e 12 anúncios comprovadamente fora do bairro. A hipótese de o total excluir esses extras tem apoio
objetivo na população geográfica observada, mas **B não ficou comprovada nos termos exigidos pelo
pedido**, pois as funções reais só qualificam 32 para o universo Casa e resta um indeterminado.
Não é possível decidir que o portal e o produto usam exatamente a mesma população de 33 sem
alterar ou ampliar a regra de tipologia. Essa alteração não foi feita.

Sequência P1/P2/P3, URLs efetivas coincidentes, HTTP 200, total estável, ausência de gap/loop/redirect
e P3 sem next permanecem comprovados pelas capturas. P3 publicou somente prev para P2. Esses fatos
não removem a indeterminação de população. A separação proposta entre raw para progressão e qualified
para reconciliação não foi implementada sem atender à condição anterior.

Regra anterior permanece: o adapter usa o conjunto bruto do ItemList e rejeita 45 > 33. Não há regra
nova neste gate. Coverage parcial/desconhecida, baseline NULL e zero Novos continuam sendo o estado
histórico; não houve promoção ou reingestão offline para alterar esses dados.

## Verificações, limites e arquivos

Verificações executadas: 45 IDs distintos e mapeados individualmente ao parser; soma por página;
campos publicados; classificações/exclusões; qualificador global por ID; correspondência de 44 ofertas
globais e 33 cópias privadas; tipo divergente e JSON-LD do item; total estável; navegação capturada;
integridade de 1.215 arquivos existentes do worktree e nove evidências originais por SHA-256;
contador de rede zero. Links locais e `git diff --check` conferidos na documentação.

Os casos A–J de uma eventual correção não foram adicionados: o caso A pressupõe 33 qualificados,
condição que a captura e as regras atuais não satisfazem. Pelo STOP do item 5, não houve implementação
para validar com novas suítes, TypeScript, lint ou build neste gate. Não se apresenta o resultado como
READY_FOR_BASELINE_SMOKE, nem como validação real de baseline. Os resultados de testes anteriores
continuam nos relatórios históricos; nenhuma falha lateral foi investigada ou expectativa alterada.

Único arquivo do projeto criado neste gate: este relatório. Nenhum comportamento do produto, UI,
coverage, baseline/Novo, ingestão/distribuição, outros portais, timeouts, caps, geografia ou scheduler
foi modificado. Nenhum schema/migration foi aplicado. Nenhuma ação de commit, push ou deploy ocorreu.
Não foi corrigida a instrumentação do smoke anterior nem iniciada uma frente de tipos.

Artefatos locais fora do Git em
`C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-chaves-populacao-auditoria-20261022/`:
`classificacao-45-ids.json` (campos e retornos por ID), `classificacao-45-ids.md`,
`auditar-populacao.cjs`, `verificacao-offline.json`, `hashes-worktree-antes.json` e
`hashes-evidencias.json`.

**STOP: falta qualificação canônica do ID 45735542 como Casa para comprovar a população exigida.
Sem nova aquisição, smoke, rodada 2 ou alteração automática dessa regra.**

## Inventário dos 45 IDs

| Pág. | ID | Portal | Finalidade pela URL | Cidade/UF | Tipo declarado → recorte | Bairro publicado | Classificação | Motivo |
|---|---|---|---|---|---|---|---|---|
| 1 | [47187345](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-RS4800/id-47187345/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [34439815](https://www.chavesnamao.com.br/imovel/casa-para-alugar-2-quartos-com-garagem-pr-londrina-jardim-tokio-100m2-RS2800/id-34439815/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [39963587](https://www.chavesnamao.com.br/imovel/casa-para-alugar-2-quartos-pr-londrina-jardim-tokio-50m2-RS800/id-39963587/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [47434792](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-pr-londrina-jardim-tokio-200m2-RS4800/id-47434792/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [47267522](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-250m2-RS4800/id-47267522/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [47695161](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-125m2-RS2800/id-47695161/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [46658242](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-150m2-RS2800/id-46658242/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [23571777](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-125m2-RS2800/id-23571777/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [44858460](https://www.chavesnamao.com.br/imovel/casa-para-alugar-2-quartos-com-garagem-pr-londrina-jardim-tokio-RS2800/id-44858460/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [44963020](https://www.chavesnamao.com.br/imovel/casa-para-alugar-2-quartos-pr-londrina-jardim-tokio-300m2-RS3300/id-44963020/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [33741658](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-100m2-RS3300/id-33741658/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [33821843](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-pr-londrina-jardim-tokio-125m2-RS2800/id-33821843/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [46116312](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-70m2-RS1500/id-46116312/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [46717399](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-90m2-RS2800/id-46717399/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 1 | [45285969](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-193m2-RS2800/id-45285969/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [45191402](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-RS2800/id-45191402/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [47363904](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-pr-londrina-jardim-tokio-250m2-RS4800/id-47363904/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [47571699](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-250m2-RS4800/id-47571699/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [47033119](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-RS4800/id-47033119/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [45330426](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-125m2-RS2800/id-45330426/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [47695205](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-125m2-RS2800/id-47695205/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [46528809](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-193m2-RS2800/id-46528809/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [34169884](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-pr-londrina-jardim-tokio-150m2-RS3300/id-34169884/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [45370014](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-RS2800/id-45370014/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [8342561](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-pr-londrina-jardim-tokio-120m2-RS2800/id-8342561/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [46717400](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-150m2-RS2800/id-46717400/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [47210704](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-200m2-RS4800/id-47210704/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [46963316](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-RS2800/id-46963316/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [45597290](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-200m2-RS2800/id-45597290/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 2 | [33855459](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-80m2-RS2800/id-33855459/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 3 | [34189630](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-128m2-RS2800/id-34189630/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 3 | [44107045](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-RS2800/id-44107045/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Tókio | QUALIFICADO PARA O UNIVERSO | Critérios comprovados e qualificador global admitiu |
| 3 | [45735542](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-tokio-250m2-RS2800/id-45735542/) | chaves-na-mao | locacao | Londrina / PR | Sobrado → não mapeado | Jardim Tókio | INDETERMINADO | tipo declarado Sobrado não mapeado pelo contrato Casa/Apartamento |
| 3 | [44062904](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-universitario-250m2-RS6000/id-44062904/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Universitário | FORA DO UNIVERSO | bairro publicado Universitário difere de Jardim Tókio |
| 3 | [43505231](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-universitario-250m2-RS6000/id-43505231/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Universitário | FORA DO UNIVERSO | bairro publicado Universitário difere de Jardim Tókio |
| 3 | [46620605](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-san-remo-340m2-RS3800/id-46620605/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | San Remo | FORA DO UNIVERSO | bairro publicado San Remo difere de Jardim Tókio |
| 3 | [45151548](https://www.chavesnamao.com.br/imovel/casa-para-alugar-4-quartos-com-garagem-pr-londrina-universitario-250m2-RS5500/id-45151548/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Universitário | FORA DO UNIVERSO | bairro publicado Universitário difere de Jardim Tókio |
| 3 | [47142040](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-portal-de-versalhes-1-180m2-RS5100/id-47142040/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Portal de Versalhes 1 | FORA DO UNIVERSO | bairro publicado Portal de Versalhes 1 difere de Jardim Tókio |
| 3 | [47907316](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-campo-belo-446m2-RS5900/id-47907316/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Campo Belo | FORA DO UNIVERSO | bairro publicado Campo Belo difere de Jardim Tókio |
| 3 | [22719856](https://www.chavesnamao.com.br/imovel/casa-para-alugar-4-quartos-com-garagem-pr-londrina-quebec-354m2-RS4990/id-22719856/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Quebec | FORA DO UNIVERSO | bairro publicado Quebec difere de Jardim Tókio |
| 3 | [47495110](https://www.chavesnamao.com.br/imovel/casa-para-alugar-4-quartos-pr-londrina-vila-ipiranga-RS3499/id-47495110/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Vila Ipiranga | FORA DO UNIVERSO | bairro publicado Vila Ipiranga difere de Jardim Tókio |
| 3 | [44571813](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-sabara-i-RS2300/id-44571813/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Sabará I | FORA DO UNIVERSO | bairro publicado Sabará I difere de Jardim Tókio |
| 3 | [46562714](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-higienopolis-293m2-RS4900/id-46562714/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Higienópolis | FORA DO UNIVERSO | bairro publicado Jardim Higienópolis difere de Jardim Tókio |
| 3 | [47761625](https://www.chavesnamao.com.br/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-jardim-agari-120m2-RS1300/id-47761625/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Jardim Agari | FORA DO UNIVERSO | bairro publicado Jardim Agari difere de Jardim Tókio |
| 3 | [47569666](https://www.chavesnamao.com.br/imovel/casa-para-alugar-5-quartos-com-garagem-pr-londrina-terras-de-santana-ii-501m2-RS15500/id-47569666/) | chaves-na-mao | locacao | Londrina / PR | Casa → casa | Terras de Santana II | FORA DO UNIVERSO | bairro publicado Terras de Santana II difere de Jardim Tókio |
