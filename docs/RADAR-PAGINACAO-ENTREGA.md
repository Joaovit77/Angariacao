# Radar — paginação com teto operacional

> A correção de acesso às coletas parciais e o status atual do smoke estão no [relatório de smoke funcional](RADAR-SMOKE-FUNCIONAL.md).

Implementação local na branch `codex/radar-baseline-novos`, derivada de R6.1-B `0e952d6`, sem commit.
Checkpoint da implementação anterior preservado fora dos arquivos versionados. A migration anterior
continua um rascunho local e foi revisada; A/B permanecem intactas. Nenhuma aplicação remota ocorreu.

## Comportamento entregue

Antes, só uma página de até 50 ofertas podia satisfazer o gate. Agora a mesma aquisição Firecrawl/HTTP,
cache e single-flight percorre a navegação publicada pelo Chaves na Mão, na mesma rota/contexto, e
agrega as páginas sem reaplicar um teto global de 50 resultados. Não há coletor paralelo nem fila nova.
A [listagem pública do portal](https://www.chavesnamao.com.br/apartamentos-para-alugar/pr-londrina/)
publica a navegação `?pg=2`; a implementação segue links publicados, sem inventar consultas adicionais.
Essa consulta documental não constitui smoke de aquisição paginada.

O padrão configurável é **10 páginas / 10 chamadas pagas por rodada**. Cada tentativa paga reserva
uma unidade antes do envio; falha também conta. Cache e single-flight não consomem outra chamada.
O cron compartilha o orçamento entre suas buscas. A verificação manual/navegador usa um orçamento
por requisição. O limite não é uma cota distribuída entre processos/rodadas simultâneas.

A aquisição para antes se comprovar o fim. Teto, tempo, falha, ausência de proveniência, repetição de
identidade, alteração de total ou navegação/contexto divergente mantêm a coleta parcial/incompleta.
Até a página 10 com próxima página permanece parcial; fim comprovado exatamente na página 10
pode satisfazer o gate. A igualdade com o total, sozinha, não basta se existir continuação.

O servidor exige identidades qualificadas cobrindo o total estável, páginas consecutivas e última página
sem continuação. A RPC valida de novo sequência, total, IDs, proveniência, janela temporal, fim e contagens;
provas adulteradas não certificam Novo. Migrations A/B, autenticação, RLS e estados privados continuam
sob os mesmos contratos. A coleta integral conserva a versão semântica 2, sem criar recortes novos.

Páginas, resultados, total declarado e motivo da parada aparecem no retorno e no log do Radar.
O retorno inclui ainda orçamento agregado, com páginas consultadas e chamadas pagas. A prova
estrutural é persistida em `payload_coleta`, sem HTML ou dados privados. A varredura inicia na menor
data das aquisições componentes, mas cada oferta/presença conserva a data da sua própria página.
A comparação usa a observação individual: uma página antiga em cache não oculta um ID realmente
inédito da página nova. O cache não fabrica outra observação.

## Arquivos

- Migration local revisada: [20261021120000_radar_baseline_cobertura_novos.sql](../supabase/migrations/20261021120000_radar_baseline_cobertura_novos.sql).
- Espelho idêntico: [supabase-schema.sql](../supabase-schema.sql).
- Orquestração: [paginacaoRadar.ts](../web/lib/servidor/paginacaoRadar.ts).
- Prova e gate: [coberturaRadar.ts](../web/lib/servidor/coberturaRadar.ts), [ingestaoRadar.ts](../web/lib/servidor/ingestaoRadar.ts).
- Limites: [orcamentoRadar.ts](../web/lib/servidor/orcamentoRadar.ts), [configuração](../DEPLOY.md).
- Consumidores: rota `api/radar/verificar` e `monitorRadarAngariacao.ts`.
- Transporte existente: `firecrawlCentralAngariacao.ts` e `fallbackHttpChaves.ts`.
- Contrato permanente atualizado em [PROJECT.md](../PROJECT.md).

## Regressão A–I

Os testes anteriores A–I foram preservados e continuam cobrindo baseline zero, repetição zero,
identidade inédita um Novo, parcial zero, deduplicação, first_seen/last_seen, adesão de novo usuário,
Casa/Apartamento e Locação/Venda, RLS/ações privadas e rejeição de fallback posicional.

A extensão usa os parsers e o transporte reais com respostas HTTP controladas e SQL real em PGlite:
60 ofertas em duas páginas formam baseline com zero Novos; repetição gera zero; 61 ofertas geram
exatamente um Novo para a assinatura antiga e Base não revisada para a assinatura nova. Um caso
adicional mantém uma página anterior em cache e substitui uma identidade na página fresca, com
total estável: gera exatamente um Novo pela observação da própria página, preservando first_seen. First_seen
permanece, last_seen avança e o banco registra páginas/contagens reais. Uma coleta pelo teto, antes
e depois da baseline, não gera Novo. A RPC rejeita provas com motivo de limite, sequência quebrada,
continuação final, total divergente, IDs repetidos ou contagens inválidas/ausentes.

A suíte específica de paginação cobre os quatro contextos, fim antecipado, teto na página 10 com
continuação, fim exatamente no teto, mais de 50 resultados, custo independente de páginas, falha paga
seguida de fallback, cache/replay, single-flight, orçamento compartilhado, falha intermediária, falta de
tempo, contexto divergente, links externos/saltos e configuração inválida. Nenhum teste utiliza API paga.

## Resultados da validação

- Regressão ampliada Radar/Firecrawl/fallback: **1.347 testes passaram**, nenhuma falha.
- Casos específicos de paginação + SQL: **65 testes passaram**, incluindo a regressão final de cache misto.
  A guarda histórica do ZAP também passou na regressão ampliada.
- **36 casos adicionais** nesta fatia, além dos testes existentes A–I; nenhum caso antigo foi removido
  ou enfraquecido para acomodar a implementação.
- TypeScript sem erros; lint sem erros (um aviso preexistente em teste de IA); lint dos arquivos novos
  e revisados sem avisos.
- Build `next build --webpack` passou. O modo Webpack preserva a solução já usada para a junction
  de dependências deste worktree; nenhuma configuração de produção foi alterada para contorná-la.
- Smoke HTTP da aplicação compilada em `127.0.0.1:4329`: POST sem sessão retornou **401**, GET
  retornou **405**. Credenciais fictícias, nenhum transporte externo habilitado; processo encerrado.
- Migration revisada executada em PGlite isolado, com ponte/SQL e RLS reais nesse ambiente. Não foi
  aplicada em Supabase remoto nem em um PostgreSQL/PostgREST nativo.
- `git diff --check`, links locais e preservação literal das migrations A/B conferidos.
- Suíte geral: **7.778 passaram / 7.784 executados**, em 387 arquivos. Restaram **6 falhas laterais**:
  as cinco de mensagens agendadas já registradas na base R6.1-B e uma de temporização de debounce
  do mapa, em código não alterado. A guarda do ZAP passou nessa repetição. A regressão final de cache
  misto foi acrescentada depois que a suíte geral carregou esse arquivo; passou nos 65 testes específicos
  e na regressão ampliada final. A suíte geral não é apresentada como integralmente aprovada.

## Limitação objetiva e pendências

**Dez páginas não cobrem a fixture real de 3.080 ofertas de Londrina.** O parser interpreta até 50
ofertas por página: o máximo teórico dessa rodada é 500. Esse universo permanece parcial, sem
baseline e sem Novo. A janela de tempo pode encerrar ainda antes, sobretudo na rota de 120 segundos.
Não houve aumento automático de orçamento, retomada entre rodadas ou mudança de recorte.

Outros portais continuam sem adaptador de prova de cobertura e permanecem desconhecidos. Formatos
em que o JSON-LD não identifica a página consultada ou a navegação não é comprovável fecham o gate.
Não foi afirmado que o portal real entrega hoje todas as evidências exigidas em todas as páginas.

Recortes globais menores/versionados ficam registrados como otimização futura a avaliar **somente
se houver decisão posterior**, conforme a orientação do usuário. RAD-20/Strategy A, Retirados e backfill
legado continuam fora do escopo. As cinco falhas preexistentes de mensagens agendadas permanecem
backlog lateral, conforme [entrega anterior](RADAR-BASELINE-NOVOS-ENTREGA.md).

Durante uma execução geral sob carga concorrente, um teste de debounce do mapa apresentou
oscilação de aproximadamente 3 ms (`garimpo-g1-logradouro-mapa.test.ts:259`). Nenhum código de mapa
foi alterado; não bloqueia o objetivo deste slice e fica registrado como pendência lateral de estabilidade.

Próxima decisão funcional: determinar a viabilidade de cobrir integralmente as buscas reais dentro
dos limites aprovados. Não abrir automaticamente outra subfrente. Para universos que cabem no teto,
o ciclo cobertura → baseline → Novo já é exercitado localmente.

## Smoke manual pendente antes de integração

Validação automatizada concluída, mas o fluxo real não foi exercitado. **Aguardando smoke manual.**

Em ambiente seguro e isolado, com credenciais próprias e autorização específica para custo de aquisição:

1. Usar uma busca explícita cujo total comprovado caiba no orçamento, com navegação de pelo menos
   duas páginas; verificar sequência, total estável e término `fim_comprovado`.
2. Conferir primeira coleta com baseline e zero Novos; segunda igual com zero; inclusão controlada de
   uma identidade inédita com exatamente um Novo. Validar first_seen e last_seen.
3. Repetir com teto inferior às páginas necessárias e com falha intermediária: status `partial`, sem
   baseline nova, sem Novo, contagens e motivo corretos.
4. Entrar com segundo usuário: receber Base não revisada; revisar uma cópia e confirmar isolamento.
   Conferir Casa/Apartamento e Locação/Venda.
5. Conferir retorno/telemetria de páginas e chamadas, além do prazo. Não usar sucesso HTTP como prova.

A autorização atual não cobre smoke pago, Supabase remoto ou Production. O ensaio acima é roteiro;
não foi executado pelo agente. Também não foi exercitada concorrência nativa PostgreSQL/PostgREST.
Nenhum commit, push, deploy, aplicação remota ou backfill foi realizado.
