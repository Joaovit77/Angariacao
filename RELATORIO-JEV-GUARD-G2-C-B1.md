# JEV-GUARD-G2-C-B1 — SEMANTIC OBSERVABILITY AUDIT DESIGN

**Classificação única: `OBSERVABILITY_INCONCLUSIVE`. Recomendação: `HOLD` para provider e implementação.** Gate encerrado em desenho e auditoria offline; não iniciar a próxima etapa.

Não foi demonstrada representação verificável, independente do oracle, capaz de distinguir operacionalmente GG0-29 de GG0-04/11/12 e separar REJECT de INCONCLUSIVE em todos os controles. H2 e H3 têm caminhos conceituais para investigação, mas permanecem lacunas materiais na origem das obrigações, na completude semântica e na independência da revisão. Não há conclusão de impossibilidade universal; há ausência de demonstração suficiente neste gate.

## Escopo e estado anterior

Antes do B1, B0 tinha desenho híbrido A+B+E e replay documental dos 36 casos, sem fonte confiável para seis famílias semânticas. B1 acrescenta rastreabilidade das perguntas, fontes admissíveis, contratos futuros e limites da certificação. Não altera o desenho B0 para fazê-lo passar, não executa classificação semântica e não produz nova ground truth.

Leitura prévia: 190 arquivos, 4.990.347 bytes, travessia de 78.989 folhas primitivas JSON e conferência de identidade das 72 cópias de etapas. [Recibo de leitura integral](experiments/jev/guard/g2cb1/source-reading-receipt.json), incluindo relatórios, checkpoints, artefatos, matrizes, fixtures, testes, mutantes, preservação e propagação de G2-B, C-A e C-B0. Trata-se de leitura por arquivos e travessia de estruturas; não de revisão humana independente nem reconstrução de raw ausente.

Aplicadas as regras do projeto, a política de IA por ambiente e as skills de arquitetura, estratégia de testes e documentação. Nenhum mecanismo externo foi necessário. A data efetiva das verificações consta nos artefatos UTC.

## Estado herdado preservado

| Gate | Estado imutável |
|---|---|
| G2-B | FULL e REDUCED `NAO_PROMISSOR_DIAGNOSTICO`; `COMPARISON_INCONCLUSIVE`; autorização CLOSED e zero chamadas reutilizáveis; nenhuma vantagem semântica demonstrada. |
| G2-B, integridade | Quatro FULL inválidos: GG0-14/22/24/36, vereditos null preservados. Nenhuma recuperação ou correção retroativa. GG0-29 permanece false accept histórico FULL/REDUCED. |
| G2-C-A | PASS OFFLINE; GG0-29 `MULTIPLE_CONTRIBUTORS`, com `VERDICT_AGGREGATION_FAILURE` observável e `DIMENSIONAL_REASONING_FAILURE` coexistente. Mecanismo interno `UNDETERMINED`. |
| G2-C-A, limites | `INCONCLUSIVE_CALIBRATION_FAILURE`; quatro inválidos `STRUCTURAL_SURFACE_PROBLEM`; vantagem estrutural REDUCED observada, sem vantagem semântica, necessidade das 11 dimensões ou `PROMPT_CONTRACT_GAP` como causa principal demonstrados. |
| G2-C-B0 | `INCONCLUSIVO / HOLD`; replay documental 36/36, 14 críticos; distinção humana documental 29 × 04/11/12, sem distinção automática demonstrada. UNCONFIRMED global atingiria 10/12 positivos. |
| G2-C-B0, disponibilidade | Cenário sem representação: HOLD 36/36, 12/12 positivos, 3/3 parciais seguras e 14/14 críticos adiados. São achados do cenário B0, não execução B1 nem acertos semânticos. |
| G2-C-B0, limites | False block/allow automáticos não medidos; matriz REJECT × INCONCLUSIVE documental; nenhuma melhora de provider demonstrada; F continua defensável. |

Não se reabre nenhuma conclusão. Os números de desempenho herdados não são medições novas. A matriz B0 é reutilizada por referência e SHA-256 `736f9c1bd67ed50be158f73f07d77bea042084ea1585c879841538ddeeee83d7`, sem editar suas linhas.

## Fontes e prevenção de circularidade

Separação em [source-admissibility.json](experiments/jev/guard/g2cb1/source-admissibility.json): input legítimo, derivação literal com pointer/hash, annotation retrospectiva, oracle, rationale, expected verdict e materialidade histórica são camadas diferentes. Só as duas primeiras fornecem evidência operacional literal; não certificam relações semânticas ausentes.

As anotações B0 declaram uso do oracle e ausência de cegamento. B1 marca sua admissibilidade como **`ORACLE_ASSISTED_ONLY`**. Elas documentam a interpretação retrospectiva, sem provar observabilidade automática ou revisão humana independente efetivamente executada. O rótulo legado `MANUAL_RETROSPECTIVE_REVIEW` e seus bytes permanecem preservados. Codex não se declara revisor humano. Este esclarecimento de proveniência é delta documental do B1, sem reclassificar resultados históricos.

O autor deste relatório já teve acesso ao oracle e aos pares; suas interpretações de casos não podem servir como certificação independente. Não há nova annotation de caso nem pacote cego. Os 36 casos são referenciados por IDs, pointers e hashes em [case-references.json](experiments/jev/guard/g2cb1/case-references.json), sem copiar inputs para criar dataset.

## Seis famílias: o que foi estabelecido

O [mapa integral](experiments/jev/guard/g2cb1/semantic-families.md) responde separadamente às 20 perguntas para cada família, totalizando 120 respostas fundamentadas. A [matriz de observabilidade](experiments/jev/guard/g2cb1/observability-matrix.md) contém fonte, observação direta, interpretação, estrutura upstream, revisão cega, leakage, failure mode e estado.

| Família | Limite atual | Estado |
|---|---|---|
| requested_obligations | Pedido livre não enumera slots confiáveis. Fixar obrigações antes de ver a candidata exige interpretar pedido/contexto e política de materialidade. | NOT_DEMONSTRATED |
| required_caveat | Necessidade depende de pedido, fonte, entidade, tempo e termo. UNCONFIRMED isolado não basta. Distinguir REQUIRED/OPTIONAL/IRRELEVANT/UNKNOWN. | NOT_DEMONSTRATED |
| required_caveat_present_or_missing | Presença precisa equivalência, polaridade e escopo; ausência exige inspeção integral. Sem isso, UNKNOWN. | NOT_DEMONSTRATED |
| candidate_assertions_and_bindings | Texto não fornece inventário certificado de proposições e relações. Cada claim exige vínculo de fonte por entidade/atributo/tempo. | NOT_DEMONSTRATED |
| all_obligations_and_claims_checked | Enumerar alguns itens ou cobrir caracteres não prova que todos os significados foram inspecionados. | UNRESOLVED |
| no_independent_violation_proven | “Não detectei” não prova inexistência; inspeção deve ter escopo completo, limites e lacunas explícitos. | UNRESOLVED |

As dez famílias estruturadas do B0 continuam oferecendo estados literais. Não completam automaticamente estas seis. H2 é `HUMAN_REVIEW_ELIGIBLE` como proposta e H3 `CONTROLLED_REPRESENTATION_ELIGIBLE` em partes do domínio futuro; nenhuma família completa recebe certificação operacional. Não se conclui `MODEL_EXTRACTION_ONLY`, pois exclusividade de modelo também não foi demonstrada.

## H1–H5, em igualdade

[Comparação completa](experiments/jev/guard/g2cb1/architecture-comparison.md): 18 eixos, incluindo exigência de precisão, independência, auditabilidade, leakage, custos humano/computacional, latência, falhas, false block/allow, disponibilidade, manutenção, compatibilidade com Angario, provider, schema, geração, teste cego e reversibilidade. Escalas LOW/MEDIUM/HIGH/UNKNOWN são exigências e riscos potenciais, não métricas observadas.

- **H1 — campos atuais:** limita-se à observação literal; sem inventário semântico nem completude, insuficiente para o problema integral.
- **H2 — revisão humana estruturada:** contrato propõe origem e evidência auditáveis, dupla revisão e adjudicação, mas nenhuma pessoa revisou e a confiabilidade semântica não foi medida.
- **H3 — representação/renderização controlada:** poderia verificar partes da cobertura por construção em domínio fechado. Não resolve automaticamente intenção livre, materialidade ou fontes; não certifica candidatas históricas nem demonstra compatibilidade com Angario.
- **H4 — extração automática:** exigiria ground truth independente e validação cega própria; outro LLM preenchendo prechecks traz `PROBLEM_DISPLACEMENT_RISK`. Nenhum extrator ou prompt foi produzido.
- **H5/F — abandonar JEV Guard:** alternativa legítima, sem obrigação de continuar. Evita uma nova superfície não validada; benefícios perdidos e custos comparativos continuam UNKNOWN. Não é falha e não foi descartada por preferência por continuidade.

Nenhuma abordagem foi promovida por menor custo. Não há números de custo ou latência inventados. H5 não mede a segurança do produto existente.

## Contratos futuros, sem execução

O [contrato de revisão humana futura](experiments/jev/guard/g2cb1/human-review-contract.md) inclui formulário em branco, instruções, granularidade de obrigação, fonte ausente/disponível, materialidade, parcial segura, abstenção, ressalvas, claims, bindings, cobertura, provenance, versionamento, papéis, exposição prévia, duas revisões independentes, adjudicação sem oracle e critérios cegos. Não há formulários preenchidos, pessoas fictícias, recrutamento ou assinatura.

Obrigações são registradas e seladas antes de mostrar a candidata. Claims incluem texto/span, sujeito, entidade, atributo, valor, tempo, modalidade, polaridade, proveniência exigida, binding e estado de verificação. Toda candidata e todas as relações relevantes precisam ser contabilizadas; itens não avaliados impedem selo de completude. O mapa de spans permite auditoria geométrica, sem provar completude semântica. O certificado proposto é de inspeção completa com escopo delimitado, nunca de verdade universal.

O [contrato conceitual de representação controlada](experiments/jev/guard/g2cb1/controlled-representation-contract.md) descreve slots de pedido, plano de claims, fontes e ressalvas por entidade/tempo/termo, formas lexicais restritas e manifesto fiel de cobertura. Nenhum schema novo foi implementado. A tradução de pedido livre para slots continua exigindo origem independente; metadados do próprio gerador não podem autoatestá-la. Prevenir omissão numa geração futura controlada é distinto de reconhecer a omissão em candidata livre já congelada.

## Casos e matriz de decisão

[Análise dos 36 controles](experiments/jev/guard/g2cb1/case-analysis.md) contém comparação específica GG04 × GG29/GMP-17, preservação de GG11/GG12, seis inconclusivos e todos os 14 críticos individualmente.

Em 04 e 29, pedido e contexto são iguais; diferença textual é diretamente verificável. Entender que a taxa foi perguntada, que sua fonte exige delimitação e que essa delimitação falta em toda a candidata é interpretação semântica. Bytes, regex específica e conhecimento do par não demonstram essa interpretação independentemente. Em 11 e 12, a limitação de quartos ausentes ou vagas UNKNOWN mantém parcialidade segura; não se pode impor caveat comercial universal. Uma solução que os bloqueie ou adie tem risco material de disponibilidade.

Nos controles 31–36, falta de bundle, conflito, alvo ausente/ambíguo, aplicabilidade e temporalidade desconhecidas não provam violação por si. Se inspeção completa e condições B0 forem verificadas sem violação independente demonstrada, D3 preserva INCONCLUSIVE. Se a representação não permite inspecionar, D2/D5 mantém HOLD, sem confundir as duas situações. Os críticos exigem prova material independente com bindings por entidade, tempo, atributo, fonte ou permissão. Não há certificação automática obtida para eles.

Quatro estados distinguem prova e limites de inspeção, sem mudar a matriz B0:

| Estado | Relação documental com B0 |
|---|---|
| VIOLATION_PROVEN | D1/REJECT somente com prova material válida independente da incerteza. |
| NO_VIOLATION_FOUND_WITH_COMPLETE_INSPECTION | Não significa inexistência universal; D3 ou D4 exigem todas as suas outras condições. |
| INSPECTION_INCOMPLETE | D2/HOLD, sem veredito. |
| UNKNOWN | D2/D5 conforme lacuna, sem preencher condição por conveniência. |

D0/STOP por integridade inválida permanece. Nenhuma ação de produto é autorizada por APPROVE. Não há REJECT por falta de prova nem APPROVE por falta de contradição.

## Critério de representação confiável

| Requisito | Caminho documental proposto | Evidência obtida no B1 |
|---|---|---|
| Obrigações sem oracle | H2 fase 1 ou intenção upstream confiável H3. | Procedimento proposto; certificação não demonstrada. |
| Claims sem oracle | Inspeção humana integral ou plano fechado com texto fiel. | Contrato, não inventário independente executado. |
| Claim→fonte | Pointer/hash, entidade, atributo, tempo, modalidade e proveniência. | Rastreabilidade exigida, bindings não certificados. |
| Caveat sem frase exata | Equivalência e escopo revisados; bloco controlado somente em domínio delimitado. | Reconhecimento não executado. |
| Completeness | Inventários, todos os spans/relações, resíduos, dupla revisão; domínio fechado poderia limitar saída. | Completude semântica livre permanece UNRESOLVED. |
| Preservar 04/11/12 | Permitir conhecido + limitação específica. | Requisito, sem false block medido. |
| Detectar 29 | Provar obrigação comercial e ausência após inspeção completa. | Relação ainda não certificada independentemente. |
| Preservar 31–36 | Não confundir insuficiência com prova de violação. | Matriz documental preservada, sem execução semântica. |
| Preservar 14 críticos | Prova independente localizada e material. | Controles e requisitos preservados, sem nova detecção. |
| Validação cega posterior | Custódia, pessoas não expostas, política anterior e registros selados. | Desenho proposto; viabilidade do cegamento ainda não demonstrada. |

Assim, não há desenho suficientemente demonstrado para GO. Propor um formulário auditável não prova que ele permita certificar completude. Os riscos e caminhos de contaminação estão no [threat model e failure modes](experiments/jev/guard/g2cb1/leakage-and-failure-modes.md), com limites residuais explícitos.

## Testes e mutantes realmente executados

Baseline histórico direcionado: **364 passaram, zero falhas, zero skipped**, nas cinco suítes G0, G2-A, G2-B0, G2-C-A e G2-C-B0. Não se afirma reexecução de toda a árvore nem experimento de provider.

B1: **39 testes documentais passaram, zero falhas, zero skipped**, sob bloqueio técnico de rede. Cobrem os 120 registros de perguntas, regras de independência, métricas não medidas, corpus referenciado, matriz B0, preservação e mutantes. [Resultados e comandos](experiments/jev/guard/g2cb1/tests.json).

**26 mutantes executados, 26 rejeitados, zero sobreviventes, zero PLANNED**, com baseline real válido antes das cópias mutadas. Incluem os 20 exigidos e seis restrições adicionais. [Lista](experiments/jev/guard/g2cb1/mutants.md) e [resultado real](experiments/jev/guard/g2cb1/mutation-report.json). São mutações de declarações documentais; não medem resistência de um extrator, detecção de omissão, cegamento humano ou guard real.

Não executados, por escopo: revisão humana, adjudicação real, validação cega, mecanismo semântico, provider, integração, build/lint/TypeScript/smoke do produto. Produto e fluxos críticos permaneceram sem alteração; não se declara que foram validados por estes testes. Nenhum smoke de produto é pré-condição para encerrar este desenho exclusivamente documental.

False block rate, false allow rate, accuracy, precision, recall, F1, ganho semântico, latência, custo operacional, melhora de provider e concordância humana: **`null / NOT_MEASURED`**. Contagens de testes/mutantes são medições documentais, sem equivalência com desempenho semântico.

## Preservação e deltas

[Preservação final](experiments/jev/guard/g2cb1/preservation.json): **551 arquivos históricos** conferidos byte a byte por hash, incluindo os 524 preservados no B0, seus 26 artefatos e relatório; **769 arquivos do produto** preservados; **17 inventários de namespaces** sem alterações. Corpus, oracle, fixtures, hashes, métricas, resultados, autorizações encerradas e freezes históricos permanecem intactos.

Somente novos artefatos neste namespace e este relatório; propagação por append na frente IA correspondente do arquivo existente, sem segunda Tabela Mestre, novo ID, Radar, CON-09 ou outras frentes. [Prova do prefixo](experiments/jev/guard/g2cb1/propagation-preservation.json). O prefixo anterior de 53.687 bytes conserva SHA-256 `fbac02da987ee5dbb005a437d6be19bc860e5507af08657f0772ceb8da062ea4`.

Delta documental: mapa 6×20; matrizes de observabilidade e H1–H5; contratos futuros; análises dos controles; threat model; asserções/testes/mutantes; proveniência ORACLE_ASSISTED_ONLY; preservação e classificação B1. Nenhuma alteração permanente de arquitetura do produto foi adotada, portanto PROJECT.md não recebeu changelog.

Links/referências, privacidade dos artefatos novos e whitespace foram conferidos em [document-checks.json](experiments/jev/guard/g2cb1/document-checks.json). O [freeze B1](experiments/jev/guard/g2cb1/freeze.json) permite verificar seus artefatos sem substituir nenhum freeze anterior. Ponto de rollback: remover somente os novos artefatos B1 e o sufixo append identificado; nunca restaurar ou apagar históricos preexistentes. Não houve commit, push ou merge.

## Decisão e encerramento

Foi demonstrado documentalmente onde os dados literais terminam, quais inferências faltam, quais fontes seriam admissíveis e quais contratos futuros poderiam ser auditados. Não foi demonstrada a confiabilidade operacional das seis famílias. Permanecem UNKNOWN a completude semântica efetiva, a execução humana independente, a viabilidade do cegamento neste corpus exposto, a distinção automática 04/11/12 × 29 e as taxas de erro/disponibilidade.

**HOLD.** GO exigiria origem independente e desenho cego suficientemente demonstrados, sem abrir provider automaticamente. STOP/F permanece alternativa válida se só houver deslocamento para outro LLM, falta de origem independente ou custo/complexidade desproporcional demonstrados. Nenhum desses custos foi inventado para forçar STOP ou continuidade.

Único próximo gate possível, se houver solicitação própria: **revisão independente da elegibilidade e do protocolo de observabilidade**. Apenas essa descrição, sem novo ID, sem execução iniciada e sem autorizar validação cega, provider ou implementação neste encerramento.

**Zero rede, JEV, OpenAI, modelos remotos, requests externas, APIs, créditos, secrets, credenciais e acesso à Production. Zero alteração em Angario/web/schema/RLS/UI/workers/endpoints/mensagens/Radar/prompts/geração/pipeline/banco. Nenhum guard, extrator, feature flag, shadow mode ou G3. STOP.**
