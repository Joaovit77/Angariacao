# JEV-S2-D — probe real controlado de probabilities

Data: 17/10/2026. **PASS DIAGNOSTIC. PRODUCTION: NÃO INTEGRADO. S2-B: HOLD PRESERVADO.**

Run: `jev-s2d-probdiag-1792253130113-4d03f514`.

[Artefatos sanitizados do novo run](experiments/jev/results/s2d-probdiag-jev-s2d-probdiag-1792253130113-4d03f514/).

Foram executadas seis chamadas reais independentes, serializadas, sem retry, ao modelo obrigatório `jev-1.14.0`. Todas completaram o transporte, tiveram usage conhecido e foram aceitas pelo parser estrito congelado. O wrapper S2-C retornou o mesmo `parsed` do parser original. Nenhuma chamada adicional, warm-up, health/model probe ou regeneração foi realizada.

## Autorização e precondições

Autorização humana explícita no anexo do pedido S2-D: até seis chamadas JEV, modelo `jev-1.14.0`, teto financeiro total US$0,05, finalidade exclusiva de diagnóstico de probabilities. SHA-256 do anexo: `8569aa41c75f91a37ca7a72fe2f24b0231e18c56ddabf9fa6c9d091a6ae70a41`.

Antes de qualquer escrita nova, S0/S1/S2-A/S2-B/S2-C foram conferidos. Antes da rede: 157 regressões certificadas PASS; 31 testes novos do runner PASS; execução conjunta **188 PASS, zero falhas**; freeze próprio, preço, corpo dos probes, contexto e whitespace conferidos. Usou-se exclusivamente `Angario_teste` do arquivo local já conhecido, sem imprimir/persistir o valor, alterar o arquivo ou procurar outras credenciais.

A primeira solicitação de execução foi rejeitada pela revisão automática de aprovação por não reconhecer a autorização no anexo. O processo não chegou a ser criado; foram verificados lock S2-D ausente e zero run real. A leitura direcionada confirmou a autorização literal no arquivo do usuário. A solicitação seguinte apresentou essa evidência e foi aceita. Houve **uma única execução efetiva do runner**, com seis requests HTTP e nenhum retry de chamada.

Execução: 17/10/2026, 13:05:30–13:05:38, America/Sao_Paulo (16:05:30.218Z–16:05:38.478Z).

## Preço e orçamento

Preço oficial reconfirmado em 17/10/2026, 15:59:00Z: **US$0,042 por milhão de tokens de entrada; saída gratuita**. Contexto padrão: 64k/request e 32k/pergunta, sem long-context. Fontes: [modelos TypeSafe](https://docs.typesafe.ai/models) e [contrato HTTP oficial](https://docs.typesafe.ai/api). O [pricing.json](experiments/jev/results/s2d-probdiag-jev-s2d-probdiag-1792253130113-4d03f514/pricing.json) registra esses dados.

Reserva conservadora por chamada: 65.536 × US$0,042/Mtok = **US$0,002752512**. Seis reservas: US$0,016515072, abaixo do teto US$0,05. Antes de cada envio, o guard exigiu custo estimado conhecido + pior caso da próxima chamada dentro do teto; tentativa enviada consome cota mesmo com erro. Usage ausente mantém reserva e para, nunca vira zero.

Resultado: **5.398 tokens de entrada, 1.360 de saída; US$0,000226716 estimados**. Usage conhecido em 6/6, nenhum custo desconhecido. `total_tokens` não foi fornecido e permanece null; não foi fabricado somando entrada/saída. Valor faturado: **BILLED_UNKNOWN**, sem consulta à conta ou billing externo.

## Desenho congelado

Três requests novos, totalmente sintéticos; duas repetições independentes por request, usando exatamente os mesmos bytes. Nenhum stage do S2-B, especialmente V2-02/validation/1, foi reenviado. Não há golden answer nem expectativa semântica.

| Probe | Perguntas / opções | Objetivo |
| --- | --- | --- |
| P1 | Uma pergunta binária | Envelope mínimo com tipo choice e probabilities de duas opções |
| P2 | Três perguntas, de 2/3/4 opções | Envelope intermediário e mistura de tamanhos de vetor |
| P3 | Doze perguntas, quatro de cada tamanho 2/3/4 | Aproximação da contagem/mistura observada em validation V2, com contexto novo simplificado |

Ordem congelada: P1/R1, P1/R2, P2/R1, P2/R2, P3/R1, P3/R2. Concorrência um. IDs de stage e attempt únicos. Nome lógico e ledger são novos, sem reutilização do run/lock/orçamento S2-B.

| Probe | SHA-256 do request materializado |
| --- | --- |
| P1 | `dcba99c0fa0ab1ec3295f73b2f57ecd1f35e947a79ca9e54323a1d7d51d48495` |
| P2 | `a39d5d108f4fa0e119374b349a275ee4ac7d308bdf70876e2f0410758f5167a8` |
| P3 | `4020db2e15dccb0a8d61ff3c028c74a8636194fc709688791304ce1e06483ffc` |

Os corpos completos exclusivamente sintéticos estão em [requests-frozen.json](experiments/jev/s2d/requests-frozen.json), protegidos pelo [freeze do executor](experiments/jev/s2d/freeze.json). O [probes-freeze.json do run](experiments/jev/results/s2d-probdiag-jev-s2d-probdiag-1792253130113-4d03f514/probes-freeze.json) preserva hashes, IDs, estrutura, contagens e modelo; não inclui prompts/contexto de respostas.

## Resultado das seis chamadas

| Stage | Modelo solicitado / observado | Entrada / saída | Latência | Parser | Maior delta absoluto da soma |
| --- | --- | --- | --- | --- | --- |
| P1/R1 | jev-1.14.0 / jev-1.14.0 | 353 / 31 | 577 ms | STRUCTURALLY_VALID | 0 |
| P1/R2 | jev-1.14.0 / jev-1.14.0 | 353 / 31 | 240 ms | STRUCTURALLY_VALID | 0 |
| P2/R1 | jev-1.14.0 / jev-1.14.0 | 674 / 126 | 733 ms | STRUCTURALLY_VALID | 1,1102230246251565e-16 |
| P2/R2 | jev-1.14.0 / jev-1.14.0 | 674 / 126 | 289 ms | STRUCTURALLY_VALID | 1,1102230246251565e-16 |
| P3/R1 | jev-1.14.0 / jev-1.14.0 | 1.672 / 523 | 289 ms | STRUCTURALLY_VALID | 0 |
| P3/R2 | jev-1.14.0 / jev-1.14.0 | 1.672 / 523 | 251 ms | STRUCTURALLY_VALID | 0 |

Latência por chamada HTTP incluindo leitura da resposta, antes da persistência/projeção: **mínima 240 ms, p50 289 ms, máxima 733 ms**. Não é benchmark de desempenho.

| Métrica do checkpoint | Quantidade |
| --- | --- |
| authorized_calls | 6 |
| started_calls | 6 |
| completed_transport | 6 |
| structurally_valid | 6 |
| invalid_probabilities | 0 |
| classified_diagnostics | 0 |
| unclassified_structural | 0 |
| operational_errors | 0 |
| retry / regen / resume | 0 / 0 / 0 |

Todos os status HTTP foram 200. Subcódigos reais: **nenhum**, pois nenhuma resposta foi estruturalmente inválida. Os caminhos de subcódigos foram exercitados apenas nas fixtures offline; não se afirma que uma falha real foi capturada neste probe.

## Probabilities e comparação R1/R2

Foram preservados **32 vetores, 94 valores numéricos**, todos finitos e em `[0,1]`; mínimo observado 0, máximo 0,97. Todos os option sets correspondiam ao request; todas as choices estavam na máxima; nenhum empate.

Somas Binary64 entre **0.9999999999999999 e 1**; maior delta absoluto **1.1102230246251565e-16**. A pergunta `evidence` de P2 teve soma 0.9999999999999999 nas duas repetições. O parser aceitou pelos critérios existentes, com tolerância absoluta 0,000001. Nenhum arredondamento, renormalização ou correção foi aplicado.

Choices descritivas preservadas:

- P1: flag = YES em R1 e R2.
- P2: flag = YES; category = FIRST; evidence = SUPPORTED, em ambas.
- P3: perguntas binárias dimension_01/04/07/10 = YES; ternárias dimension_02/05/08/11 = FIRST; de quatro opções dimension_03/06/09/12 = SUPPORTED, em ambas.

Isso não constitui avaliação da correção dessas escolhas. Não se calculou action_accuracy, decision_completeness, validation_accuracy, false_accept ou false_reject.

| Comparação | P1 | P2 | P3 |
| --- | --- | --- | --- |
| Estrutura, option sets e parser valid/invalid iguais | Sim | Sim | Sim |
| Modelo e usage iguais | Sim | Sim | Sim |
| Choice e opções máximas iguais | Sim | Sim | Sim |
| Subcódigos iguais | Sim: null/null | Sim: null/null | Sim: null/null |
| Somas/deltas iguais entre repetições | Sim | Sim | Sim |
| Confidence integralmente igual | Não | Não | Não |

As probabilidades/confidences podem variar apesar das choices iguais. Exemplos de confidence: P1 flag 0,72 → 0,76; P2 flag 0,84 → 0,82 e evidence 0,47 → 0,44; P3 dimension_01 0,74 → 0,62. Nenhuma repetição foi escolhida como melhor. Valores individuais, máximas, tipos, min/max, soma/delta, confidence e option sets estão em [probabilities-summary.json](experiments/jev/results/s2d-probdiag-jev-s2d-probdiag-1792253130113-4d03f514/probabilities-summary.json) e [repetition-comparison.json](experiments/jev/results/s2d-probdiag-jev-s2d-probdiag-1792253130113-4d03f514/repetition-comparison.json).

## Persistência, hashes e privacidade

Cada stage gravou atomicamente run/stage/probe/repetition/attempt, timestamp, modelo, request hash e IN_PROGRESS antes do HTTP. Respostas ficaram somente em memória para hash, parser estrito e wrapper. Depois foram persistidas exclusivamente projeções allowlisted, usage validado, metadados locais e estatísticas. Nenhum raw de resposta foi salvo.

O wrapper congelado tem allowlist antiga de identidade; o novo executor anexa stage/attempt do plano S2-D somente ao envelope diagnóstico, fora de `parsed`, sem modificar o wrapper ou seu resultado normalizado. IDs desconhecidos são opacos/hashados; texto livre, prompt/contexto retornado, raciocínio, debug e headers de autenticação são descartados. Não há nomes, telefones, endereços, clientes, imóveis ou conversas reais nos requests.

| Stage | SHA-256 do texto bruto transitório |
| --- | --- |
| P1/R1 | `a2aff5fb273b5279a63a2d75dcfed880f4e5871f1a928515a3f57fe271e3ee6b` |
| P1/R2 | `2e3876ea8f40374ce49eca8b449b7f8d99b7c4f0ecb8ce09c4e9a4c30b122264` |
| P2/R1 | `015e2cb4b483193d60b27525a62d5f470acb75a04ea03f2d11f32ff862229509` |
| P2/R2 | `aab3c87b6dea980c1310c609611cf904515f948819fe0438f9f35279c7122f2e` |
| P3/R1 | `a83904723901187448851358cffccd31fc1b2a22d8ad6910c716737c8f9980c9` |
| P3/R2 | `e80651b0c871ef5df77064af96f140e922af1b783034e10ba77a29670d56554e` |

O privacy scan ocorreu antes/depois de cada stage e na finalização, incluindo busca pelo valor exato da credencial sem exibi-lo. Zero ocorrências. O [privacy-check.json](experiments/jev/results/s2d-probdiag-jev-s2d-probdiag-1792253130113-4d03f514/privacy-check.json) registrou 17 arquivos existentes antes de adicionar o próprio certificado e hashes. A varredura final incluiu os **19 arquivos**, sem campos proibidos ou raw. Testes offline adicionais cobriram cinco sentinelas falsas em extras, números inválidos e IDs desconhecidos.

[hashes.json](experiments/jev/results/s2d-probdiag-jev-s2d-probdiag-1792253130113-4d03f514/hashes.json) contém 18 hashes de artefatos, excluindo a si mesmo; todos foram relidos e conferidos após a execução. O freeze dos fontes também foi conferido. O novo lock `experiments/jev/results/s2d-authorization.lock` e execution.lock do run permanecem presentes: autorização consumida, sem auto-resume.

## Regressão, preservação e alcance

Comando offline executado antes da rede:

```powershell
node --test experiments/jev/harness.test.mjs experiments/jev/v2/v2.test.mjs experiments/jev/v2/adapter-v2.test.mjs experiments/jev/s2b/runtime.test.mjs experiments/jev/v2/probability-diagnostics/probability-diagnostics.test.mjs experiments/jev/s2d/runtime.test.mjs
```

**188 PASS, zero falhas**: 157 anteriores + 31 novos. Cobertura nova: limite de seis, budget, preço, IDs e bytes congelados, zero retry, persistência antes do envio, atomicidade/falha antes do rename, projeção, hash, privacidade, modelo diferente, usage ausente/inválido/excessivo, HTTP 401/403/429/5xx, DNS/TLS/timeout, resposta vazia, probabilidade inválida classificada, erro estrutural fora do escopo, crash antes/depois do transporte, locks e bloqueio de retomada.

Testes e simulações não leram credenciais nem acessaram rede. Diretórios `s2d-offline-*` são artefatos locais ignorados de testes, separados do único run real. A validação real deste checkpoint foi efetivamente exercitada nas seis chamadas autorizadas.

Históricos conferidos antes/depois e entre stages: freezes S0/S1/S2-A/S2-C, matriz/requests/scorer/adapter, wrapper S2-C, 17 artefatos S2-B e seu lock. Hashes e listas de arquivos preservados. S2-B continua **4 iniciadas, 3 normalizadas, 1 FAILED_STRUCTURAL / INVALID_PROBABILITIES, 176 NOT_STARTED**. Seu run, ledger, authorization, budget e lock não foram reutilizados ou editados.

Causa específica histórica de V2-02/validation/1 permanece **NÃO DETERMINADA / NÃO RECUPERÁVEL**. O raw histórico não existe; este probe não recupera nem reproduz aquela chamada. O êxito estrutural atual não altera o HOLD anterior.

Novos fontes isolados: [experiments/jev/s2d/](experiments/jev/s2d/) — probes, core, runner real com entrada explícita, 31 testes, README, snapshot de preservação, preço, requests materializados, certificação e freeze próprio. Artefatos do run: manifest, authorization, pricing, budget, probes-freeze, ledger, seis stage-results, probabilities-summary, repetition-comparison, privacy-check, errors, summary, hashes e execution.lock.

Alteração fora desses namespaces: este relatório e append em [PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md). Sem mudança arquitetural de produto; PROJECT.md permaneceu intacto.

Angario/web alterado: **NÃO**. JEV integrado/provider trocado: **NÃO**. OpenAI alterado/chamado: **NÃO / 0**. Production, banco, Radar e WhatsApp: **NÃO ACESSADOS**. Nenhuma migration, Q1 ou M1c-F. Sem commit, push, merge, PR ou deploy. Também conferidos links locais, whitespace e `git diff --check`.

Não executados: UI/build/suíte de produto, billing externo, lote de 12/180, S3 e integração. Não foram necessários para este executor isolado; não estão certificados por este resultado.

## Limites, conclusão diagnóstica e próximo gate

As seis respostas demonstram envelope/probabilities reais compatíveis com o parser atual nesta amostra, com observabilidade e persistência sanitizada. **Não aprovam semanticamente o JEV**, não demonstram robustez V2 completa e não justificam relaxar a tolerância ou retomar o lote interrompido.

Limitações: amostra pequena e somente positiva estruturalmente; nenhuma ocorrência real de INVALID_PROBABILITIES para verificar o subcódigo em rede; P3 aproxima contagem/mistura de opções, sem reproduzir toda a complexidade de contexto de V2; variar confidence não é erro estrutural; custo faturado desconhecido; varredura de privacidade complementa allowlist, não uma garantia universal sobre qualquer futuro conteúdo.

Opções para decisão humana, nenhuma iniciada:

1. **Encerrar o experimento:** nenhum novo custo/chamada; conservar este PASS DIAGNOSTIC e o HOLD S2-B.
2. **Pequeno lote diagnóstico maior:** desenho específico com contextos/pares sintéticos mais diversos e diagnóstico já preparado; nova quantidade, modelo e teto explícitos. Não completar nem unir métricas ao S2-B.
3. **Novo lote V2 completo do zero:** novo run e nova autorização, matriz/requests/modelo preservados para comparabilidade; verificar executor e orçamento de novo. Sem reutilizar 176 não iniciadas.

Recomendação: encerrar este probe; caso o usuário queira continuar investigando, deliberar sobre o **pequeno lote diagnóstico maior** antes de um lote completo. Não executar automaticamente lote B de 12, lote A de 180, S3, integração ou provider swap.

**STOP JEV-S2-D: seis de seis chamadas consumidas, US$0,000226716 estimados de US$0,05, zero retry, zero raw persistido. Próximo gate: decisão humana.**
