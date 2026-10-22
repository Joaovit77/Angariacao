# Radar — smoke funcional e acesso às coletas parciais

Data: 21/10/2026. Branch `codex/radar-baseline-novos`, HEAD `0e952d6`, alterações locais sem commit.

> Histórico da etapa anterior. O impedimento de bairro foi tratado localmente pela decisão posterior.
> O status vigente e a preparação para a próxima execução estão em
> [Bairro como dimensão do universo](RADAR-BAIRRO-UNIVERSO-ENTREGA.md).
> O smoke integrado real continua sem PASS e sem chamada paga.

**Status registrado ao encerrar a etapa anterior:**
`RADAR_BASELINE_COVERAGE_NOVO_FUNCTIONAL_SMOKE_HOLD_BAIRRO_REMOVIDO_DA_AQUISICAO_GLOBAL`

Não foi emitido PASS para o ciclo integrado real. O smoke visual local e os testes SQL abaixo não são
apresentados como coleta real do portal. Nenhuma chamada ao Firecrawl foi executada, nenhum dado
remoto foi escrito, nenhum custo pago foi autorizado ou gerado pelo agente.

## Correção diretamente necessária

Antes, observações qualificadas de coletas parciais já podiam entrar no banco, mas a resposta trazia
apenas Novos, não havia classificação parcial por anúncio, a leitura parava em 120 registros e uma
página sem proveniência podia ser descartada antes da consulta privada. Sem identidade/proveniência
suficiente para o global, a observação também desaparecia do resultado funcional.

Agora a coleta conserva seus anúncios utilizáveis mesmo sem prova de cobertura. A mesma RPC,
com parâmetro opcional `p_anuncios_base`, distribui observações adicionais **somente à busca/dono
solicitantes**, reaplicando seus filtros. Esses registros não viram identidades globais nem Novos.
URL segura do portal e contexto compatível continuam obrigatórios. Fallback posicional nunca é
identidade global. Uma falha nessa gravação desfaz a transação inteira, inclusive ingestão/baseline.
O payload global guarda somente um digest da base adicional, preservando idempotência sem copiar
seus dados para o histórico global.

A resposta inclui `anunciosColetados`; `anuncios` continua contendo somente Novos certificados para
preservar o contador e o monitor. A classificação `cobertura_coleta`, protegida contra edição pelo
cliente, acompanha a cópia privada. A UI mostra **Base não revisada** e **Coleta parcial**, permite
**Ver anúncio ↗** e **Carregar mais anúncios**. A página de leitura tem 120 itens, sem um teto total
que esconda o restante. Visualizados/repetidos continuam disponíveis pelo controle já existente.
Nenhum contador passa a contar a base inteira como Novo.

Migration local revisada e espelho canônico:

- [20261021120000_radar_baseline_cobertura_novos.sql](../supabase/migrations/20261021120000_radar_baseline_cobertura_novos.sql)
- [supabase-schema.sql](../supabase-schema.sql)

Código principal: `paginacaoRadar.ts`, `ingestaoRadar.ts`, `lib/radarAngariacao.ts`, contrato de cálculo
e `CentralAngariacaoView.tsx`. A/B permanecem intactas; sem backfill, novas tabelas globais, recortes,
schedulers ou arquitetura paralela. O harness visual é um ensaio temporário fora do código versionado,
usando o componente real e serviços substituídos por dados locais explícitos.

## Evidências locais

- Regressão ampliada de Radar, transporte, cobertura, leitura e isolamento: **1.359/1.359 passaram**.
- **12 casos novos** nesta correção: consulta parcial com link direto, ausência de proveniência,
  fallback apenas privado, proteção contra cobertura forjada, rollback integral, cache sem prova,
  três cenários de leitura paginada e três de interface.
- Os testes A–I anteriores permanecem preservados, incluindo zero/zero/um Novo, primeira/última
  observação, cache misto, quatro contextos, usuário novo e RLS.
- Build Webpack e TypeScript passaram. Lint sem erros, com um aviso preexistente em teste de IA.
- Suíte comum completa: **7.792 passaram / 7.797 executados**, em 388 arquivos. As cinco falhas
  restantes são as já conhecidas de mensagens agendadas. O teste de debounce do mapa passou
  nesta execução; sua oscilação anterior continua backlog. Essas áreas não tiveram código ou
  expectativas alterados. Não se apresenta a suíte geral como inteiramente aprovada.

### Smoke visual em navegador, com dados controlados

Executado sobre o **componente real** com CSS da aplicação, sessão/persistência sintéticas e conexões
externas bloqueadas no ensaio. Dados da tela identificados explicitamente como controlados de
Cambé, no ensaio anterior; este é apenas um registro histórico. A candidata ativa agora é Jardim
Tókio, Londrina/PR. Nenhuma capacidade geográfica foi alterada.

Observado:

1. Anúncio parcial visível com os dois rótulos, preço, localização e link direto, com zero Novos.
2. “Carregar mais anúncios” acrescentou a página seguinte sem remover a base anterior.
3. “Verificar agora” informou que a coleta parcial permanece disponível e não certificou novidades.
4. O clique em “Ver anúncio” marcou visto no serviço local controlado e abriu outra aba no destino
   local do link. Essa aba foi inspecionada e exibiu “Link direto aberto”. Nenhum destino real de anúncio
   foi fabricado para esse ensaio visual.
5. Os vistos continuam consultáveis pelo controle de visualizados/repetidos.
6. Console local sem erros ou avisos capturados.

Imagem de evidência: `radar-parcial-consultavel.png` no diretório local de artefatos deste chat.
Essa etapa não exercitou Auth/PostgREST real, aquisição Firecrawl nem persistência remota.

## Preparação atual: Jardim Tókio, sem alteração da matriz geográfica

**Chaves na Mão · Londrina/PR · Casa · Locação · Jardim Tókio**

URLs exatas solicitadas para o smoke:

- [Página 1](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/)
- [Página 2](https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/?pg=2)

A representação pública consultada nesta preparação mostra **19 casas** e um link publicado para a
página 2. São **duas páginas observáveis**, sem prova de que a segunda encerre a paginação: a leitura
da página 2 pela ferramenta pública retornou erro de acesso/cache. A aquisição real do produto não
foi executada. Contagem indexada, link publicado e mercado suportado não comprovam seu contrato de
HTML, identidades, cobertura ou fim da paginação. Não se certifica baseline a partir dessa preparação.

### Blocker direto: bairro removido da aquisição global

Londrina/PR pertence ao mercado suportado; não há necessidade de liberar outra cidade. Porém, o
fluxo integrado atual não adquire o recorte de bairro solicitado:

1. A rota autenticada lê a busca e chama `filtrosGlobaisRadar`, que conserva somente portal,
   cidade/UF, finalidade e tipo. `bairro` é descartado antes do coletor.
2. `buscarColetaPaginadaRadar` monta a URL com esses filtros globais. Para esta busca, a primeira URL
   efetiva seria `https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/`, sem Jardim Tókio.
3. `persistirColetaRadar` recusa filtros privados na ingestão. A chave de `radar_universos` não
   representa bairro: o total de Jardim Tókio não comprova cobertura do universo de Londrina inteira.

Evidências locais:

- [Filtros globais e recusa de ingestão privada](../web/lib/servidor/ingestaoRadar.ts)
- [Rota de verificação](../web/app/api/radar/verificar/route.ts)
- [Coletor paginado](../web/lib/servidor/paginacaoRadar.ts)
- [Contrato permanente](../PROJECT.md#baseline-cobertura-e-novidade-do-radar)

Usar a URL do bairro e registrar suas 19 ofertas como baseline da cidade invalidaria o contrato de
cobertura. Tratar o bairro como universo próprio exigiria uma decisão adicional sobre o escopo global,
vedada nesta retomada. Não foi alterado produto, schema, gate, geografia ou código para obter PASS.
Também não foi iniciada a coleta da cidade inteira. O bloqueio está comprovado no caminho local
antes de qualquer custo externo; não é apresentado como falha observada em uma aquisição paga.

Os testes existentes comprovam que filtros privados são removidos e que uma coleta privada não
forma baseline global. A suíte SQL/ponte foi repetida nesta retomada: **45/45 passaram**, com PGlite e
transporte simulado, incluindo preservação dos anúncios parciais, gate, isolamento e cenários A–I.
Nenhum teste existente foi alterado e nenhum teste novo foi necessário para esta atualização documental.

### Serviço, previsão e custo antes de qualquer execução paga

| Item | Preparação para Jardim Tókio |
|---|---|
| Serviço | Firecrawl `POST https://api.firecrawl.dev/v2/scrape`, proxy básico, somente `rawHtml` |
| URLs | As páginas 1 e 2 acima; seguintes somente se publicadas pelo portal |
| Paginação pública | Duas páginas observáveis; término ainda não comprovado |
| Previsão se o fim for comprovado na página 2 | 2 chamadas por rodada; 4 chamadas nas duas rodadas frescas (baseline e repetição) |
| Teto operacional já definido | 10 páginas e 10 chamadas pagas por rodada, sem aumento |
| Máximo nas duas rodadas | 20 chamadas básicas; execução paga ainda não autorizada |
| Créditos básicos | 1 crédito por página; previsão de 4 créditos, teto de 20 no conjunto |
| Referência de custo | Adicional Hobby de US$ 5/1.000 créditos: equivalente a US$ 0,02 previstos; até US$ 0,05/rodada ou US$ 0,10 nas duas |

Fonte: [preços oficiais do Firecrawl](https://www.firecrawl.dev/pricing), consultados nesta preparação.
Plano/saldo da conta não foram consultados. Os equivalentes de consumo não garantem o valor faturado;
recargas podem ocorrer em blocos de US$ 5, conforme configuração da conta, além de impostos/conversão.
Não foram comprados créditos, alterada cobrança nem usados formatos/extras de IA.

A previsão de quatro chamadas é condicional ao fim comprovado na página 2. Falhas/retries consomem
o orçamento de envios; o teto de dez não comprova cobertura. Se houver continuação ou incerteza ao
encerrar a rodada, manter parcial/incompleta e zero Novos. Cache não é rotulado como aquisição fresca.
Anúncios utilizáveis permanecem consultáveis com Base não revisada/Coleta parcial, link direto,
Carregar mais anúncios e acesso a vistos/repetidos.

Essa é uma preparação condicionada à resolução do blocker e à autorização específica de execução;
não há uma rodada paga autorizada por este relatório. O smoke integrado também continua dependendo
de ambiente isolado com Auth/PostgREST e credenciais próprios. PGlite não substitui essa validação.

### Histórico encerrado da candidata anterior

`RADAR_BASELINE_COVERAGE_NOVO_FUNCTIONAL_SMOKE_HOLD_CAMBE_ACQUISITION_NOT_PROVEN`
fica registrado exclusivamente como histórico. Cambé não é candidata ativa, não foi adicionada à
capacidade e não há investigação de suporte a Cambé nesta retomada.

## Matriz do smoke integrado real

| Verificação | Resultado real | Evidência disponível |
|---|---|---|
| Aquisição paginada pelo produto | Não exercitada | Navegação pública preparatória, sem Firecrawl |
| Primeira coleta/baseline/zero Novos | Não exercitada manualmente | SQL local e testes A–I |
| Segunda coleta/zero Novos/sem duplicação | Não exercitada manualmente | SQL local, replay e cache |
| First_seen/last_seen | Sem valores reais novos | Imutabilidade/avanço nos testes SQL; cache mantém instante original |
| Identidade inédita/exatamente um Novo | NÃO EXERCITADO MANUALMENTE | Testes controlados e regressão de cache misto |
| Parcial/sem baseline nem Novo | UI controlada e SQL local | Ofertas privadas acessíveis e gate fechado |
| Segundo usuário/ações privadas | Não exercitado em Auth real | RLS e distribuição em SQL isolado |
| Casa/Apartamento, Locação/Venda | Não exercitado no portal real | Regressões existentes dos quatro contextos |
| Telemetria de aquisição real | Nenhuma rodada paga | Contratos testados, contagens de fixtures explícitas |

## Londrina e próximos passos delimitados

Londrina permanece o cenário real de uso. A instrução mais recente determina **STOP após o smoke**.
Não iniciar automaticamente adequação do universo maior, outra busca, recortes globais, estratégia
ou aumento de teto. O impedimento do recorte Jardim Tókio exige decisão antes de retomar o integrado.

Para a fixture de 3.080 ofertas:
`LARGE_UNIVERSE_EXCEEDS_CURRENT_ROUND_CAP`.

O máximo teórico de dez páginas com o parser de até 50 itens por página permanece 500. Coleta parcial
continua útil e consultável, mas não comprova baseline/Novo. Recortes globais, retomada entre rodadas,
novos schedulers e aumento de teto dependem de decisão posterior; não foram implementados.

Validação automatizada concluída, mas o fluxo real não foi exercitado. **Aguardando smoke manual
integrado e resolução do blocker de escopo acima.** O roteiro das etapas reais é o pedido original: baseline
zero, repetição zero, identidade inédita somente se controlável, interrupção parcial, segundo usuário,
quatro contextos e telemetria. Não fabricar um inédito real para obter PASS.

STOP antes de custo pago, commit, push, deploy, aplicação remota ou nova estratégia.
