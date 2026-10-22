# Radar — rodada 1 real após revisão do orçamento temporal

`RADAR_JARDIM_TOKIO_FIRST_VALID_BASELINE_HOLD_PAGE_3_ITEMLIST_EXCEEDS_DECLARED_TOTAL`

A P3 foi adquirida com sucesso. A sequência foi rejeitada porque o ItemList das três páginas contém
45 IDs nativos distintos diante de um total declarado estável de 33. O fim não foi comprovado;
coverage permaneceu parcial, baseline ausente e Novos = 0. Nenhuma regra foi ajustada durante o smoke.

Execução em 22/10/2026, das 12:59:46.955 às 13:00:15.471 BRT (15:59:46.955–16:00:15.471 UTC).
Uma única rodada manual fresca, resposta HTTP 200 em 28.516ms. Branch `codex/radar-baseline-novos`,
HEAD `0e952d6`, sem commit. O [HOLD anterior por tempo](RADAR-JARDIM-TOKIO-RERUN-RODADA1-20261022.md)
e a [revisão temporal](RADAR-PAGINACAO-ORCAMENTO-TEMPO-ENTREGA.md) continuam preservados como histórico.

## Alvo e contenção

Reutilizados a conta sintética, a busca `9b526f48-9c31-4d7a-8f67-845d4597a30d` e o universo
`32e1fdc8-3395-4bcd-889a-763da61abbb4`: Chaves na Mão / Locação / PR / Londrina / Casa / todos /
v2 / bairro `jardim tokio`. Não houve nova busca, universo, geografia ou recorte.

Antes de abrir a janela, o mesmo transporte temporário carregado pelo servidor passou em nove
bloqueios simulados fora da rodada, abrangendo Firecrawl e HTTP externo, janela expirada e rodada 2.
O décimo envio simulado foi permitido e o décimo primeiro bloqueado; zero rede real nesse teste.
O servidor registrou o guard carregado e fechado; os caps do produto e da barreira eram 10/10.
Não havia abas do agente abertas nem jobs na tabela `cron.job` da stack exclusiva.
A rota autenticada foi aquecida com origem inválida: HTTP 400, sem aquisição nem consumo.

O controle abriu somente para esta rodada 1 e fechou ao receber a resposta. Uma trava de execução
impede repetir o controlador. No fechamento, Firecrawl e dois destinos HTTP foram novamente
recusados pelo mesmo guard/controle real, com fetch simulado, zero rede e ledger intacto.
O servidor dedicado foi encerrado; a porta 56530 está fechada. Docker e banco foram preservados.
Scheduler/monitor do produto não foram alterados.

## Aquisição real e orçamento

Firecrawl `/v2/scrape`, proxy `basic`, formato `rawHtml`, `maxAge: 0`. Três chamadas próprias e frescas,
sem cache, retry, fallback HTTP, IA ou proxy adicional. Cada resposta informou **1 crédito**:
**3 chamadas / 3 créditos** nesta rodada. Não há valor monetário confirmado pelo retorno.
Os históricos anteriores consumiram quatro chamadas/créditos; somados, são sete, em autorizações
separadas. O ledger novo não reiniciou nem sobrescreveu os ledgers históricos.

| Página | Restante antes da página | Restante antes do envio | Guard | Transporte | HTTP API/portal | IDs novos / acumulados | Total declarado | Decisão |
|---|---:|---:|---:|---:|---|---|---:|---|
| P1 | 119.971,639ms | 119.914,028ms | 95.000ms | 6.252ms | 200 / 200 | 15 / 15 | 33 | Admitida; next publicado para P2 |
| P2 | 113.174,698ms | 113.140,078ms | 95.000ms | 6.607ms | 200 / 200 | 15 / 30 | 33 | Admitida; sem next, tentar somente P3 por total ainda não reconciliado |
| P3 | 106.184,579ms | 106.145,702ms | 95.000ms | 5.603ms | 200 / 200 | 15 / 45 | 33 | Evidência individual lida; sequência rejeitada por 45 > 33 |

URLs solicitadas e efetivas coincidiram exatamente, sem redirect informado:

1. [P1](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/)
2. [P2](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/?pg=2)
3. [P3](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/?pg=3)

Os instantes vêm do relógio monotônico nativo usado pela rota, observado pelo preloader temporário;
nenhum valor foi substituído e o prazo não foi reiniciado. Permaneceram 120s totais, 60s Firecrawl,
15s HTTP contingencial e 35s de finalização; o guard HTTP de 50s não precisou ser exercitado nesta
rodada real. P3 começou com 106,185s, comprovando a superação do blocker temporal anterior.

As três páginas publicaram JSON-LD/canonical da URL base. P2 foi admitida com o aviso informativo
`portal_document_url_not_pagination_aware`. P3 tem o mesmo aviso documental quando lida isoladamente;
a reprovação ocorreu na sequência, não por canonical da base. Não houve gap, repetição de IDs ou
retorno da URL efetiva à primeira página. P3 só publicou `prev` para P2; ausência de next não vence
a incompatibilidade do total. Não foi presumido que P3 teria três itens, nem adquirida P4.

A conferência offline executou as mesmas funções `lerEvidenciaPaginaRadar` e
`avaliarSequenciaChavesRadar` do worktree sobre os HTMLs capturados: P1/P2 admitidas; P3 individual
legível com 15 IDs, sequência completa retornando null. Zero rede nessa conferência.
Não foi feita nova investigação externa para reinterpretar o ItemList ou corrigir seu contrato.

## Persistência e acesso

Varredura nova: `e10c2a91-2039-4373-b437-853950dc6a12`, mesmo universo, finalizada às
16:00:15.227037 UTC. `status = partial`, `cobertura = desconhecida`,
`codigo_resultado = cobertura_insuficiente`. API: `cobertura = parcial`,
`motivoTermino = evidencia_inconsistente`. A resposta registrou três páginas e caps 10/10.
`paginas_planejadas = 4` é contagem conservadora persistida, sem aquisição de P4 nem prova de sua necessidade.

- Baseline ID e conclusão continuam NULL; `baselineFormada = false`; Novos = 0.
- As nove varreduras anteriores permanecem byte a byte equivalentes no snapshot; nenhuma foi promovida.
- Nos 30 registros antigos, `primeiro_visto_em` ficou em `2026-10-21T19:51:12.021+00:00`.
- Nos mesmos 30, `ultimo_visto_em` avançou para `2026-10-22T15:59:54.902+00:00`, conforme persistido.
- O estado privado visualizado do ID `45597290` foi preservado; nenhuma ação de revisão foi gravada.
- Foram 45 observações no conjunto, 44 ofertas admitidas globalmente e 33 anúncios compatíveis disponíveis
  na assinatura privada. Essas contagens têm escopos diferentes; não significam 45 Novos ou coverage válida.
- A assinatura passou de 30 para 33 anúncios. Os IDs adicionais consultáveis são `34189630`, `44107045`
  e `45735542`. Este último permanece sem vínculo global; sua consulta privada foi preservada.
  Nenhum dos 33 tem `novidade_varredura_id`.

A interface real autenticada mostrou Jardim Tókio/Londrina, Base não revisada aguardando cobertura,
Coleta parcial, preço, localização, portal e links. A opção de mostrar visualizados/repetidos foi
exercitada e o anúncio antigo continuou acessível. Foram conferidos **33 links renderizados**,
exatamente iguais ao conjunto das URLs privadas. Não foi necessário abrir todos os anúncios.
Não houve contato, WhatsApp, visita, importação ou marcação em lote.

A base tem 33 itens, abaixo da página de leitura de 120; assim, o botão Carregar mais anúncios não
precisa aparecer neste conjunto e não foi exercitado com dados reais. O contrato de leitura não mudou.
A transição visual após baseline não pôde ser exercitada porque nenhuma baseline foi formada.
As miniaturas ficaram indisponíveis sob a barreira de rede fechada; preço, texto e links permaneceram
usáveis. Não houve ajuste visual ou relaxamento da barreira para carregar imagens externas.

## Telemetria e limitação do instrumento

Ledger, HTMLs, orçamento observado, resposta autenticada e varredura persistida estão preservados.
O log do servidor contém as fases das três aquisições, correlacionadas por execução
`7ef0fa7b-bd4a-4867-b0c9-0059b3145e24`, com tentativa própria, resposta 200 e resultado interpretado.

Depois da resposta, o observador temporário do relógio tentou ler o controle enquanto o controlador
reescrevia o arquivo para fechá-lo. Isso gerou `SyntaxError: Unexpected end of JSON input` no
preloader e encerrou o processo durante o `after()` de registro. O novo evento final **não foi gravado
em `log_eventos`**. Essa falha pertence ao instrumento local usado neste ensaio; não é evidência de
falha da cobertura nem foi apresentada como regressão do produto. Não foi corrigida durante o smoke.
A janela ficou fechada e os dados da varredura já estavam persistidos.

O servidor foi reaberto somente com controle fechado para a conferência da interface, depois encerrado.
A ausência de qualquer outra varredura e o ledger ainda em três comprovam que isso não foi nova rodada.
A limitação do observador está registrada para uma eventual preparação futura, sem reexecução paga.

## Verificações e encerramento

Comprovações desta execução: barreira antes/depois; caps; Auth/rota real; aquisição real P1/P2/P3;
adapter offline sobre HTML real; persistência transacional local; comparação dos snapshots; acesso
pela UI e igualdade dos 33 links. Os 1.187 arquivos rastreados conferidos antes de escrever este
relatório permaneceram idênticos por SHA-256. Não houve mudança de código, schema ou migration.

A regressão anterior permanece documentada na entrega temporal: 305 testes focados aprovados,
TypeScript/build aprovados, lint sem erros; suíte comum com 7.853 aprovados e seis falhas laterais
preexistentes/oscilatórias. Essas suítes não foram reexecutadas neste gate sem mudança de código;
o smoke real e suas limitações foram registrados separadamente. Links locais e `git diff --check`
conferidos no fechamento da documentação.

Artefatos fora do Git, em
`C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-tokio-rerun-budget-rodada-1-20261022/`:
`pre-condicoes.json`, `preflight-barreira-local.json`, `fechamento-verificado.json`, `ledger.json`,
`prova-por-pagina.json` (IDs e decisões completos), `prova-adapter-runtime-offline.json`,
`resultado-rodada-1.json`, snapshots antes/depois/final, `links-ui.json`, `anuncios-coletados.md`,
`resumo-smoke.json`, log e capturas `radar-resumo-parcial.png` / `radar-parcial-consultavel.png`.
Credenciais/sessão ficam somente nos arquivos locais privados; não integram este relatório nem o Git.

**STOP no blocker factual da P3. Sem correção no ensaio, rodada 2, universo de 3.080 ofertas,
nova arquitetura, scheduler, geografia, aplicação remota, Production, commit, push ou deploy.**
A primeira baseline válida e os cenários posteriores continuam pendentes de decisão separada.
