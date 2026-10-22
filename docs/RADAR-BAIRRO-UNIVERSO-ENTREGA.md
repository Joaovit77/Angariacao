# Radar — bairro como dimensão opcional do universo

Data: 21/10/2026. Branch `codex/radar-baseline-novos`, HEAD `0e952d6`, sem commit.

Status local: `RADAR_BAIRRO_GLOBAL_UNIVERSE_IMPLEMENTED_READY_FOR_SMOKE`.
O status depende das verificações locais registradas abaixo; não é PASS do smoke integrado real.

Atualização de 22/10/2026: o [smoke integrado real de Jardim Tókio](RADAR-SMOKE-REAL-JARDIM-TOKIO.md)
foi executado e terminou em HOLD por divergência da URL JSON-LD da página 2. A condição READY
acima é histórica da implementação local; o smoke real não recebeu PASS.

## Comportamento anterior e alteração

Antes, `filtrosGlobaisRadar` removia bairro e o coletor consultava a cidade inteira. A chave do universo
não representava bairro. Esse era o blocker documentado em
[smoke funcional anterior](RADAR-SMOKE-FUNCIONAL.md).

Agora a busca com bairro conserva essa dimensão antes do coletor. O universo inclui bairro canônico;
NULL representa cidade inteira. Acento, case, espaços e hífen de slug convergem na mesma chave.
A oferta global continua única por portal + finalidade + native ID forte, compartilhada entre universos
por presenças. Baselines e marcos são exclusivos do universo, e a distribuição seleciona somente buscas
daquele mesmo contexto, antes de reaplicar os filtros privados restantes. Não há backfill.

A migration existente não comportava a dimensão. Foi revisada a **mesma migration local**, sem
acrescentar outra migration. A/B não foram alteradas. A extensão adiciona `bairro`, substitui somente
a unicidade original por índice que inclui `coalesce(bairro,'')` e protege a nova dimensão contra
alteração. O nome do índice é preservado; o conflito da ponte passa a usar `ON CONFLICT DO NOTHING`.
Nenhuma função de integridade B foi substituída. As FK de baseline por universo, imutabilidade dos
fatos, first_seen e avanço monotônico de last_seen continuam exercitadas em banco isolado.

A versão semântica 2 continua sendo o contrato integral da ponte ainda local; a dimensão nullable
separa cidade/bairro sem reutilizar baseline de outro contexto nem a versão amostral A/B. Ao mudar
contexto por operação servidora, os marcos privados são reiniciados e certificados do contexto anterior
não permanecem como pendências do novo universo. O cliente continua impedido de forjar contexto,
certificação ou proveniência.

## Rota publicada e coverage

O cadastro de rotas qualificadas é explícito e limitado a contextos com evidência pública. Nesta fatia,
Jardim Tókio foi qualificado para Chaves na Mão/Londrina/PR/Casa/Locação. Não se geram slugs de bairro
livre, todos os bairros de Londrina ou combinações de contexto a partir dessa rota.

`urlUniversoRadar` seleciona a URL publicada antes do coletor. Sem rota admitida, a coleta termina com
`bairro_sem_rota_canonica`, zero transporte e cobertura desconhecida, sem cair na cidade inteira.
O HTML adquirido ainda precisa comprovar a URL exata de cada página em `RealEstateListing`, total,
IDs, sequência e fim da paginação. Uma canonical HTML, se presente, deve concordar com o bairro/página.
A prova da rota também acompanha a RPC, que verifica compatibilidade de portal/cidade/UF/tipo/finalidade/bairro antes de aceitar cobertura completa. Cadastro de rota por si só não certifica coverage.

Coletas parciais/desconhecidas continuam entregando anúncios utilizáveis como Base não revisada /
Coleta parcial, com link direto, carregamento adicional e consulta de vistos/repetidos. O gate controla
somente baseline/Novo. Preço, período, proprietário e ações privadas não entram na identidade do universo.

## Arquivos principais

- [Migration local revisada](../supabase/migrations/20261021120000_radar_baseline_cobertura_novos.sql)
- [Espelho canônico](../supabase-schema.sql)
- [Normalização e rotas qualificadas](../web/lib/calculo/bairroUniversoRadar.ts)
- [URL efetiva do universo](../web/lib/servidor/universoRadar.ts)
- [Ponte servidora](../web/lib/servidor/ingestaoRadar.ts)
- [Coverage](../web/lib/servidor/coberturaRadar.ts)
- [Paginação](../web/lib/servidor/paginacaoRadar.ts)
- [Monitor compartilhado](../web/lib/servidor/monitorRadarAngariacao.ts)
- [Testes de banco e ponte](../web/tests/radar-baseline-cobertura-novos.test.ts)
- [Regressão paginada](../web/tests/radar-paginacao.test.ts)
- [Rota autenticada](../web/tests/radar-verificar-route.test.ts)

## Testes obrigatórios A–J

| Caso | Verificação no banco/ponte isolados |
|---|---|
| A | Cidade inteira e Jardim Tókio têm universos distintos; NULL não duplica cidade |
| B | Dois usuários de Jardim Tókio reutilizam o mesmo universo com cópias privadas próprias |
| C | Baseline de Jardim Tókio não certifica nem distribui para cidade inteira |
| D | Baseline de cidade inteira não certifica nem distribui para Jardim Tókio |
| E | Mesmo native ID produz uma oferta global, com presenças nos dois universos; first_seen preservado |
| F | Case/acento/slug/espaços convergem no servidor e na RPC, inclusive acento decomposto |
| G | Rota não qualificada ou declaração de listagem divergente fecha coverage; transporte desconhecido não é iniciado |
| H | Bairro parcial mantém anúncio consultável, link direto e zero Novos |
| I | Visto permanece privado; ações privadas não são admitidas no payload de fatos protegidos nem vazam para outro usuário/global |
| J | Troca servidora cidade/bairro inicia comparação do contexto correto, sem falsos Novos |

O ensaio integrado local usa o transporte real com respostas HTTP sintéticas, parser, coletor paginado,
ponte e RPC real em PGlite. São 19 anúncios sintéticos em duas páginas: primeira baseline/zero Novos,
repetição/zero, inclusão de um native ID inédito/um Novo. Não são ofertas reais nem resultado do Firecrawl.
A rota autenticada também comprova que bairro vem da busca do dono, ignorando filtros fornecidos no corpo.
Há regressões de canonical contraditória, listagem de outro bairro, contexto divergente e teto parcial.

As expectativas antigas que tratavam bairro como filtro privado foram atualizadas exclusivamente pela
decisão explícita de produto. Preço/região/proprietário/período continuam cobertos; os cenários anteriores
A–I e as proteções A/B foram preservados. Nenhum teste lateral foi enfraquecido.

## Validação desta fatia

- Contrato final de bairro/paginação/rota autenticada: **108/108 passaram** (63 banco/ponte,
  34 paginação e 11 rota). Inclui A–J, prova SQL da rota de outro contexto, normalização,
  proteção de bairro branco, parcial, native ID compartilhado e troca de universo.
- Fronteira do Radar: **5/5 passaram** na reexecução isolada, sem alteração de expectativas.
- Suíte comum integral executada antes dos quatro últimos casos de endurecimento SQL:
  **7.814 passaram / 7.821 executados**, em 388 arquivos. As sete falhas foram as cinco já
  conhecidas de mensagens agendadas, o teste temporal do mapa e a fronteira do Radar.
  Os quatro casos adicionais e a migration final foram verificados nos 108 testes acima.
- A fronteira passou isoladamente. O mapa continuou falhando na reexecução por **0,034 ms** no
  limite de espera (1.094,966 ms observados para mínimo de 1.095 ms), mantendo a oscilação
  anteriormente registrada como backlog. Nenhum arquivo de produto/teste do mapa ou de mensagens
  agendadas foi alterado para acomodar essas falhas.
- Primeira execução geral sob concorrência com build/lint: 7.807/7.820 passaram, com 13 falhas.
  A repetição geral acima não reproduziu as seis falhas adicionais de Prospecção/Vendas. Não se
  apresenta a suíte geral como inteiramente aprovada nem se atribui uma causa não comprovada.
- TypeScript passou. Lint: zero erros; um aviso preexistente de `_choices` em teste de IA.
- Build final Webpack: **passou**. O modo foi escolhido por
  compatibilidade com a junção local de dependências do worktree; nenhuma configuração de produção
  foi alterada.
- `git diff --check` passou; links locais conferidos. A/B foram comparadas com HEAD e permanecem
  intactas. A migration C coincide literalmente com seu bloco no schema canônico.

Há **28 casos novos** nesta fatia: 18 de banco/ponte (A–J e proteções complementares), nove de
paginação/prova da rota e um de rota autenticada. A validação usa somente mocks/fixtures e PGlite;
não carregou `.env.local` nem executou suítes reais da OpenAI ou Firecrawl.

## Smoke visual local

O componente real foi exercitado em navegador com CSS da aplicação, busca sintética de Jardim Tókio,
sessão/persistência controladas e conexões externas bloqueadas. Foram observados Base não revisada,
Coleta parcial, zero Novos, Carregar mais anúncios, aviso de parcial, abertura do link direto em outra
aba local e consulta de vistos/repetidos. Console sem avisos/erros capturados. Nenhuma alteração visual
foi necessária nesta fatia. Este ensaio não valida Auth/PostgREST nem aquisição real do portal.

Evidência local: `radar-smoke-ui/radar-bairro-parcial-consultavel.png`, nos artefatos deste chat.

## Preparação do mesmo smoke antes de qualquer custo pago

- Serviço: Firecrawl `POST https://api.firecrawl.dev/v2/scrape`, proxy básico e `rawHtml`.
- URL efetiva: [página 1](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/).
- Próxima publicada: [página 2](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/?pg=2).
- Identidade: `chaves-na-mao | locacao | PR | londrina | casa | todos | v2 | bairro=jardim tokio`.
  A cidade inteira tem `bairro=NULL` e outro UUID de universo. Não há UUID remoto criado.
- A representação indexada mostrava 19 ofertas; a navegação pública direta desta preparação mostrou
  **33 casas e link para página 2**. O fim e o contrato de aquisição continuam sem comprovação pelo
  produto. Essa diferença não foi fixada em constante, fixture de produção ou critério de coverage.
- Duas páginas observáveis: previsão condicional de 2 chamadas por rodada, 4 chamadas para baseline
  e repetição frescas. Se houver mais páginas publicadas, seguir somente enquanto couber no teto e prazo.
- Teto preservado: **10 páginas / 10 chamadas pagas por rodada**. No conjunto de duas rodadas, até
  20 chamadas. Atingir teto sem fim comprovado mantém parcial/incompleta e zero Novos.
- Scrape básico: 1 crédito/página. Previsão de 4 créditos; teto de 10 por rodada/20 nas duas.
  Referência adicional Hobby US$ 5/1.000 créditos: equivalente a US$ 0,02 previstos, até US$ 0,05 por
  rodada e US$ 0,10 nas duas. [Preços oficiais](https://www.firecrawl.dev/pricing).
  Plano/saldo não consultados; o valor faturado depende da conta, recargas e impostos/conversão.

Nenhuma chamada paga foi executada ou autorizada por este relatório. Não houve uso de Supabase remoto,
Production, commit, push, deploy ou backfill. A matriz geográfica permanece intacta. Cambé permanece
exclusivamente no histórico, sem exceção nem investigação de suporte.

## Limites, backlog e próxima etapa

A biblioteca de rotas não admite automaticamente outros bairros/contextos. O smoke integrado real
continua dependente de autorização específica para Firecrawl e ambiente isolado com Auth/PostgREST
próprios; PGlite e a sessão sintética não substituem esse contrato.

O único próximo passo previsto é executar o mesmo smoke autorizado de Jardim Tókio: conferir URL e
universo efetivos, primeira coleta/baseline/zero, repetir/zero, consultar links/base parcial/vistos e
registrar páginas, resultados, chamadas e motivo de término. Identidade inédita deve ser exercitada
somente quando houver cenário real controlável; não fabricar oferta do portal para obter PASS.

As cinco falhas preexistentes de mensagens agendadas e a oscilação temporal do mapa permanecem
backlog lateral. O custo das varreduras estáticas de fronteira na suíte completa merece acompanhamento;
a reexecução isolada passou e não houve violação do contrato do Radar.

Universos maiores que 500/3.080 ofertas, recortes por preço, múltiplos bairros automáticos, retomada
entre rodadas, novo scheduler e aumento do teto continuam fora desta fatia. STOP antes da chamada paga.

**Validação automatizada concluída, mas o fluxo real não foi exercitado. Aguardando smoke manual.**
