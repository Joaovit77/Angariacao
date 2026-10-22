# Radar — baseline, cobertura e detecção de novos

> Histórico do slice inicial. A capacidade atual de paginação, a configuração e as limitações estão na [entrega de paginação](RADAR-PAGINACAO-ENTREGA.md).

Data: 21/10/2026. Base: `0e952d6`. Branch: `codex/radar-baseline-novos`.
Worktree: `C:/Users/Corretor/.codex/worktrees/radar-baseline-novos/Angariacao`.

## Resultado e limites

Implementação local da ponte funcional: coleta com proveniência → qualificação → ingestão global →
gate de cobertura → baseline → comparação → distribuição privada. O ciclo positivo foi exercitado
com HTML controlado, código real da ponte e SQL em PGlite isolado. Não houve aplicação remota.

**Aguardando smoke manual integrado.** PostgreSQL/PostgREST nativos, autenticação real e portais
reais não foram exercitados. Não foram acionadas APIs pagas. Não declarar o produto inteiro validado.

**Limite prático importante:** a aquisição existente lê uma página com até 50 anúncios. O adaptador
inicial comprova cobertura somente no Chaves na Mão quando o total declarado da listagem inteira
cabe nessa página e todos os IDs são qualificados. A fixture real de Apartamento em Londrina declara
3.080 resultados e fica bloqueada corretamente. Buscas grandes e os demais formatos/portais
continuam sem Novo até uma próxima fatia de aquisição comprovar cobertura suficiente. A ponte e a
regra funcionam localmente; a cobertura real de mercados grandes permanece uma pendência de produto.

O próximo slice recomendado é aquisição paginada com teto explícito de páginas/custo e evidência de
conclusão, ou recortes globais menores e versionados, compartilhados entre buscas equivalentes.
Não liberar amostras por relevância como se fossem completas para contornar essa limitação.

## Antes e depois

Antes, um ID ausente no histórico privado da busca virava visto=false e podia aparecer como Novo,
sem comprovação da baseline inicial ou da cobertura atual. first_seen/last_seen e primitivas globais
existiam no schema A/B, mas não eram chamadas pelo produto.

Agora, visto é ação privada e novidade_varredura_id é certificação servidora. A primeira coleta
válida forma baseline e gera zero Novos; a segunda igual gera zero; uma identidade nativa inédita em
coleta válida posterior gera um Novo. Coleta parcial, desconhecida, truncada ou sem proveniência
não gera Novo. Identidades observadas em parciais não são promovidas retroativamente.

Uma assinatura nova recebe Base não revisada. Não recebe o histórico global inteiro como Novo.
Primeira observação é imutável, última observação avança sem regredir e reaparecimento conserva
histórico. Cache e single-flight conservam a aquisição original; retry não renotifica.

## Migration e schema

Criada [20261021120000_radar_baseline_cobertura_novos.sql](../supabase/migrations/20261021120000_radar_baseline_cobertura_novos.sql),
espelhada literalmente no bloco `BEGIN/END RADAR BASELINE COBERTURA NOVOS` de
[supabase-schema.sql](../supabase-schema.sql).

A migration:

- acrescenta universo/marcos de comparação às buscas e vínculo global/certificação aos anúncios privados;
- acrescenta payload idempotente à varredura, sem novos dados privados no global;
- cria a RPC registrar_coleta_radar, exclusiva de service_role, definer, owner postgres e search_path vazio;
- reutiliza registrar_presenca, finalizar_varredura e formar_baseline de B;
- serializa por universo e distribui snapshots da própria aquisição, inclusive no replay após outra observação global;
- protege marcos, identidades e dados certificados contra edição pelo cliente; mantém visto privado sob RLS;
- faz o contador considerar somente novidades certificadas não vistas;
- usa versão semântica 2 para não reutilizar baseline amostral de contratos anteriores.

A/B não foram modificadas. Não há backfill automático de histórico legado. Não foram criadas tabelas
paralelas. A aplicação local ocorreu exclusivamente nos bancos descartáveis em memória dos testes.

## Código criado e reaproveitado

| Arquivo | Alteração |
| --- | --- |
| [ingestaoRadar.ts](../web/lib/servidor/ingestaoRadar.ts) | Qualificação nativa, allowlist objetiva, contexto global e chamada da transação. |
| [coberturaRadar.ts](../web/lib/servidor/coberturaRadar.ts) | Gate conservador baseado no total integral e IDs do ItemList da listagem. |
| [radar/verificar/route.ts](../web/app/api/radar/verificar/route.ts) | Autentica e lê busca/filtros pelo dono confiável; não aceita anúncios/cobertura do cliente. |
| [firecrawlCentralAngariacao.ts](../web/lib/servidor/firecrawlCentralAngariacao.ts) | Proveniência por aquisição; cache vinculado ao hash do HTML; fonte fresca para nova aquisição Radar. |
| [fallbackHttpChaves.ts](../web/lib/servidor/fallbackHttpChaves.ts) | Repassa proveniência da coleta HTTP existente. Cache antigo sem proveniência não é certificado. |
| [monitorRadarAngariacao.ts](../web/lib/servidor/monitorRadarAngariacao.ts) | Cron chama a mesma ponte para buscas explícitas; legado permanece base sem promoção global automática. |
| [radarAngariacao.ts](../web/lib/radarAngariacao.ts) | Cliente delega a verificação ao servidor; adapta certificação e revisão por oferta qualificada. |
| [calculo/radarAngariacao.ts](../web/lib/calculo/radarAngariacao.ts) | Contratos de classificação e deduplicação da própria entrada. |
| [CentralAngariacaoView.tsx](../web/components/central/CentralAngariacaoView.tsx) | Separa Base não revisada e Novo; revisão de Locação não oculta Venda; escrita precede estado local. |
| [observabilidadeRadar.ts](../web/lib/servidor/observabilidadeRadar.ts) | Registro da quantidade confirmada no servidor. |
| [PROJECT.md](../PROJECT.md) | Contrato permanente da ponte, cobertura e limites. |

Para a fonte fresca, maxAge=0 segue a [documentação oficial do Firecrawl](https://github.com/firecrawl/firecrawl-docs/blob/main/advanced-scraping-guide.mdx).

Preservados os parsers, cache/single-flight, limites de rodada, regras de carteira, finalização de
comparáveis e fronteiras de autenticação. A coleta global remove filtros privados; a distribuição
reaplica preço, bairro, região, dormitórios, proprietário e período quando há evidência suficiente.
Casa/Apartamento e Locação/Venda são preservados. Não há exclusão global da Imobiliária Atual.
Não foi introduzido matching heurístico entre portais nem cruzamento novo com Catálogo/Pipeline.

As etiquetas e a disponibilidade da revisão de itens da base são os ajustes visuais desta entrega.
Não houve redesign, mudança de tema ou alteração de CSS.

## Testes A–I

Foram acrescentados 45 casos: 29 de banco/ponte, 9 da rota, 3 da interface e 4 de proveniência.

[radar-baseline-cobertura-novos.test.ts](../web/tests/radar-baseline-cobertura-novos.test.ts) aplica A/B e a nova
migration num banco isolado e cobre:

| Cenário | Resultado |
| --- | --- |
| A. Primeira coleta válida | Baseline formada; zero Novos. |
| B. Segunda coleta igual | Zero Novos e sem duplicação. |
| C. ID inédito em coleta válida | Exatamente um Novo. |
| D. Parcial/desconhecida/truncada | Zero Novos, antes e depois da baseline. |
| E. Reordenação e duplicação | Sem Novos extras nem duplicação da identidade. |
| F. Reobservação/reaparecimento | first_seen preservado; last_seen avança. |
| G. Novo usuário | Base não revisada, sem novidade histórica em massa. |
| H. Tipo/finalidade | Contextos separados; replay usa o snapshot correto. |
| I. Estado privado | RLS e visto isolados; cliente não forja certificação nem edita dados certificados. |

Os 29 testes desse arquivo incluem ainda rollback durante a distribuição, payload divergente,
cache/replay, filtros privados e um mutante que quebra o gate: o mesmo oráculo detecta o falso Novo.
O fluxo HTML → gate → RPC → distribuição usa a implementação real e SQL, não um mock da regra.

Novos testes complementares:

- [radar-verificar-route.test.ts](../web/tests/radar-verificar-route.test.ts): 9 casos de autenticação,
  dono confiável, entrada forjada, ambiente indisponível e falhas de coleta/transação.
- [radar-interface.test.ts](../web/tests/radar-interface.test.ts): 3 smokes do componente real em DOM
  isolado, incluindo revisão por finalidade e falha de escrita sem alteração otimista.
- [firecrawl-cache.test.ts](../web/tests/firecrawl-cache.test.ts): 4 novos casos de proveniência,
  cache antigo, single-flight e metadado incompatível.

Os casos existentes do cliente foram adaptados incrementalmente, preservando todos os cenários.
Casos legados sem baseline/cobertura passaram a exigir zero Novos por mudança explícita de requisito;
seus asserts de coleta, payload, histórico, isolamento e observabilidade foram mantidos.
Listas fechadas de migrations reconhecem somente a sucessora autorizada. Âncoras históricas retiram
somente seu bloco literal validado; hashes esperados não foram atualizados para acomodar mudanças.

## Resultados de validação

- Domínio final Radar/Firecrawl/fallback: **1.311 testes aprovados, zero falhas**.
- Suíte comum completa: **7.743 aprovados / 7.748 executados; 5 falhas preexistentes** em mensagens
  agendadas, reproduzidas na base 0e952d6. A regressão adicional final de snapshot foi validada na
  rodada direcionada de 29 testes e no domínio final acima.
- TypeScript: aprovado. Lint: zero erros; um warning preexistente de variável não usada em
  ia-contrato-requisicao.test.ts, linha 657, deixado fora do escopo.
- Build com Webpack: aprovado, incluindo a nova rota. O build padrão com Turbopack falhou por
  limitação da junction de node_modules fora da raiz do worktree; nenhuma configuração do produto
  foi alterada para contornar isso.
- Smoke HTTP do build local, restrito a 127.0.0.1 e com configuração pública sintética/chaves pagas
  vazias: POST sem sessão/usuário forjado → 401; GET não permitido → 405. Servidor encerrado.
- diff --check: sem erros. Espelho literal e links locais conferidos; índice sem alterações staged.

Quatro fixtures congeladas de Venda tinham CRLF no checkout e falhavam no hash também na base.
Para a validação local foram restaurados os bytes exatos do Git, conferidos antes com o manifesto.
Nenhum hash esperado ou conteúdo lógico dessas fixtures foi modificado.

## Pendências laterais e riscos

1. Cinco falhas preexistentes em mensagens-agendadas.test.ts: duas expectativas de consolidação
   órfã/contato-consolidado e três verificações de grants de efetivar_consolidacao_contato.
   Confirmadas na base e não alteradas, pois não bloqueiam o fluxo do Radar.
2. Turbopack versus junction do worktree: limitação de ambiente; Webpack validou o build local.
3. Normalização de finais de linha das fixtures em checkouts Windows: documentada; eventual política
   permanente de Git fica para outra tarefa.
4. Aquisição de mercados maiores que uma página: pendência prática que mantém o gate fechado;
   exige próximo slice com orçamento e evidência de cobertura definidos.
5. Baseline de vazio legítimo: segue bloqueada pelo contrato positivo existente de B.
6. Buscas legadas sem tipo/finalidade explícitos: precisam ser salvas com o contrato explícito para
   a nova comparação; não há conversão silenciosa do histórico em base global.
7. Locks/concorrência e ACL via PostgreSQL/PostgREST nativos ainda precisam de smoke independente.
   PGlite não substitui esse contrato real de integração.

## Smoke manual necessário antes de merge

Usar um ambiente LOCAL descartável, independente da composição pausada, com duas contas de teste.
Não usar Supabase remoto ou Production. Não copiar secrets produtivos. Transporte pago só pode ser
acionado deliberadamente pela pessoa autorizada; o Codex não executou esse transporte.

1. Aplicar a migration nova sobre a base local com A/B e autenticar as duas contas.
2. Sem capacidade de coleta configurada, conferir aviso de indisponibilidade e ausência de novos
   registros/certificações. Conta sem sessão deve receber 401 quando o Auth local estiver configurado.
3. Com aquisição de teste controlada e cobertura integral comprovada, executar os snapshots do
   cenário A–C: primeira coleta zero, repetição zero, um ID novo exatamente um Novo.
4. Repetir a aquisição como parcial/desconhecida/truncada: zero Novos. Reordenar, repetir IDs e
   reapresentar anúncio conhecido: zero Novos extras; conferir first_seen/last_seen.
5. Na segunda conta, conferir Base não revisada. Revisar uma oferta na primeira conta não deve
   marcar visto, descartar, salvar ou investigar na segunda. Repetir para Casa/Apartamento e Venda/Locação.
6. Conferir na interface, no contador e no banco que a identidade/certificação corresponde à mesma
   oferta. Comparar execução manual, monitor do navegador e cron concorrentes no PostgreSQL nativo.
7. Nas buscas reais grandes, o resultado esperado atual é gate fechado, sem Novo. Não usar uma
   página incompleta como smoke positivo. O positivo depende da próxima aquisição com cobertura.

Validação automatizada concluída, mas o fluxo real não foi exercitado.
**Aguardando smoke manual.**

## Preservação e rollback

A decisão RAD20_STRATEGY_A_CURRENT_BOOTSTRAP_COMPOSITION_PAUSED_STRICT_CONTRACT_PRESERVED permanece
como restrição. Nenhum artefato de RAD-20/Strategy A, H2/B01, Retirados, Docker ou secrets foi alterado.
Nenhuma migração remota, commit, push ou deploy foi executado.
O ponto de rollback do código é 0e952d6; as alterações permanecem locais e não commitadas no worktree.
