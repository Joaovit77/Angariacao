# Radar — fechamento funcional de baseline + Novo

`RADAR_BASELINE_NOVO_FUNCTIONAL_VALIDATION_COMPLETE_READY_FOR_RELEASE`

**Decisão A.** A frente cumpriu seu objetivo funcional e está pronta para seguir ao processo de
publicação posterior, no escopo implementado. Baseline real, repetição real e ausência de falso Novo
estão comprovadas. O caso positivo de Novo está suficientemente coberto por integração local com
SQL/PGlite, persistência e consumo pelo cliente. Não foi identificado blocker funcional material.

Revisão finita de 22/10/2026, sem alteração de código, execução de testes adicionais, aquisição,
Firecrawl, HTTP externo, banco remoto ou publicação. Somente este relatório e recibos locais de
revisão foram criados. Nenhuma pendência lateral foi implementada.

## Provas funcionais consolidadas

| Prova | Resultado e alcance |
|---|---|
| [Primeira rodada real](RADAR-JARDIM-TOKIO-PRIMEIRA-BASELINE-SMOKE-20261022.md) | 3 páginas, 45 raw, 33 qualified, 12 fora, 0 indeterminados, declarado33, cobertura completa, primeira baseline, zero Novos, histórico e visto preservados, 33 links acessíveis. |
| [Segunda rodada real](RADAR-JARDIM-TOKIO-SEGUNDA-COLETA-REPETIDOS-SMOKE-20261022.md) | 3 páginas/3 chamadas/3 créditos, mesmos 33 qualificados, cobertura completa, zero Novos, mesma baseline, 45 first_seen/IDs preservados, 45 last_seen avançados, vistos e 33 links preservados. |
| Baseline real | `2cac4108-459d-4135-a64f-7ff9d32c0091`, concluída, universo Jardim Tókio. |
| Segunda varredura real | `0bc136a8-b6d8-4820-977d-8d227e100647`; nenhuma segunda baseline, comparação original preservada. |
| Universo | `chaves-na-mao \| locacao \| PR \| londrina \| casa \| todos \| v2 \| bairro=jardim tokio`. |

### A. Caso positivo — integração automatizada local

Não se trata apenas de um mock que devolve `novos: 1`. Em
[radar-baseline-cobertura-novos.test.ts:257](../web/tests/radar-baseline-cobertura-novos.test.ts#L257),
a ponte servidora real chama a RPC executada em PGlite, usando as migrations A/B/C/D reais.
O transporte externo é substituído por HTML/respostas locais controladas; o motor SQL, a
qualificação, a coverage, as condições de novidade e a distribuição privada são exercitados.

O cenário [I/J: população qualificada](../web/tests/radar-baseline-cobertura-novos.test.ts#L289)
percorre parcial → baseline de 45 raw/33 qualified/12 extras com zero Novo → repetição com zero Novo
→ inclusão controlada do ID qualificado `990001`, total declarado atualizado e coverage completa
→ **exatamente um Novo**. Confere que somente `990001` possui `novidade_varredura_id`, que o
usuário recém-inscrito recebe zero Novos, que Sobrado original permanece, que first_seen/visto
permanecem e que last_seen avança. Trata-se de fixture local anterior; nenhuma identidade foi
injetada no banco do smoke ou em portal real nesta revisão.

Provas complementares existentes:

| Contrato | Teste/fonte revisada |
|---|---|
| Primeira baseline / repetição / ID nativo novo | Banco A/B/C, linhas 90–106 do teste de baseline. |
| Novo persistido e candidato pendente correto | Caso C confirma que somente `100002` chega a `candidatos_pendentes_radar()`. |
| Paginação completa e Novo positivo | Casos de 60→61 ofertas e 33→34 ofertas, linhas 340 e 352. |
| Certificado aponta à execução correta | [RPC D](../supabase/migrations/20261022180000_radar_chaves_populacao_qualificada.sql): só atribui `v.id` se há baseline anterior, coverage válida, primeira admissão global nesta varredura e observação posterior aos marcos do universo e da busca. |
| first_seen / last_seen / reaparecimento | Caso F e cenários paginados; first_seen e primeira varredura não são sobrescritos no conflito, last_seen usa greatest. |
| Novo usuário / isolamento / visto privado | Casos G/I, RLS com roles authenticated/service_role, proteção de campos e filtros privados reaplicados. |
| Parcial/desconhecida/truncada e sem retroatividade | Caso D, limites de páginas e parcial após baseline; oráculo detecta mutante que liberaria Novo em parcial. |
| Fail-closed e atomicidade | IDs posicionais recusados globalmente; payload/prova adulterada recusados; erro de distribuição reverte ingestão e baseline. |
| Extras e indeterminados | [População qualificada](../web/tests/radar-chaves-populacao-qualificada.test.ts), 14 casos; divergência de total, next, gap, redirect, loop e desconhecido fecham o gate. |
| Sobrado → Casa | [Normalização](../web/tests/radar-sobrado-canonico.test.ts), 23 casos, tipo original preservado, demais aliases recusados e contrato anterior Wimóveis preservado. |
| Cliente/UI de Novo | [Persistência](../web/tests/radar-angariacao-persistencia.test.ts) lê `novidade_varredura_id`; [UI](../web/tests/radar-interface.test.ts) separa Base/Novo, mantém Novo se a gravação de visto falhar e mantém parciais consultáveis. |
| Auth e evidência confiável | [Rota](../web/tests/radar-verificar-route.test.ts), 10 casos, ignora usuário/filtros/coverage forjados pelo cliente e recusa falhas de auth/transação. |

### B. Caso positivo natural — portal real

**Não observado.** Nas duas rodadas reais, o portal apresentou os mesmos 33 qualificados. Portanto,
não há prova natural end-to-end de nascimento de uma identidade inédita e sua etiqueta Novo.
Essa ausência não é defeito e não invalida a prova automatizada/local do caso positivo.

O contrato permanente em [PROJECT.md:2896](../PROJECT.md#L2896) exige baseline compatível,
coverage integral atual, primeira admissão global e observação posterior aos marcos; não exige
aguardar o surgimento natural de uma nova oferta antes de publicar. A política de
[smoke e conclusão em AGENTS.md](../AGENTS.md#L138) exige validação real do fluxo quando possível:
ela foi atendida por duas rodadas reais autenticadas, com PostgreSQL/PostgREST e UI locais.
Não estabelece que cada ramificação dependa de ocorrência natural no portal.

Não foi encontrado requisito explícito aplicável que imponha Novo natural positivo como condição
obrigatória de publicação. A instrução de fechamento distingue expressamente as duas provas.
**A classificação HOLD_POSITIVE_NEW_IDENTITY_E2E_REQUIRED não se aplica.** Nenhum ensaio adicional
é proposto como condição obrigatória; esta revisão encerra a validação funcional atual.

## Estado dos testes e integridade da evidência

Artefatos finais existentes, concluídos em 22/10/2026 às 18:23:39 UTC:

| Verificação já executada | Resultado existente |
|---|---|
| [Suíte completa](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-chaves-sobrado-reconciliacao-20261022/suite.log) | **7.902 aprovados / 5 falhas preexistentes / 7.907 testes**, 393 arquivos (392 aprovados, 1 com falhas). Nenhuma falha do Radar. |
| SQL/PGlite baseline/coverage/Novo | 73 casos aprovados na suíte final. |
| População / normalização / escopo do schema | 14 / 23 / 2 casos aprovados. |
| Rota / UI / leitura paginada | 10 / 6 / 3 casos aprovados. |
| [Compatibilidade focada final](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-chaves-sobrado-reconciliacao-20261022/compatibilidade-final.log) | 148 aprovados em 5 arquivos; não somar à suíte como casos distintos. |
| TypeScript | Aprovado, saída 0 documentada no recibo anterior. |
| [Lint](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-chaves-sobrado-reconciliacao-20261022/lint.log) | Zero erros; um aviso preexistente `_choices` em `ia-contrato-requisicao.test.ts:657`. |
| [Build](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-chaves-sobrado-reconciliacao-20261022/build.log) | Aprovado. |

As cinco falhas existentes são de `mensagens-agendadas.test.ts`, comparação textual de SQL/CRLF,
fora desta frente. A suíte global não está integralmente aprovada; READY funcional do Radar não é
uma declaração de CI global sem falhas. Elas permanecem registradas, sem correção nesta revisão.

Foram comparados os hashes atuais de **1.065 arquivos** contra o snapshot usado pelos smokes:
nenhuma diferença. Nenhum arquivo não gerado desse conjunto foi modificado após o encerramento
do gate automatizado. A exceção temporal é `next-env.d.ts`, recriado pelo Next dev e já restaurado
ao hash original. Não houve mudança de código após as provas que justifique repetir a suíte.
Nesta revisão: **zero testes executados, zero chamadas pagas, zero HTTP externo**.
Validação documental: links locais e `git diff --check`.

## Arquivos que compõem a entrega

O inventário completo registra caminho, estado Git e SHA-256 de todos os arquivos da entrega:
[inventario-entrega.json](C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-fechamento-funcional-20261022/inventario-entrega.json).
Na entrada desta revisão eram 64 arquivos: 17 de aplicação, 27 testes/fixtures, 2 migrations,
1 schema, 1 configuração e 16 documentos. Este relatório acrescenta somente um documento.

Aplicação:

- [web/components/central/CentralAngariacaoView.tsx](../web/components/central/CentralAngariacaoView.tsx)
- [web/lib/calculo/aquisicaoRadar.ts](../web/lib/calculo/aquisicaoRadar.ts)
- [web/lib/calculo/radarAngariacao.ts](../web/lib/calculo/radarAngariacao.ts)
- [web/lib/radarAngariacao.ts](../web/lib/radarAngariacao.ts)
- [web/lib/servidor/fallbackHttpChaves.ts](../web/lib/servidor/fallbackHttpChaves.ts)
- [web/lib/servidor/firecrawlCentralAngariacao.ts](../web/lib/servidor/firecrawlCentralAngariacao.ts)
- [web/lib/servidor/monitorRadarAngariacao.ts](../web/lib/servidor/monitorRadarAngariacao.ts)
- [web/lib/servidor/observabilidadeRadar.ts](../web/lib/servidor/observabilidadeRadar.ts)
- [web/app/api/radar/verificar/route.ts](../web/app/api/radar/verificar/route.ts)
- [web/lib/calculo/bairroUniversoRadar.ts](../web/lib/calculo/bairroUniversoRadar.ts)
- [web/lib/servidor/coberturaRadar.ts](../web/lib/servidor/coberturaRadar.ts)
- [web/lib/servidor/ingestaoRadar.ts](../web/lib/servidor/ingestaoRadar.ts)
- [web/lib/servidor/orcamentoRadar.ts](../web/lib/servidor/orcamentoRadar.ts)
- [web/lib/servidor/paginacaoRadar.ts](../web/lib/servidor/paginacaoRadar.ts)
- [web/lib/servidor/qualificacaoOfertaRadar.ts](../web/lib/servidor/qualificacaoOfertaRadar.ts)
- [web/lib/servidor/universoRadar.ts](../web/lib/servidor/universoRadar.ts)
- [web/lib/servidor/urlPaginaRadar.ts](../web/lib/servidor/urlPaginaRadar.ts)

Schema e configuração: [supabase-schema.sql](../supabase-schema.sql),
[web/.env.example](../web/.env.example), [PROJECT.md](../PROJECT.md), [DEPLOY.md](../DEPLOY.md).
Os 27 arquivos de testes/fixtures incluem os cenários acima, helpers e adaptações de listas
fechadas de migrations em testes Radar/IV/Vendas; constam individualmente no inventário.
Os documentos de entrega e os HOLDs históricos permanecem como trilha de evidência, sem reclassificação.
Instrumentos Windows, ledgers, capturas, snapshots e credenciais locais não compõem o código a publicar.
Não incluir esses arquivos externos ou `.env.local` em commit posterior.

## Migrations necessárias no futuro ambiente alvo

O alvo futuro não foi consultado nem alterado. Não se presume seu estado remoto.
A cadeia de dependências do slice é:

1. Fundação A: `20261014111445_radar_r6_1_fundacao_global_ofertas.sql`.
2. Invariantes B: `20261014130154_radar_r6_1_b_invariantes_globais.sql`.
3. **C: `20261021120000_radar_baseline_cobertura_novos.sql`.** Cria a ponte transacional,
   marcos/certificados privados, dimensão opcional de bairro e contrato de baseline/comparação v2.
4. **D: `20261022180000_radar_chaves_populacao_qualificada.sql`.** Acrescenta o gate de população
   qualificada e preserva Sobrado original com recorte Casa; depende de C.

A/B são dependências canônicas preexistentes, sem alteração nesta entrega. **As migrations novas
para publicar este slice são C e D.** Foram aplicadas e verificadas somente no banco local isolado.
Conferir o ledger real do alvo no processo posteriormente autorizado e aplicar apenas o que estiver
pendente, na ordem A/B → C → D, antes do código dependente. Não reaplicar cegamente migrations já
instaladas e não executar o espelho completo do schema como atualização incremental.
Não transportar baseline/dados da conta sintética para outro ambiente e não fazer backfill legado.

Migrations novas e espelho:

- [supabase/migrations/20261021120000_radar_baseline_cobertura_novos.sql](../supabase/migrations/20261021120000_radar_baseline_cobertura_novos.sql)
- [supabase/migrations/20261022180000_radar_chaves_populacao_qualificada.sql](../supabase/migrations/20261022180000_radar_chaves_populacao_qualificada.sql)

## Estado Git / worktree

- Worktree: `C:/Users/Corretor/.codex/worktrees/radar-baseline-novos/Angariacao`.
- Branch: `codex/radar-baseline-novos`.
- HEAD: `0e952d6aadcdfcc342eb97849464adcb3325ccf9`.
- Na entrada: 25 arquivos rastreados modificados e 39 arquivos novos não rastreados;
  mais este relatório não rastreado ao encerrar a revisão. A entrega ainda depende de inclusão
  deliberada desses arquivos numa publicação posterior; estar na pasta não significa estar num commit.
- Índice sem alterações staged; nenhum commit, merge, push ou deploy nesta revisão.
- Código e histórico preservados. O banco isolado e as provas anteriores não foram modificados.

## Riscos residuais e backlog lateral

1. “Novo” significa primeira observação global certificada após baseline; não é afirmação sobre data
   original de publicação ou exclusividade no mercado. O caso positivo natural permanece não observado.
2. Mudanças futuras do portal podem fechar o gate. Novos só são certificados onde o adaptador comprova
   cobertura completa; publicação não estende automaticamente a certificação a outros portais/universos.
3. Os contadores e rótulos históricos “Base não revisada / Coleta parcial” dos cartões precisam de
   clareza visual futura. Preservados como backlog, sem impacto na certificação já comprovada.
4. Robustez do fechamento do instrumento Windows após EPERM. Incidente contido, sem chamada extra;
   o instrumento temporário não é componente da aplicação a publicar.
5. Paginação privada >120: cobertura automatizada existente, sem smoke real desse volume.
6. Universo de aproximadamente 3.080 ofertas: continua além da cobertura provada pelo teto e permanece
   parcial quando não completo; nenhum recorte alternativo, cap maior ou frente adicional foi criado.
7. Miniaturas sob guard e demais melhorias de apresentação permanecem backlog.
8. Cinco falhas globais preexistentes de teste SQL/CRLF e um aviso de lint permanecem visíveis no relatório.

Essas pendências não alteraram aquisição, coverage, baseline, repetição, first_seen, last_seen,
certificação de Novo ou acesso aos links. Nenhuma vira automaticamente blocker deste fechamento.

## Checklist mínimo de publicação posterior — não executado

- [ ] Revisar/congelar o diff final e incluir explicitamente código, testes, C/D, schema e documentos;
      excluir secrets, credenciais, capturas privadas e instrumentos locais. Registrar o estado dos
      testes e as cinco falhas preexistentes, sem apresentá-lo como CI global integralmente aprovado.
- [ ] Com autorização de publicação, confirmar ambiente alvo, versão anterior e ponto de rollback;
      conferir ledger/schema e preparar backup antes de qualquer mudança no banco.
- [ ] Aplicar somente migrations pendentes na cadeia A/B → C → D; verificar RPC/helper, permissões,
      RLS e marcos históricos. Sem promoção retroativa ou cópia dos dados do smoke.
- [ ] Conferir configuração de servidor: Supabase do alvo, service role restrita ao servidor,
      Firecrawl conforme política/custo, caps 10/10 e prazo/guards preservados; scheduler inalterado.
- [ ] Publicar somente mediante autorização posterior e conferir auth, leitura privada, contador,
      links e telemetria no alvo. Uma nova aquisição paga exige autorização específica; ocorrência
      natural de Novo não é condição adicional criada por este fechamento.

**STOP. A validação funcional baseline + Novo está encerrada.** Não houve rodada 3, código alterado,
novo teste, anúncio injetado, aquisição externa, aplicação remota, Production, commit, push ou deploy.
