# Radar — Sobrado canônico e população qualificada do Chaves

`RADAR_CHAVES_SOBRADO_CANONICALIZED_AND_DECLARED_TOTAL_RECONCILED_READY_FOR_BASELINE_SMOKE`

A normalização explícita Sobrado → casa foi aplicada sem sobrescrever `tipoDeclarado = Sobrado`.
A auditoria dos mesmos três HTMLs fechou **45 raw / 33 qualified / 12 fora / 0 indeterminados**, com
total declarado 33. O adapter Chaves agora usa a população qualificada para esse total, mantendo os
IDs brutos como prova de progressão, repetição e loop. A reavaliação offline ficou elegível a coverage
completa. Nenhuma baseline histórica foi promovida e nenhum novo smoke foi executado.

22/10/2026. Worktree `codex/radar-baseline-novos`, HEAD `0e952d6`, sem commit.
O [HOLD anterior](RADAR-CHAVES-POPULACAO-DECLARADA-AUDITORIA.md) permanece factual e preservado.

## Evidência real reaproveitada

Mesma busca `9b526f48-9c31-4d7a-8f67-845d4597a30d` e universo
`32e1fdc8-3395-4bcd-889a-763da61abbb4`: Chaves / Locação / PR / Londrina / Casa / todos / v2 /
bairro `jardim tokio`. Somente HTMLs de P1/P2/P3, prova por página, ledger, resposta e snapshots já
capturados. Não foi consultado portal, Firecrawl ou banco externo/local por rede neste gate.

| Página | Raw | Qualificados | Fora por bairro | Indeterminados | Total declarado |
|---|---:|---:|---:|---:|---:|
| P1 | 15 | 15 | 0 | 0 | 33 |
| P2 | 15 | 15 | 0 | 0 | 33 |
| P3 | 15 | 3 | 12 | 0 | 33 |
| Acumulado | **45** | **33** | **12** | **0** | **33** |

Os IDs de P3 que pertencem ao universo são `34189630`, `44107045` e `45735542`.
O último continua com tipo publicado e persistido Sobrado; só seu recorte canônico é casa.
A auditoria executou novamente o parser e o qualificador reais, sem contar as linhas privadas como
prova e sem usar `SingleFamilyResidence` para substituir o card. Os 12 extras publicam outros bairros;
seus IDs, campos e motivos de exclusão permanecem no inventário. Identidades, finalidade, cidade,
UF e bairro não foram alterados pela normalização.

Os fatos de transporte foram reaproveitados integralmente: páginas consecutivas, URLs solicitadas e
efetivas coincidentes, HTTP 200, ausência de gap/loop/redirect e total estável. P3 não publicou next;
publicou somente prev para P2. JSON-LD/canonical da base continuam como aviso informativo.

O resultado novo é **reavaliação de contrato sobre evidência histórica**, sem aquisição fresca,
reingestão ou escrita no banco do smoke. A conclusão anterior dessa varredura não foi reclassificada:
a baseline real continua ausente no snapshot preservado. Um próximo ensaio dependerá de nova aquisição
expressamente autorizada, com a migration local preparada e aplicada naquele ambiente isolado.

## Regra anterior e regra atual

Antes, o total 33 era comparado à união bruta de 45, causando `evidencia_inconsistente`. Além disso,
a tipologia Sobrado não pertencia ao recorte mínimo observado e não era admitida globalmente.

Agora, `tipoRecorteObservadoRadar` reconhece somente o alias adicional Sobrado → casa, usando a
normalização existente de caixa/espaços. Os filtros continuam aceitando apenas casa/apartamento;
nenhum outro alias ou regra de JSON-LD foi criado. O qualificador compartilhado conserva o tipo
declarado e a tipologia original de Sobrado nos dados objetivos.

No Chaves, a leitura individual classifica cada native ID em qualificado, fora do universo por
critério explícito ou indeterminado. IDs brutos precisam progredir entre páginas; total e fim usam a
união qualificada. Qualificados acima do declarado, indeterminados relevantes, gap, loop, redirect,
total incompatível ou continuação não geram coverage completa. A falta de next com total não
reconciliado conserva a tentativa ordinal consecutiva já existente, sujeita aos mesmos limites.

`raw_count`, `qualified_count`, `out_of_scope_count`, `indeterminate_count` e `declared_total` acompanham
o resumo/telemetria e a prova transacional. IDs observados, IDs qualificados, IDs fora, indeterminados
e critérios de exclusão por página permanecem na evidência. Os extras não são descartados da ingestão
global admissível nem distribuídos a Jardim Tókio. A consulta privada de bases parciais permanece.

A nova migration altera somente funções da mesma ponte: confere a partição usando os dados objetivos
e o bairro do contexto, exige todos os IDs brutos representados na ingestão global e confirma os
contadores. Bairro ausente não é aceito como exclusão. Conjuntos sem essa representação continuam
fail-closed; não há uma via alternativa de certificação. A prova integral anterior continua aceita
com suas verificações intactas. SQL também reconhece Sobrado como casa sem reescrever o dado original.
Não há tabela, coluna, RLS, trigger, backfill, scheduler ou arquitetura nova.

## Arquivos desta fatia

- [`aquisicaoRadar.ts`](../web/lib/calculo/aquisicaoRadar.ts): normalização canônica observada e preservação da admissão estrita dos recortes anteriores de aquisição.
- [`qualificacaoOfertaRadar.ts`](../web/lib/servidor/qualificacaoOfertaRadar.ts): extração da função existente para compartilhá-la entre adapter e ingestão; conserva Sobrado original.
- [`coberturaRadar.ts`](../web/lib/servidor/coberturaRadar.ts): classificação individual, conjuntos bruto/qualificado e novo contrato de prova do Chaves.
- [`paginacaoRadar.ts`](../web/lib/servidor/paginacaoRadar.ts): mesmas regras de tempo/custo; progressão pelo adapter e contadores explícitos.
- [`ingestaoRadar.ts`](../web/lib/servidor/ingestaoRadar.ts): mantém sua exportação do qualificador e envia a prova, com extras, à RPC existente.
- [`20261022180000_radar_chaves_populacao_qualificada.sql`](../supabase/migrations/20261022180000_radar_chaves_populacao_qualificada.sql) e [`supabase-schema.sql`](../supabase-schema.sql): extensão aditiva e espelho literal. **Não aplicados ao banco do smoke ou remoto.**
- [`PROJECT.md`](../PROJECT.md#baseline-cobertura-e-novidade-do-radar): decisão permanente de tipo/população e limite conservador do contrato SQL.
- Testes novos: [`normalização`](../web/tests/radar-sobrado-canonico.test.ts), [`população A–H`](../web/tests/radar-chaves-populacao-qualificada.test.ts), [`escopo SQL`](../web/tests/radar-chaves-populacao-schema.test.ts).
- [`ponte em PGlite`](../web/tests/radar-baseline-cobertura-novos.test.ts): aplica a migration somente em memória; acrescenta I/J e oito provas SQL adulteradas.
- Fixtures mínimas: [`campos dos 45 anúncios capturados`](../web/tests/fixtures/chaves-jardim-tokio-populacao.json) e [`variantes controladas`](../web/tests/fixtures/populacaoChavesRadar.ts).
- [`radar-paginacao.test.ts`](../web/tests/radar-paginacao.test.ts): expectativa exata ampliada com os novos contadores, sem enfraquecer os critérios anteriores.
- [`blocoRadarBaseline.ts`](../web/tests/helpers/blocoRadarBaseline.ts) e listas fechadas de migrations em IV-1, IV-4A, Vendas B3.2 e Radar A/B: reconhecem somente o novo arquivo autorizado e verificam seu espelho; não ignoram extensões futuras.

O worktree já possuía alterações de fatias anteriores. Elas foram preservadas. O checkpoint desta
entrada está em `radar-antes-sobrado-reconciliacao.zip`, fora do Git; o diff exclusivo acompanha os
artefatos desta entrega. Nenhum código de UI foi alterado neste gate.

## Testes e regressões

A regressão de normalização foi executada antes da alteração: quatro casos falharam. Depois, os 23
casos de tipo passaram, incluindo caixa/espaços, preservação do objeto original, Apartamento,
desconhecidos e ausência de novos aliases. O fixture captura 45 ofertas reais; as variantes dos
casos negativos são explicitamente sintéticas.

| Caso | Verificação |
|---|---|
| A | 45 raw / 33 qualified / 12 fora / zero indeterminados / declared33 / sem next → elegível a completa |
| B | 34 qualificados / declared33 → inconsistência |
| C | 32 qualificados / declared33 → parcial |
| D | 33 qualificados com next → parcial |
| E | Indeterminado impede completar, inclusive quando já existem 33 qualificados; JSON-LD não o promove |
| F | Página com extra novo e sem novo qualificado prova progresso bruto; repetir somente extras é loop |
| G | Extras e razões permanecem na evidência e na camada global apropriada, sem distribuição ao bairro |
| H | Coverage dos demais portais não herda o contrato Chaves; aquisição Wimóveis anterior preservada |
| I | Histórico parcial preservado → primeira coverage válida → baseline com zero Novos |
| J | Repetição zero; identidade qualificada inédita posterior um Novo; novo usuário zero; first_seen/vistos preservados e last_seen avançando |

Os testes SQL também adulteram contadores, IDs qualificados/fora, indeterminado, bairro ausente,
ID bruto omitido e continuação final. Nenhum caso forma baseline. A comparação literal entre RPCs
protege o corpo anterior: só foram admitidos o gate adicional e a classificação canônica de Sobrado.

A regressão ampla detectou uma mudança não desejada no Wimóveis Casa: sua aquisição passou a admitir
um Sobrado antes recusado. Foi corrigida na fronteira já existente, mantendo o recorte canônico do
Radar e a admissão estrita anterior de aquisição. O teste original do Wimóveis não foi alterado.
A compatibilidade final passou com **148 testes em cinco arquivos**.

Resultados finais:

- Suíte comum completa: **7.902 passaram / 5 falharam / 7.907 no total**, 393 arquivos.
- As cinco falhas são exclusivamente as preexistentes de SQL/CRLF em `mensagens-agendadas.test.ts`;
  não houve falha Radar nem nova frente para corrigi-las. A oscilação conhecida de mapa não ocorreu
  no resultado final.
- Regressão focada intermediária: 320 passaram em 11 arquivos. A suíte completa final inclui todos os
  testes novos e a correção de compatibilidade posterior; não se somam contagens sobrepostas.
- TypeScript final: aprovado. Lint final: zero erros, um aviso preexistente `_choices` em
  `ia-contrato-requisicao.test.ts:657`. Build webpack final: aprovado com rede bloqueada.
- Links e `git diff --check` conferidos. Primitivas A/B, migration anterior C, rota/maxDuration,
  orçamento, timeouts, fallback, Firecrawl e monitor comparados por hash com a entrada: intactos.

Os logs intermediários foram preservados. A primeira execução ampla foi interrompida e reexecutada
com concorrência limitada. A barreira local inicialmente lançava erro síncrono no lugar da Promise
rejeitada de fetch; isso afetou testes de UI que consultam capacidade local. O instrumento foi
corrigido para rejeição assíncrona, mantendo a rede bloqueada. As falhas causadas pelo instrumento
não ocorreram na suíte final. Nenhum transporte real foi liberado para resolver esses testes.

## Invariantes, limites e STOP

35s de finalização, guards de 95s/50s, prazo único de 120s e cap 10/10 estão intactos. Casa/Apartamento,
Locação/Venda, ID nativo e isolamento por usuário permanecem. Fallback posicional não vira identidade
global. Coverage parcial continua sem baseline/Novo, com anúncios consultáveis. O banco histórico
não foi modificado, não houve promoção de varreduras antigas, ação privada ou distribuição real.

**Validação automatizada concluída, mas o fluxo real não foi exercitado neste gate. Aguardando smoke
manual expressamente autorizado.** READY significa implementação e prova offline prontas; não é PASS
de uma aquisição fresca ou de baseline real. Antes do próximo smoke, será necessário preparar a
aplicação local isolada da migration nova e validar a contenção do instrumento; a falha do observador
de tempo do ensaio anterior permanece registrada, sem correção ou reexecução automática aqui.

Não foram trabalhadas as 3.080 ofertas, novos recortes, geografia, outros aliases ou scheduler.
Pendência lateral: cinco falhas preexistentes de mensagens agendadas/CRLF e aviso de lint já citado.
Sem Firecrawl, HTTP externo, chamada paga, novo smoke, rodada 2, remote apply, Production, commit,
push ou deploy. **STOP após este gate offline.**

Artefatos em
`C:/Users/Corretor/.codex/visualizations/2026/10/21/01a15e3f-1bfe-7c91-a59a-586ebda01176/radar-chaves-sobrado-reconciliacao-20261022/`:
`classificacao-45-ids.json`/`.md`, `reavaliacao-html-real.json`, `auditoria-final.log`,
`entrega-verificada.json`, `focados.log`, `compatibilidade-final.log`, `suite.log`,
`typescript-final.log`, `lint.log`, `build.log`, registros intermediários, barreira sem rede e diff
exclusivo `alteracoes-do-gate.diff`. Não contêm credenciais do ambiente do smoke.
