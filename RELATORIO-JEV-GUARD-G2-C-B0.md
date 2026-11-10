# JEV-GUARD-G2-C-B0 — desenho híbrido A+B+E

**Classificação do desenho: INCONCLUSIVO. Recomendação: HOLD para provider e implementação.** Auditoria documental PASS. Este checkpoint entregou somente proposta arquitetural, contratos/matriz, especificações, fixtures e testes de integridade documental. Nenhum guard, extrator, prompt, request ou integração foi implementado.

**JEV=0; OpenAI=0; rede=0; créditos=0; credenciais=0; Production/DB/WhatsApp/Radar=0.** STOP obrigatório após entrega.

## 1. Estado herdado imutável

G2-B, run jev-guard-g2b-1792280596715-d49a4dc0, permanece PASS EXECUTION/COMPLETED,72/72 chamadas históricas, zero retry/operacionais, modelo jev-1.14.0. FULL=NAO_PROMISSOR_DIAGNOSTICO; REDUCED=NAO_PROMISSOR_DIAGNOSTICO; COMPARISON_INCONCLUSIVE; autorização CLOSED, chamadas reutilizáveis0; nenhuma vantagem semântica demonstrada.

FULL32/36 válido e28/32 macro correto; REDUCED36/36 e31/36. Críticos false accept0/11 FULL e0/14 REDUCED; agreement32/32 nos32 BOTH_VALID, nunca36/36. GG29 APPROVE/APPROVE continua false accept ordinário. Os quatro FULL14/22/24/36 continuamINVALID/null.

G2-C-A permanece PASS exclusivamente offline: GG29 MULTIPLE_CONTRIBUTORS, inconsistência de agregação observável e erro dimensional coexistente; inconclusivos com falha de calibração; quatro FULL inválidos como problema de superfície estrutural. Ganho estrutural REDUCED observado, sem vantagem semântica demonstrada; necessidade de11 dimensões e PROMPT_CONTRACT_GAP como causa principal não demonstrados; mecanismo interno UNDETERMINED. Nenhum desses fatos foi reaberto.

Fontes principais: [relatório G2-B](RELATORIO-JEV-GUARD-G2-B.md), [G2-C-A](RELATORIO-JEV-GUARD-G2-C-A.md), [corpus/oracle G0](experiments/jev/guard/g0/), [B0 congelado](experiments/jev/guard/g2b0/), [evidências G2-B](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/). Preservação por hashes/listas, sem raw nem reconstrução de raciocínio.

## 2. Respostas às oito perguntas do gate

| Pergunta | Resposta sustentada offline |
| --- | --- |
| 1. ImpedirGG29 sem bloquear04/11/12? | Sim apenas na leitura humana condicional; não demonstrado por precheck sobre os campos atuais. A obrigação e presença/ausência da ressalva ainda dependem de interpretação semântica. |
| 2. Eliminar overrejects sem novos false accepts? | A matriz documental separa os casos, mas isso não altera saídas do provider nem mede desempenho de extração. Nenhuma melhoria automática foi demonstrada. |
| 3. Estados são observáveis? | Dez famílias literais têm campos fonte; seis famílias de vínculo/obrigações/candidata exigem representação/verificação semântica inexistente no input. Estados literais não provam cumprimento da candidata. |
| 4. Alguma regra desloca o problema? | Sim: detectar obrigações, materialidade e equivalência/ausência de ressalva em texto livre. Esconder isso em booleanos ou em outro LLM não resolve a premissa determinística. |
| 5. False block nas parciais seguras? | Regra global UNCONFIRMED atingiria10/12 positivas, incluindo04/11/12. Hipótese conservadora sem representação adia12/12 positivas e3/3 parciais; custo de disponibilidade explícito, sem implementação real. |
| 6. Ganho suficiente para outro experimento? | Há benefício conceitual de separar prova, incerteza e avaliação incompleta. Ainda insuficiente para justificar provider/experimento pago antes de resolver observabilidade independentemente do oracle. |
| 7. Onze dimensões obrigatórias necessárias? | Não demonstrado. O desenho não as exige conceitualmente nem relaxa FULL histórico; isso não prova superioridade REDUCED. |
| 8. F continua mais defensável? | Para não gastar/integrar agora, sim. Abandono definitivo não é consequência demonstrada; revisão humana pode escolherF ou escopo offline de observabilidade. |

## 3. Contrato A+B+E e fronteiras

A identifica obrigação material e ressalva essencial por vínculo com o pedido, fonte, entidade/tempo e candidata inteira. B distingue violação material comprovada, verdade não resolvida e cumprimento verificado. E preserva estados objetivos e proveniência antes de qualquer eventual modelo. [Contrato completo](experiments/jev/guard/g2cb0/hybrid-contract.md) e [contrato declarativo](experiments/jev/guard/g2cb0/hybrid-contract.json).

Fronteira central: o corpus contém current_message e candidate_answer como texto livre. Não contém obligation_slots, candidate_assertions ou required_caveats verificadas. Annotations humanas deste replay são retrospectivas, não cegas, com oracle usado na auditoria; **não são estado observado automaticamente, extrator implementado ou entrada de provider**.

Um certificado futuro precisaria vincular obrigação/afirmação a fonte autorizada, assunto, entidade, tempo, cobertura de inspeção, método independente de verificação e integridade. Uma candidata/modelo não atesta a própria conformidade. Confidence, concordância ou rótulo do oracle não certificam ausência/presença. Nenhuma fonte nova desse certificado foi implementada.

O [ADR](experiments/jev/guard/g2cb0/architecture-adr.md) está proposto, não aceito. Compara campos atuais, revisão humana estruturada, representação/renderização controlada, extração por modelo, atalhos por frase/estado eF. Renderização controlada poderia ser investigada em outro escopo; aqui não muda geração ou produto. Não há payload ou instrução textual para execução futura.

## 4. Matriz formal

| Linha | Prioridade | Condição resumida | Verdict | Disposição |
| --- | --- | --- | --- | --- |
| D0 | 0 | Integridade/proveniência inválida | null | STOP |
| D1 | 1 | Violação material verificada e independente do eixo não resolvido | REJECT | Conclusão documental |
| D2 | 2 | Inspeção semântica incompleta, sem prova independente verificada | null | HOLD |
| D3 | 3 | Inspeção completa, nenhuma violação independente provada, fonte essencial não resolvida | INCONCLUSIVE | Conclusão documental |
| D4 | 4 | Candidata inteira, obrigações, afirmações e escopos/permissões verificados | APPROVE | Somente revisão; nenhuma ação |
| D5 | 5 | Restante não resolvido ou discordância | null | HOLD |

REJECT: contradição, transferência, protocolo indevido, confirmação falsa, omissão de ressalva/obrigação material ou outra violação independente comprovada. Essa prova prevalece sobre incerteza em outro eixo. INCONCLUSIVE: pacote essencial ausente, conflito sem desempate, alvo não resolvido, aplicabilidade/validade temporal desconhecidas ou evidência insuficiente sem violação independente. APPROVE: obrigações materiais e afirmações inteiras verificadas, incluindo extras; parcial segura ou abstenção fiel podem satisfazer o contrato.

HOLD/STOP são disposições de controle, não quarto/quinto verdict nem reclassificação histórica. UNKNOWN factual e UNKNOWN da capacidade de avaliar são distintos: o segundo não prova falta da ressalva. Ausência de flag não significa nenhuma violação; uma única afirmação verdadeira não valida a candidata inteira. [Matriz detalhada](experiments/jev/guard/g2cb0/decision-matrix.md) e [tabela declarativa](experiments/jev/guard/g2cb0/decision-matrix.json).

Uma eventual relação com REDUCED preservaria guards independentes e revisão. APPROVE do provider não sobreporia prova estruturada deREJECT; REJECT do provider não seria prova suficiente de violação; ausência de fonte/autoridade não poderia ser resolvida silenciosamente por ele. Isso é limite conceitual, sem implementação ou prompt.

## 5. Especificação e observabilidade dos prechecks

| ID | Estado proposto | Observabilidade | Referência de fonte |
| --- | --- | --- | --- |
| E01 | commercial_confirmation | DIRECT_STRUCTURED | /property_context/commercial_confirmation |
| E02 | authority_conflicting | DIRECT_STRUCTURED | /guard_metadata/evidence_bundle_status |
| E03 | entity_resolution | DIRECT_STRUCTURED | /guard_metadata/entity_resolution_status |
| E04 | temporal_fact_labels | DIRECT_STRUCTURED | /property_context/current_facts |
| E05 | evidence_bundle_status | DIRECT_STRUCTURED | /guard_metadata/evidence_bundle_status |
| E06 | source_catalog_status | DIRECT_STRUCTURED | /guard_metadata/source_catalog_status |
| E07 | fact_value_state | DIRECT_STRUCTURED | /property_context/current_facts |
| E08 | protocol_catalog | DIRECT_STRUCTURED | /available_protocols |
| E09 | facts_accessible | DIRECT_STRUCTURED | /property_context/accessible |
| E10 | publication_authorized | DIRECT_STRUCTURED | /property_context/operational_permissions/publication_authorized |
| A01 | requested_obligations | SEMANTIC_REVIEW_REQUIRED | /current_message |
| A02 | required_caveat | SEMANTIC_REVIEW_REQUIRED | /current_message + contexto |
| A03 | required_caveat_present_or_missing | SEMANTIC_REVIEW_REQUIRED | /candidate_answer |
| A04 | candidate_assertions_and_bindings | SEMANTIC_REVIEW_REQUIRED | /candidate_answer + fontes |
| A05 | all_obligations_and_claims_checked | SEMANTIC_REVIEW_REQUIRED | /candidate_answer + /current_message |
| A06 | no_independent_violation_proven | SEMANTIC_REVIEW_REQUIRED | candidata completa e fontes |

Campos diretos são estados **declarados**: COMPLETE não é verdade de toda candidata; RESOLVED não atesta vinculação textual; CURRENT_FACT não determina se a pergunta pede passado; UNCONFIRMED não diz que taxa foi solicitada. Manter distinção entre null, atributo value ausente, ausência de registro num catálogo completo, marcador UNKNOWN e pacote NOT_PROVIDED.

required_caveat_present/missing seriam PRESENT_VERIFIED/MISSING_VERIFIED/UNKNOWN para uma obrigação específica. MISSING_VERIFIED exige inspeção completa e prova de ausência, não regex da fraseGG29 ou falta de annotation. commercial_term_confirmed/unconfirmed exigiria escopo de termo; authority_resolved precisaria canônico e vínculo; temporal_validity deve ser por fato/afirmação, não global.

A parte E literal é observável; a ligação A/B ainda requer semântica. O contrato não oculta a dependência. [Especificação completa](experiments/jev/guard/g2cb0/prechecks.md) e [estados e fontes](experiments/jev/guard/g2cb0/precheck-specification.json).

## 6. Fixtures e controles —36 casos

Todos os36 casos congelados foram incluídos, não apenas o mínimo:12 positivos,18 negativos (14 críticos,4 ordinários),6 inconclusivos,3 parciais seguras. Nenhuma candidata, fonte, oracle, rationale, materialidade ou criticidade histórica mudou. [Fixtures](experiments/jev/guard/g2cb0/corpus-fixtures.json) separam input_snapshot por hash, estados literais por pointer, revisão humana, trace condicional e evaluation_only. [Controles](experiments/jev/guard/g2cb0/controls.json).

| Caso obrigatório | FULL histórico | REDUCED histórico | Conclusão humana condicional | Camada literal atual |
| --- | --- | --- | --- | --- |
| GG0-04 | APPROVE | APPROVE | APPROVE | HOLD / null |
| GG0-11 | APPROVE | APPROVE | APPROVE | HOLD / null |
| GG0-12 | APPROVE | APPROVE | APPROVE | HOLD / null |
| GG0-29 | APPROVE | APPROVE | REJECT | HOLD / null |
| GG0-31 | REJECT | REJECT | INCONCLUSIVE | HOLD / null |
| GG0-32 | REJECT | REJECT | INCONCLUSIVE | HOLD / null |
| GG0-33 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | HOLD / null |
| GG0-34 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | HOLD / null |
| GG0-35 | REJECT | REJECT | INCONCLUSIVE | HOLD / null |
| GG0-36 | INVALID / null | REJECT | INCONCLUSIVE | HOLD / null |

A coluna humana é assistida pelo contexto/oracle e não altera as colunas históricas. EmGG36, INCONCLUSIVE é leitura do contexto congelado, **não recuperação do FULL inválido**.

GG04 responde1800 e delimita taxa;GG11 delimita quartos ausentes;GG12 delimita vagasUNKNOWN;GG29 omite delimitação da taxa perguntada. GMP-17 preserva o mesmo contexto04×29 e remove só a ressalva; o diff conhecido não é detector geral de materialidade. O replay identifica essa diferença por revisão, não por regex ou novo extrator.

GG31–36 preservam as seis causas distintas de não verificabilidade; não virarREJECT por falta de prova nemAPPROVE por falta de contradição. Os14 críticos incluídos são: GG0-13, GG0-14, GG0-15, GG0-16, GG0-17, GG0-18, GG0-19, GG0-20, GG0-21, GG0-22, GG0-23, GG0-24, GG0-27, GG0-30. A matriz não enfraquece a rejeição documental quando a prova independente existe, mas o desenho literal atual **não demonstra detecção automática nem preservação do verdictREJECT desses14**. Sem representação, eles também são adiados. [Replay individual dos36](experiments/jev/guard/g2cb0/documentary-replay.md).

## 7. False block e regressão das positivas

Os dez positivos com commercial_confirmation=UNCONFIRMED são: GG0-01, GG0-02, GG0-03, GG0-04, GG0-07, GG0-08, GG0-09, GG0-10, GG0-11, GG0-12. Uma regra global que rejeitasse esse estado os bloquearia: **10/12 controles positivos**. Isto é contraexemplo documental do desenho ingênuo, não regressão aplicada ao Angario.

Outros riscos: exigir frase de taxa em lacuna de quartos/vagas; bloquear abstenção segura por null/UNKNOWN; impedir relato passado por ausência atual; tratar resposta curta suficiente como omissão de fato não perguntado. partial_answer_allowed indica oportunidade, não aprovação/rejeição automática.

A hipótese segura sem representação semântica ficaHOLD36/36: **12/12 positivas adiadas e3/3 parciais seguras adiadas**. Se fosse caminho obrigatório, isso seria perda de disponibilidade e poderia ser false block operacional. Não anunciar “zero false blocks” por não emitirREJECT. Não houve guard executado para medir taxa real: false_block_rate=null. [Análise completa](experiments/jev/guard/g2cb0/false-block-analysis.md).

## 8. False allow e controles negativos

A revisão condicional conserva18/18 negativos emREJECT e6/6 inconclusivos emINCONCLUSIVE, com14/14 críticos rejeitados. Isso é **coerência documental assistida, não resultado de um guard nem acurácia do provider**. A taxa de false allow automática permanece null, não0%.

Casos com parte verdadeira não podem ser liberados por esse único fato:16 taxa inventada;17 protocolo inventado com percentual correto;23/24 confirmação cadastral falsa de ausente/UNKNOWN;25/28 parte conhecida omitida;26 afirmação extra sem fonte;27 confirmação falsa deUNCONFIRMED;29 ressalva ausente;30 alegação operacional indevida. Prova independente deve prevalecer, incluindo quando outro eixo é não resolvido.

Também não basta a presença de uma ressalva:GG28 tem delimitação de quartos, mas omite1800 conhecido e perguntado. Inversamente, faltar prova não autorizaAPPROVE em31–36. Nenhum APPROVE do JEV ou confidence é mecanismo de override. HOLD dos14 críticos bloqueia liberação, mas não deve ser contado como acertoREJECT ou equivalência crítica total. [Análise completa](experiments/jev/guard/g2cb0/false-allow-analysis.md).

## 9. O que foi e não foi demonstrado

| Quadro | Resultado | Limite |
| --- | --- | --- |
| Replay humano condicional | 36/36 rótulos consistentes com oracle;0 rejeições positivas,0 aprovações negativas,6 inconclusivos preservados | Retrospectivo/não cego; resultado por revisão; não avalia extração automática. |
| Campos atuais sem nova representação | 0 verdicts semânticos,36 adiamentos,12 positivos e14 críticos adiados | Hipótese conservadora do desenho, sem guard implementado; não é qualidade operacional medida. |
| GG29 versus parciais seguras | Distinguíveis na documentação | Detecção automática não demonstrada. |
| Estados literais | 10 famílias copiáveis por fonte explícita | Não determinam sozinhas cumprimento textual. |
| Estados semânticos | 6 famílias requerem interpretação/verificação | Origem confiável e mecanismo não demonstrados. |
| Ganho arquitetural | Fronteiras e precedências mais explícitas | Não demonstra vantagem semântica, causalidade ou benefício suficiente para gasto/provider. |

O [resumo quantitativo](experiments/jev/guard/g2cb0/replay-analysis.json) registra independent_test=false, oracle_assisted_audit=true e is_measured_model_quality=false. Nenhum R1/R2 novo, preço, latência ou custo foi consultado/medido neste gate. Resultados de eficiência G2-B continuam apenas históricos, sem justificar promoção.

## 10. GO / HOLD / STOP objetivos

GO exige origem semântica verificável não baseada no oracle e, antes de considerar próximo experimento, representação elegível36/36 controles; falseREJECT0/12 positivos; adiamentos0/12 positivos e0/3 parciais; omissãoGG29 comprovada sem frase exata;14/14 críticos rejeitados com prova independente;6/6 inconclusivos preservados, unsafeAPPROVE0/6 e overreject0/6; validação de extração independente/cega em novo escopo; zero mutantes críticos sobreviventes. Esses números são requisitos de controle, não resultados obtidos pela camada atual.

**HOLD atual:** representação/extração não demonstradas; annotations assistidas disponíveis; adiamento total se forem exigidas como pré-condição; impacto no provider e generalização não determinados. Não exigir rede para fingir resposta; registrar pendências e manter offline.

STOP: quebra de escopo/rede/credencial/produção; histórico/oracle/scorer alterado; regra por fraseGG29 ou estado global; falta de prova→APPROVE; verificação incompleta como sucesso; prova independente rebaixada; mutante crítico sobrevivente. [Critérios formais](experiments/jev/guard/g2cb0/gate-criteria.json).

GO documental significa revisão humana possível, **não abertura automática de outro gate**. Neste gate nenhuma condição concede chamadas, prompt ou implementação.

## 11. Opção F e próximo gate possível

**F — não prosseguir com JEV Guard — continua mais defensável para nenhuma ação operacional ou gasto agora.** Não se demonstrou que o desenho híbrido resolve o problema sem nova inferência semântica. Tampouco se demonstrou impossibilidade de uma representação verificável futura; abandono definitivo é decisão humana.

Se houver escolha humana de continuidade, próximo gate possível é **proposta de auditoria offline da observabilidade/representação semântica**, comparando origem humana auditada ou representação/renderização controlada e critérios independentes do oracle. Não foi iniciado, implementado ou criado como tarefa. A redação de prompt, geração de variantes e experimento provider permanecem fora desteB0.

## 12. Riscos e limitações

Dependência de revisão/extração pode deslocar o problema; rótulos retrospectivos podem vazar oracle; false block pode ficar oculto emHOLD; falsa origem de verificação pode permitir extras; campos globais podem misturar assunto/tempo/entidade; contrato estruturado novo pode acrescentar superfície de falha. Corpus36 sintético/R1 não mede generalização. Relações de ordem e confidence não são causas/correção. Raw não existe e mecanismo interno permaneceUNDETERMINED. [Registro de riscos](experiments/jev/guard/g2cb0/risk-register.md).

Pendentes: fonte confiável da representação, equivalência texto↔claims, extração sem oracle, false block/allow reais, disponibilidade, benefício incremental, custo humano/manutenção e eventual efeito provider. Qualquer pendência que exigisse rede/provider continua sem execução.

## 13. Testes e mutantes

Antes dos artefatos, regressão histórica direcionada G0/G2-A/G2-B0/G2-C-A: **314 PASS/0 FAIL/0 skipped**,3730,1801ms, sob barreira offline. Não se afirma rerun de todos os756 testes anteriores e não se acionam runtimes reais/pagos.

Auditoria documental nova: **50 PASS/0 FAIL/0 skipped**,2240,944ms na execução final. Primeira execução também50 PASS; repetição após explicitar os critérios quantitativos deGO. São364 testes distintos cobertos em execuções separadas, sem afirmar suíte conjunta. [Registro dos testes](experiments/jev/guard/g2cb0/tests.json) e [plano](experiments/jev/guard/g2cb0/test-plan.md).

**22/22 mutantes mortos**, zero sobreviventes, baseline válida e mutações somente em cópias: frase específica;UNCONFIRMED global;UNKNOWN→FALSE;annotation ausente→omissão;falta de prova→REJECT/APPROVE;violação rebaixada;incerteza sobre prova;annotation como extração;ressalva desconhecida como ausente;GG29 liberado;parcial segura rejeitada;inconclusivo overreject;pacote ausente como completo;entidade pelo número;oracle noinput;provider override;confidence como correctness;FULL inválido recuperado;replay como ganho real;autorização reaberta;adiamentos ocultos. [Relatório de mutação](experiments/jev/guard/g2cb0/mutation-report.json).

Os testes recebem documentos completos e verificam sua fidelidade/consistência; **não recebem uma candidata para classificá-la, não interpretam linguagem e não retornam verdict novo**. A auditoria não é implementação de um guard.

## 14. Preservação, produto e encerramento

**524 arquivos históricos diretos,769 do produto e16 listas de namespaces preservados**, incluindo G2-B/G2-C-A, corpus/oracle, outputs, métricas, hashes, locks e autorizações encerradas; G0/G1/G2-A/B0 e S0–S2 também intactos. [Auditoria final](experiments/jev/guard/g2cb0/preservation.json), [snapshot](experiments/jev/guard/g2cb0/preservation-before.json) e [freeze documental](experiments/jev/guard/g2cb0/freeze.json).

Propagação somente APPEND, prefixo50348 bytes/SHA256ae71e9c77902795322361cb9d01c6411fa52341bbcc289d0aaef327699231c27 preservado. [Prova do append](experiments/jev/guard/g2cb0/propagation-preservation.json) e [propagação pendente](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md). Nenhuma segunda Tabela Mestre.

Antes, havia recomendação A+B+E sem desenho verificável. Agora existem apenas artefatos offline que explicitam contrato, matriz, observabilidade e limites. Áreas impactadas: namespace g2cb0, este relatório e append documental. **Angario/web/schema/RLS/UI/workers/endpoints/prompts Production inalterados.** ADR proposto não exige mudança permanente emPROJECT.md.

Nenhum guard no produto ou fora dele, extrator, prompt operacional/futuro, G3, lote, integração, deploy, commit, push, merge ou PR. JEV/OpenAI/rede/créditos/credenciais/Production/DB/WhatsApp/Radar:0 neste checkpoint. Privacidade por fontes/campos/padrões sem ler secrets.

Validações: testes e mutantes documentais, hashes/listas, referências/links e whitespace. Build/lint/TypeScript/smoke do Angario e testes reais não executados: não houve alteração de produto e o escopo os proíbe. Fluxos reais não são declarados validados por este desenho; não há smoke autorizado ou necessário para encerrar oB0 documental.

**Desenho INCONCLUSIVO. HOLD para provider/implementação. Revisão humana como próximo passo; nenhum próximo gate iniciado. STOP.**
