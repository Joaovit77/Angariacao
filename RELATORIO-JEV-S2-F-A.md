# JEV-S2-F-A — desenho offline do diagnóstico direcionado

Data: 17/10/2026. **PASS exclusivamente offline. Zero JEV, zero OpenAI, zero rede, zero créditos, zero integração.**

Foram congelados uma matriz diagnóstica nova, mini-oráculo independente, pares auditáveis, plano proposto, métricas, riscos e projeções financeiras. **Nenhum run real, ledger, tentativa, autorização ou lock novo foi criado. Nenhuma credencial ou arquivo de ambiente foi lido.** Próximo gate: decisão humana sobre S2-F-B.

Classificações históricas mantidas: S2-E PASS da execução, DECISION INCONCLUSIVO e VALIDATION INCONCLUSIVO; S2-B HOLD imutável. O desenho não altera nem completa campanhas anteriores.

## Regressão e preservação

Antes da primeira escrita S2-F, foram verificados hashes/listas de S0 a S2-E. Os **214 testes existentes passaram**. Em seguida foram acrescentados **34 testes S2-F-A**; execução conjunta: **248 PASS, zero falhas**, sem rede.

O [snapshot de preservação](experiments/jev/s2f/preservation-before.json) protege 102 arquivos históricos e listas de diretórios, além dos verificadores/freeze S0/S1/S2-A. Protege fontes, matriz, requests, scorer, parser/adapter, wrapper S2-C, mini-oráculo S2-E, runs/ledgers/authorization/locks de S2-B/D/E e relatórios anteriores. Nenhum desses arquivos foi editado. O freeze próprio deste checkpoint não sobrescreve freeze antigo.

S2-B permanece **4 iniciadas, 3 normalizadas, 1 FAILED_STRUCTURAL, 176 NOT_STARTED**. Causa específica de V2-02/validation/1: **NÃO DETERMINADA / NÃO RECUPERÁVEL**; raw histórico inexistente. Nenhuma falha nova será atribuída retroativamente a ela.

## Base factual S2-E congelada

[s2e-observed-facts.json](experiments/jev/s2f/s2e-observed-facts.json) é uma projeção dos artefatos sanitizados preservados, sem recalcular ou reinterpretar seus resultados.

| Evidência histórica | Fato preservado |
| --- | --- |
| Transporte / modelo | 12/12 completos; jev-1.14.0 observado em 12/12 |
| Estrutura | 10 válidas, 2 INVALID_PROBABILITIES classificados |
| E1_TEMPORAL/VALIDATION/R2 | PROBABILITY_SUM_MISMATCH; PASS 0.01, FAIL 0.05, INCONCLUSIVE 0, NOT_APPLICABLE 0.93; soma 0.9900000000000001; delta -0.009999999999999898 |
| E2_ENTITY/VALIDATION/R1 | PROBABILITY_CHOICE_MISMATCH; PASS 0.03, FAIL 0.48, INCONCLUSIVE 0.02, NOT_APPLICABLE 0.47; choice NOT_APPLICABLE abaixo da máxima FAIL 0.48 |
| DECISION | Action 6/6; completude 0/6; micro dos dez campos 48/60; missing 4/6; prohibited 0/6; entidade 6/6; temporal 2/6 |
| VALIDATION, somente válidos | Verdict 4/4; temporal 1/4; cross_entity 0/4; grounding, factuality, protocol, entity, coverage, omission, unsupported_assumption, safety e partial_answer_allowed 4/4 |
| False accept / false reject | 0/4 válidos / 0/0 NÃO TESTADO |
| Erros prioritários por pergunta | E3 DECISION prohibited_INVENT_COMMERCIAL=NO com confidence 0.94 em ambas, esperado YES; E2 VALIDATION/R2 temporal=FAIL com confidence 0.93, esperado PASS |

Os vetores acima são observações históricas, não probabilidades esperadas do novo oráculo. Confiança primária de action/verdict não vira confiança na decisão inteira. Nenhum threshold de confidence foi criado.

## Matriz proposta e pares mínimos

[diagnostic-matrix.json](experiments/jev/s2f/diagnostic-matrix.json) contém **nove casos sintéticos**, sem dado real. O novo mini-oráculo usa os enums e definições V2, com expected/applicability/rationale por campo e dimensão, sem derivar todos os FAIL do verdict.

| Caso | Evidência / candidata | Proposta de tarefa | Veredicto esperado, se VALIDATION planejada |
| --- | --- | --- | --- |
| T1 | Histórico de uma vaga; fonte atual de duas; pergunta exige passado e presente; candidata usa uma vaga como atual | DECISION compartilhada com T2 + VALIDATION | REJECT |
| T2 | Mesmas fontes/pergunta; candidata preserva uma vaga no passado e duas no presente | VALIDATION; DECISION já compartilhada | APPROVE |
| E1 | A=1800, B=2600, ambos atuais; candidata atribui 2600 a A | DECISION compartilhada com E2 + VALIDATION | REJECT |
| E2 | Mesmas fontes/pergunta; candidata usa 1800 de A | VALIDATION; DECISION já compartilhada | APPROVE |
| P1 | Valor conhecido 1800, taxa ausente; candidata informa 1800 e inventa 7%/PROTO-SINT-77 | DECISION compartilhada com P2 + VALIDATION | REJECT |
| P2 | Mesmas fontes/pergunta; candidata informa 1800 e declara taxa a confirmar | VALIDATION; DECISION já compartilhada | APPROVE |
| H1 | Mesmo problema temporal, mas fonte atual null; histórico perguntado permanece relevante e não superado | Somente DECISION | Não planejada |
| E3 | Mesmas fontes A/B atuais; alvo B; candidata transfere 1800 de A para B | Somente VALIDATION, direção inversa | REJECT |
| E4 | Só fonte A explícita, sem B, histórico ou taxa pedida; controle negativo de risco/lacuna | Somente DECISION | Não planejada |

O oráculo documenta também as tarefas não selecionadas, mas elas não criam chamadas ou denominadores. IDs novos são locais ao desenho; não há stage histórico reenviado.

Pares auditados automaticamente:

1. **T1/T2, VALIDATION:** somente candidate_answer muda; fontes, pergunta e passado permanecem iguais.
2. **E1/E2, VALIDATION:** somente o valor atribuído na candidata muda.
3. **P1/P2, VALIDATION:** somente a candidata muda; ambas comunicam 1800, isolando invenção versus delimitação da taxa. Percentual e identidade de protocolo são violados juntos, portanto não se atribui causalmente REJECT só a um deles.
4. **T2/H1, DECISION:** somente o valor da fonte atual muda de 2 para null na projeção sem candidata.
5. **E2/E4, DECISION:** somente a fonte B é removida; A e a pergunta continuam iguais.

E1/E3 é **controle direcional, não par de uma alteração**: inverter alvo exige mudar pergunta, entidade selecionada e candidata; fontes/valores permanecem iguais. Essa transformação está declarada e não foi contada entre os cinco pares mínimos.

### Distinções semânticas preservadas

- **Temporal:** T1/T2 perguntam expressamente o passado, então o ID histórico é obrigatório mesmo superado para o presente. CURRENT_FACT/HISTORICAL_FACT/SUPERSEDED_FACT/HISTORICAL_SUPPORT_REQUIRED são separados. Em H1, não há fonte atual confirmada para superseder o passado: HISTORICAL_FACT/UNKNOWN_CURRENT_STATE/HISTORICAL_SUPPORT_REQUIRED, sem SUPERSEDED_FACT.
- **Entidade:** transferir B→A ou A→B exige entity/cross_entity/grounding/factuality FAIL, mas temporal PASS porque ambos os valores são atuais. E2 é controle correto; E4 controla risco geral indevidamente marcado quando só há A explícito.
- **Prohibited assumptions:** DECISION precisa marcar HISTORICAL_AS_CURRENT, CROSS_ENTITY ou INVENT_COMMERCIAL a partir das fontes e pergunta, antes de qualquer candidata. H1 testa estado atual ausente; E4 tem informação explícita e nenhum desses riscos adicionais.
- **Parcial:** P1 é REJECT com protocol/grounding/unsupported_assumption FAIL e factuality INCONCLUSIVE quanto à taxa desconhecida. P2 é APPROVE, protocol NOT_APPLICABLE e partial_answer_allowed PASS. Em P1 partial_answer_allowed também é PASS: a candidata inadequada não torna o método parcial proibido. Não penalizar P2 por não inventar informação ausente.

[oracle-mini.json](experiments/jev/s2f/oracle-mini.json) registra cada expected, aplicabilidade e justificativa. Oracle/expected/rationale/IDs de cenário não entram nos payloads. Candidate entra somente em VALIDATION. Nenhum novo enum semântico ou valor golden de confidence/probabilities foi criado.

## Quantidade recomendada e plano

**Recomendação: 24 chamadas futuras**, sujeitas a nova autorização humana, não executadas agora.

| Bloco | Requests únicos | Duas repetições |
| --- | --- | --- |
| T1/T2 | Uma DECISION + duas VALIDATION | 6 |
| E1/E2 | Uma DECISION + duas VALIDATION | 6 |
| P1/P2 | Uma DECISION + duas VALIDATION | 6 |
| H1 | Uma DECISION | 2 |
| E3 | Uma VALIDATION | 2 |
| E4 | Uma DECISION | 2 |
| Total | **12** | **24** |

São **10 DECISION e 14 VALIDATION**, sem dupla contagem dos aliases. DECISION dos pares que só mudam candidata é byte a byte idêntica e recebe somente duas chamadas, não quatro. R1/R2 de cada request têm o mesmo hash e nenhum output anterior entra no seguinte.

O [requests-plan.json](experiments/jev/s2f/requests-plan.json) contém os 12 requests sintéticos, seus SHA-256, modelo, estrutura/opções e 24 IDs PLANNED_ONLY em ordem proposta. O corpo é exatamente o preparador V2 congelado, sem instrução adicional para corrigir probabilidades. Não há run_id, attempt_id, autorização/lock ou executor real neste namespace.

Os três controles positivos de VALIDATION são T2, E2 e P2: **seis exposições planejadas para false reject**. Negativos T1/E1/P1/E3: oito. São quantidades planejadas, não denominadores observados. Se futuros envelopes forem inválidos, seus stages ficam fora da semântica e o denominador real diminui; todos os positivos inválidos → false reject 0/0 NÃO TESTADO, nunca sucesso fictício.

## Perguntas de investigação e stress

[investigation-map.json](experiments/jev/s2f/investigation-map.json) congela as doze perguntas, casos e métodos:

| Questão | Investigação proposta |
| --- | --- |
| Q1 / Q2 | Reaparecimento de SUM_MISMATCH e CHOICE_MISMATCH sob estruturas semelhantes, com vetores/choice originais e subcódigos seguros |
| Q3 | Taxas estruturais por DECISION/VALIDATION, com denominadores próprios e cobertura |
| Q4 | Associação descritiva por tarefa e quantidade de perguntas; sem atribuir causalidade à contagem |
| Q5 | Supersessão explícita versus histórico relevante não superado, incluindo seleção histórica obrigatória |
| Q6 | Erro factual/de entidade com tempo atual correto versus uso indevido de passado como presente |
| Q7 | Transferência B→A e A→B, com controle correto e duas repetições de cada request selecionado |
| Q8 | Riscos previstos antes da candidata e controle explícito sem fonte concorrente/lacuna |
| Q9 | entity FAIL, cross_entity FAIL e temporal PASS no mesmo caso, sem espalhar FAIL pelo verdict |
| Q10 | Rejeitar invenção de taxa/protocolo e ainda reconhecer parcial permitida; aprovar parcial correta |
| Q11 | Repetição de erros por campo e confidence nativa, sem threshold ou falsa confiança composta |
| Q12 | Aprovação dos controles corretos/parcial válida e false reject efetivamente testável |

Stress inclui opções de **2/3/4**, DECISION com **24 ou 25 perguntas** e VALIDATION com **12**. Há NOT_APPLICABLE legítimo e FAIL por protocolo inventado. Observar margem FAIL/NOT_APPLICABLE retornada, sem fabricar uma margem ou probabilidade esperada. Empates legítimos continuam aceitos pelo parser; os testes usam uma fixture já congelada S2-C, não um vetor golden para o serviço.

**Limite explícito de Q4:** tarefa, conteúdo e contagem variam juntos; este lote não isola uma intervenção de adicionar/remover perguntas mantendo alvos fixos. Pode descrever associação, mas não responder causalmente se maior número aumenta risco. Um contraste causal requer outro bloco e decisão de escopo, fora destas 24. Os positivos, histórico obrigatório e inversão direcional foram priorizados no limite preferido. Nenhuma promessa de generalização ou sistematicidade com duas repetições.

## Projeções financeiras — referência histórica, sem autorização

Somente snapshot S2-E, verificado naquele checkpoint em 17/10/2026 16:32:41Z: entrada US$0,042/Mtok, saída gratuita. **Não é preço atual garantido; nenhuma documentação externa foi consultada neste checkpoint offline.** Antes de qualquer futuro envio será obrigatório reconfirmar preço oficial e contexto.

Média histórica: 27.366/12 = **2.280,5 tokens de entrada por chamada**, US$0,000095781 estimados/chamada. Reserva conservadora: 65.536 tokens/chamada. Valores estimados não são billing observado.

| Chamadas | Total usando média histórica | Reserva conservadora integral |
| --- | --- | --- |
| 12 | US$0,001149372 | US$0,033030144 |
| 16 | US$0,001532496 | US$0,044040192 |
| 20 | US$0,001915620 | US$0,055050240 |
| 24 | US$0,002298744 | US$0,066060288 |

**20 e 24 reservas integrais excedem o antigo teto US$0,05.** A recomendação de 24 não importa nem concede orçamento antigo. Reserva integral nessa referência seria US$0,066060288; quantidade e teto futuros serão escolhidos pelo humano. Um guard serial de custo conhecido + pior caso da próxima chamada ainda deve interromper se o cap não comportar o restante. Média pequena não garante completar um plano sob qualquer teto.

12/16/20 são comparações de custo, não prefixos aprovados de execução: cortar o plano poderia excluir controles ou positivos. Redução exige redesenho e novo freeze antes da autorização real. [budget-projection.json](experiments/jev/s2f/budget-projection.json) publica valores, fonte histórica/hash, arredondamento conservador e authorization_active=false.

## Métricas e critérios congelados

[metrics-contract.md](experiments/jev/s2f/metrics-contract.md) define fórmulas, unidades, cobertura, pares, confidence e categorias antes de rede:

- **Structural:** valid rate, contagens/taxas SUM_MISMATCH, CHOICE_MISMATCH e demais subcódigos, por tarefa/question_count/pergunta. Separar iniciados, operacionais, desconhecidos, não executados e envelopes de perguntas isoladas.
- **DECISION:** action, dez campos, completude, temporal, entidade, missing, prohibited e seleção/recall histórico. T1/T2 compartilhados e H1 criam quatro exposições planejadas de um ID histórico obrigatório; não repetir o 0/0 obrigatório do S2-E como prova de recuperação.
- **VALIDATION:** verdict, onze dimensões, temporal/cross_entity/unsupported_assumption/partial, false accept e false reject separados. Publicar applicability. Parcial correta não exige inventar taxa nem receber FAIL por lacuna declarada.
- **Consistency:** R1/R2 por status/campos/reasons/choices/confidence/subcódigos; pares mínimos exigem ambos endpoints corretos, sem maioria ou escolha posterior. Inválido/ausente torna o par inconclusivo e reduz cobertura, sem fabricar acerto.
- **Confidence:** erro e confidence da própria pergunta; quartis descritivos e repetição por campo. Não usar a confidence de RESPOND/REJECT como confiança na completude; não criar threshold operacional.

Somente resultados integralmente válidos e normalizados entram em D/V. Denominador zero → null e NÃO TESTADO. Aliases não duplicam registros. Nenhum denominador ou métrica é misturado com S2-B/D/E. Razões vêm somente das dimensões FAIL retornadas, não do verdict.

Categorias futuras: PROMISSOR DIAGNÓSTICO, INCONCLUSIVO e NÃO PROMISSOR DIAGNÓSTICO, separadas por tarefa. Critérios conservadores completos estão no contrato; cobertura completa e campos/controles corretos seriam necessários para promissor. Falhas materiais repetidas e false accepts permanecem visíveis, sem compensação por outros acertos. Nenhum critério equivale a Production Ready, integração autorizada ou provider superior.

## Paradas futuras e riscos

Hard stops propostos: model mismatch, erro operacional, structural unknown, privacy breach, raw persistido, budget inseguro, tentativa de retry, usage que impeça controle financeiro, histórico alterado ou divergência parser/wrapper. Persistência IN_PROGRESS deve anteceder HTTP; resultado incerto nunca autoriza reenvio/auto-resume. Fonte/ledger/lock/autorizações terão namespace novo somente após gate próprio.

INVALID_PROBABILITIES com subcódigo específico seguro pode continuar como evento diagnóstico apenas com modelo/usage/budget/privacidade íntegros e raw descartado. Continua inválido e integralmente fora da semântica. Tolerância **0.000001** intacta; sem arredondar, normalizar, preencher opções, converter strings ou corrigir choice pela máxima.

[risk-register.json](experiments/jev/s2f/risk-register.json) registra amostra pequena, limite de identificação Q4, aplicabilidade em investigação, custo/preço históricos, perda de positivos por falha estrutural, confidence composta indevida, confusão com causa S2-B e payload externo privado/desconhecido. Mitigações são contrato congelado, projeção allowlisted/hash sem raw, scan, cobertura explícita e gate humano. Raw criptografado/efêmero segue somente proposta dependente de gate próprio.

## Validação executada e limites atuais

Testes: pares mínimos e transformação direcional; controles positivos; false reject com denominador seis; false accept separado; temporal e entidade independentes; riscos antes da candidata; parcial; expected/applicability/rationale; isolamento de oráculo; ausência de PII; stress/enums e empate; reprodução offline dos dois vetores S2-E ainda inválidos; contagem/deduplicação; custos 12/16/20/24 e entradas financeiras inseguras; denominadores de inválidos/parciais; action correta sem completude; limites de Q4; ausência de executor/rede/ambiente e preservação histórica.

Comando executado, na raiz:

```powershell
node --test experiments/jev/harness.test.mjs experiments/jev/v2/v2.test.mjs experiments/jev/v2/adapter-v2.test.mjs experiments/jev/s2b/runtime.test.mjs experiments/jev/v2/probability-diagnostics/probability-diagnostics.test.mjs experiments/jev/s2d/runtime.test.mjs experiments/jev/s2e/runtime.test.mjs experiments/jev/s2f/s2f-a.test.mjs
```

**214 anteriores + 34 novos = 248 PASS.** O teste do freeze próprio foi conferido após sua criação. Também conferidos links, whitespace, hashes/listas históricos e `git diff --check`. Testes anteriores podem gerar diretórios de simulação ignorados, sem rede; não são um run real S2-F. O gerador novo escreve somente artefatos de planejamento no próprio namespace, sem criar resultados/locks reais.

Não executados: chamadas JEV/OpenAI, navegador/serviço externo, leitura de credenciais, smoke real, testes/build/UI do produto ou confirmação atual de preço. Isso respeita o escopo exclusivamente offline. O PASS certifica o desenho e contratos locais, não um runner futuro, a qualidade real do modelo ou a eficácia estatística do lote.

## Arquivos e próximo gate

Namespace [experiments/jev/s2f/](experiments/jev/s2f/): diagnostic-matrix.json, oracle-mini.json, requests-plan.json, metrics-contract.md, budget-projection.json, risk-register.json, investigation-map.json, s2e-observed-facts.json, preservation-before.json, design.mjs, generate.mjs, s2f-a.test.mjs e freeze.json.

Única atualização adicional: append em [PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md). PROJECT.md não precisa mudar: a arquitetura permanente de produto permanece igual.

**S2-B, S2-D e S2-E preservados. Angario/web/provider/OpenAI intocados. Banco, Production, Radar e WhatsApp não acessados. Nenhuma migration, Q1, M1c-F, integração, commit, push, merge, PR ou deploy.** Ponto de rollback: namespace novo isolado, sem importação pelo produto ou executor real.

Proposta de próximo gate: **decisão humana sobre S2-F-B**, escolhendo quantidade/teto a partir deste desenho, reconhecendo o limite de Q4 e revisando preço, executor, persistência e privacidade antes de qualquer rede. Nenhuma autorização foi presumida e nenhum S2-F-B, lote 180 ou S3 foi iniciado.

**STOP JEV-S2-F-A. Zero chamadas JEV; zero OpenAI; zero créditos.**
