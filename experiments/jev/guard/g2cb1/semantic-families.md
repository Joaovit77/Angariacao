# Mapa das seis famílias semânticas

Fonte legível de [semantic-families.json](semantic-families.json): 120 respostas documentais, sem certificação operacional. SIM em possibilidade futura é condicional ao contrato e não prova execução. UNKNOWN não deve ser convertido em falso, REJECT ou APPROVE.

## requested_obligations

Inventário das unidades solicitadas, derivado do pedido/contexto antes de conhecer a candidata.

Estado atual: `NOT_DEMONSTRATED`; caminhos propostos: `HUMAN_REVIEW_ELIGIBLE` e `CONTROLLED_REPRESENTATION_ELIGIBLE`, sem demonstração fim a fim.

| Pergunta | Resposta | Fundamento e limite |
|---|---|---|
| 1. Pode ser derivado dos dados já estruturados? | NAO | Os campos literais existem, mas a família semântica completa não está representada nos36 inputs. |
| 2. Exige interpretação de linguagem natural? | SIM | Nos inputs livres atuais. H3 só eliminaria partes da interpretação em domínio fechado futuro. |
| 3. Exige comparar pergunta, contexto e candidata? | PARCIAL | PARCIAL: pergunta×contexto; não usar candidata para inventar ou reduzir obrigações. |
| 4. Exige materialidade? | SIM | SIM: necessidade/materialidade depende do pedido e policy geral, nunca do rótulo histórico. |
| 5. Exige equivalência semântica? | SIM | É necessário preservar significado, escopo e relações no texto livre; H3 não valida automaticamente paráfrase histórica. |
| 6. Exige provar ausência? | PARCIAL | PARCIAL: enumerar também obrigações possivelmente omitidas; falta de campo não é ausência de obrigação. |
| 7. Exige cobrir a candidata inteira? | NAO | NÃO: obrigações são fixadas antes de ver a candidata; sua satisfação será avaliada depois. |
| 8. Exige distinguir entidade? | SIM | Vincular à entidade selecionada ou registrar identidade não resolvida; quantidade igual não certifica vínculo. |
| 9. Exige distinguir tempo? | SIM | Distinguir tempo de pergunta, afirmação e fonte; declarar atemporal quando justificado, sem herdar tempo pelo número. |
| 10. Exige distinguir assunto ou termo comercial? | SIM | Assunto/atributo e termo comercial são específicos; estado global não cria obrigação por si. |
| 11. Pode ser certificado sem oracle? | CONDICIONAL | H2/H3 teriam origem independente e policy global comum, sem oracle/rationale/expected. Não há certificado independente produzido neste gate. |
| 12. Pode ser certificado sem o próprio provider? | CONDICIONAL | Revisores humanos independentes ou origem controlada poderiam prescindir do provider; nenhuma autoatestação é admissível. |
| 13. Pode ser certificado sem outro LLM? | CONDICIONAL | H2 e partes deH3 não exigem outro LLM. Não há demonstração empírica de confiabilidade desses processos aqui. |
| 14. Pode ser produzido por representação controlada? | PARCIAL | Pedido upstream explicitamente estruturado poderia fornecer slots; não resolve pedido originalmente livre. |
| 15. Pode ser produzido por revisão humana estruturada? | CONDICIONAL | Formulário, dupla revisão, evidências e adjudicação propostos; nenhuma pessoa executou revisão nesteB1, Codex não é revisor humano. |
| 16. Pode ser validado cegamente? | CONDICIONAL | Protocolo futuro com custódia de rótulos e controle de exposição; corpus conhecido não se torna cego por renomear IDs. Validação não iniciada. |
| 17. Pode ser reproduzido? | PARCIAL | Versões, hashes e spans permitem repetir procedimentos; concordância semântica entre revisores permaneceUNKNOWN/NOT_MEASURED. |
| 18. Pode ser auditado por terceiro? | CONDICIONAL | Terceiro poderia verificar referências, versões, cobertura, divergências e admissibilidade. Correção semântica não é garantida pelo registro. |
| 19. Pode distinguir GG29 das parciais seguras sem false block? | UNKNOWN | Há caminho proposto de interpretação/verificação, mas nenhum teste humano/automático independente foi executado; não afirmar detecção operacional deGG29. |
| 20. Qual o failure mode se estiver errado? | DESCRIPTIVE | Obrigação omitida permite GG29; obrigação espúria bloqueia04/11/12 ou dado não perguntado. |

## required_caveat

Obrigação contextual de delimitar lacuna, com estado REQUIRED/OPTIONAL/IRRELEVANT/UNKNOWN.

Estado atual: `NOT_DEMONSTRATED`; caminhos propostos: `HUMAN_REVIEW_ELIGIBLE` e `CONTROLLED_REPRESENTATION_ELIGIBLE`, sem demonstração fim a fim.

| Pergunta | Resposta | Fundamento e limite |
|---|---|---|
| 1. Pode ser derivado dos dados já estruturados? | NAO | Os campos literais existem, mas a família semântica completa não está representada nos36 inputs. |
| 2. Exige interpretação de linguagem natural? | SIM | Nos inputs livres atuais. H3 só eliminaria partes da interpretação em domínio fechado futuro. |
| 3. Exige comparar pergunta, contexto e candidata? | PARCIAL | PARCIAL: pedido×contexto×policy; a obrigação não depende de a candidata tê-la incluído. |
| 4. Exige materialidade? | SIM | SIM: ressalva deve ser necessária para obrigação específica, não UNCONFIRMED global. |
| 5. Exige equivalência semântica? | SIM | É necessário preservar significado, escopo e relações no texto livre; H3 não valida automaticamente paráfrase histórica. |
| 6. Exige provar ausência? | PARCIAL | PARCIAL: declarar ausência de ressalva requerida exige inventário de obrigações e escopo; flag ausente éUNKNOWN. |
| 7. Exige cobrir a candidata inteira? | NAO | NÃO para determinar se é requerida; SIM apenas na verificação posterior da candidata. |
| 8. Exige distinguir entidade? | SIM | Vincular à entidade selecionada ou registrar identidade não resolvida; quantidade igual não certifica vínculo. |
| 9. Exige distinguir tempo? | SIM | Distinguir tempo de pergunta, afirmação e fonte; declarar atemporal quando justificado, sem herdar tempo pelo número. |
| 10. Exige distinguir assunto ou termo comercial? | SIM | Assunto/atributo e termo comercial são específicos; estado global não cria obrigação por si. |
| 11. Pode ser certificado sem oracle? | CONDICIONAL | H2/H3 teriam origem independente e policy global comum, sem oracle/rationale/expected. Não há certificado independente produzido neste gate. |
| 12. Pode ser certificado sem o próprio provider? | CONDICIONAL | Revisores humanos independentes ou origem controlada poderiam prescindir do provider; nenhuma autoatestação é admissível. |
| 13. Pode ser certificado sem outro LLM? | CONDICIONAL | H2 e partes deH3 não exigem outro LLM. Não há demonstração empírica de confiabilidade desses processos aqui. |
| 14. Pode ser produzido por representação controlada? | PARCIAL | Slot de assunto e estado explícito poderia gerar dependência de caveat; materialidade e inventário do pedido continuam pressupostos. |
| 15. Pode ser produzido por revisão humana estruturada? | CONDICIONAL | Formulário, dupla revisão, evidências e adjudicação propostos; nenhuma pessoa executou revisão nesteB1, Codex não é revisor humano. |
| 16. Pode ser validado cegamente? | CONDICIONAL | Protocolo futuro com custódia de rótulos e controle de exposição; corpus conhecido não se torna cego por renomear IDs. Validação não iniciada. |
| 17. Pode ser reproduzido? | PARCIAL | Versões, hashes e spans permitem repetir procedimentos; concordância semântica entre revisores permaneceUNKNOWN/NOT_MEASURED. |
| 18. Pode ser auditado por terceiro? | CONDICIONAL | Terceiro poderia verificar referências, versões, cobertura, divergências e admissibilidade. Correção semântica não é garantida pelo registro. |
| 19. Pode distinguir GG29 das parciais seguras sem false block? | UNKNOWN | Há caminho proposto de interpretação/verificação, mas nenhum teste humano/automático independente foi executado; não afirmar detecção operacional deGG29. |
| 20. Qual o failure mode se estiver errado? | DESCRIPTIVE | Caveat irrelevante obrigatório cria false block; caveat essencial opcional permite omissão material. |

## required_caveat_present_or_missing

PRESENT_VERIFIED/MISSING_VERIFIED/UNKNOWN para uma ressalva com escopo já definido.

Estado atual: `NOT_DEMONSTRATED`; caminhos propostos: `HUMAN_REVIEW_ELIGIBLE` e `CONTROLLED_REPRESENTATION_ELIGIBLE`, sem demonstração fim a fim.

| Pergunta | Resposta | Fundamento e limite |
|---|---|---|
| 1. Pode ser derivado dos dados já estruturados? | NAO | Os campos literais existem, mas a família semântica completa não está representada nos36 inputs. |
| 2. Exige interpretação de linguagem natural? | SIM | Nos inputs livres atuais. H3 só eliminaria partes da interpretação em domínio fechado futuro. |
| 3. Exige comparar pergunta, contexto e candidata? | SIM | SIM: comparar candidata inteira com pedido, obrigação e fonte. |
| 4. Exige materialidade? | SIM | SIM: só testar cumprimento da ressalva realmente requerida; não qualquer frase de prudência. |
| 5. Exige equivalência semântica? | SIM | É necessário preservar significado, escopo e relações no texto livre; H3 não valida automaticamente paráfrase histórica. |
| 6. Exige provar ausência? | SIM | SIM: MISSING_VERIFIED requer inspeção integral, equivalência, polaridade, sujeito, entidade e termo; busca lexical é insuficiente. |
| 7. Exige cobrir a candidata inteira? | SIM | SIM: outra oração, negação ou atribuição pode alterar presença/ausência. |
| 8. Exige distinguir entidade? | SIM | Vincular à entidade selecionada ou registrar identidade não resolvida; quantidade igual não certifica vínculo. |
| 9. Exige distinguir tempo? | SIM | Distinguir tempo de pergunta, afirmação e fonte; declarar atemporal quando justificado, sem herdar tempo pelo número. |
| 10. Exige distinguir assunto ou termo comercial? | SIM | Assunto/atributo e termo comercial são específicos; estado global não cria obrigação por si. |
| 11. Pode ser certificado sem oracle? | CONDICIONAL | H2/H3 teriam origem independente e policy global comum, sem oracle/rationale/expected. Não há certificado independente produzido neste gate. |
| 12. Pode ser certificado sem o próprio provider? | CONDICIONAL | Revisores humanos independentes ou origem controlada poderiam prescindir do provider; nenhuma autoatestação é admissível. |
| 13. Pode ser certificado sem outro LLM? | CONDICIONAL | H2 e partes deH3 não exigem outro LLM. Não há demonstração empírica de confiabilidade desses processos aqui. |
| 14. Pode ser produzido por representação controlada? | PARCIAL | Em linguagem fechada renderizada, manifesto poderia provar emissão por obrigação; não certifica texto livre histórico. |
| 15. Pode ser produzido por revisão humana estruturada? | CONDICIONAL | Formulário, dupla revisão, evidências e adjudicação propostos; nenhuma pessoa executou revisão nesteB1, Codex não é revisor humano. |
| 16. Pode ser validado cegamente? | CONDICIONAL | Protocolo futuro com custódia de rótulos e controle de exposição; corpus conhecido não se torna cego por renomear IDs. Validação não iniciada. |
| 17. Pode ser reproduzido? | PARCIAL | Versões, hashes e spans permitem repetir procedimentos; concordância semântica entre revisores permaneceUNKNOWN/NOT_MEASURED. |
| 18. Pode ser auditado por terceiro? | CONDICIONAL | Terceiro poderia verificar referências, versões, cobertura, divergências e admissibilidade. Correção semântica não é garantida pelo registro. |
| 19. Pode distinguir GG29 das parciais seguras sem false block? | UNKNOWN | Há caminho proposto de interpretação/verificação, mas nenhum teste humano/automático independente foi executado; não afirmar detecção operacional deGG29. |
| 20. Qual o failure mode se estiver errado? | DESCRIPTIVE | Equivalência perdida rejeita paráfrase segura; negação ou sujeito errado aceito permite false allow. |

## candidate_assertions_and_bindings

Inventário de claims explícitos/implícitos materiais e seus vínculos fonte/entidade/tempo/atributo.

Estado atual: `NOT_DEMONSTRATED`; caminhos propostos: `HUMAN_REVIEW_ELIGIBLE` e `CONTROLLED_REPRESENTATION_ELIGIBLE`, sem demonstração fim a fim.

| Pergunta | Resposta | Fundamento e limite |
|---|---|---|
| 1. Pode ser derivado dos dados já estruturados? | NAO | Os campos literais existem, mas a família semântica completa não está representada nos36 inputs. |
| 2. Exige interpretação de linguagem natural? | SIM | Nos inputs livres atuais. H3 só eliminaria partes da interpretação em domínio fechado futuro. |
| 3. Exige comparar pergunta, contexto e candidata? | SIM | SIM: extrair da candidata e confrontar fontes; pedido delimita obrigações, não autoriza extras. |
| 4. Exige materialidade? | PARCIAL | PARCIAL: enumerar antes de descartar por materialidade; atribuir impacto exige contexto. |
| 5. Exige equivalência semântica? | SIM | É necessário preservar significado, escopo e relações no texto livre; H3 não valida automaticamente paráfrase histórica. |
| 6. Exige provar ausência? | PARCIAL | PARCIAL: cada claim precisa prova de vínculo; afirmar nenhum extra exige completude do inventário. |
| 7. Exige cobrir a candidata inteira? | SIM | SIM: afirmações extras, pressuposições e ações alegadas contam mesmo sem terem sido perguntadas. |
| 8. Exige distinguir entidade? | SIM | Vincular à entidade selecionada ou registrar identidade não resolvida; quantidade igual não certifica vínculo. |
| 9. Exige distinguir tempo? | SIM | Distinguir tempo de pergunta, afirmação e fonte; declarar atemporal quando justificado, sem herdar tempo pelo número. |
| 10. Exige distinguir assunto ou termo comercial? | SIM | Assunto/atributo e termo comercial são específicos; estado global não cria obrigação por si. |
| 11. Pode ser certificado sem oracle? | CONDICIONAL | H2/H3 teriam origem independente e policy global comum, sem oracle/rationale/expected. Não há certificado independente produzido neste gate. |
| 12. Pode ser certificado sem o próprio provider? | CONDICIONAL | Revisores humanos independentes ou origem controlada poderiam prescindir do provider; nenhuma autoatestação é admissível. |
| 13. Pode ser certificado sem outro LLM? | CONDICIONAL | H2 e partes deH3 não exigem outro LLM. Não há demonstração empírica de confiabilidade desses processos aqui. |
| 14. Pode ser produzido por representação controlada? | PARCIAL | Claims tipados antes do texto e renderização fechada poderiam preservar vínculos; sem converter candidatas históricas para esse formato. |
| 15. Pode ser produzido por revisão humana estruturada? | CONDICIONAL | Formulário, dupla revisão, evidências e adjudicação propostos; nenhuma pessoa executou revisão nesteB1, Codex não é revisor humano. |
| 16. Pode ser validado cegamente? | CONDICIONAL | Protocolo futuro com custódia de rótulos e controle de exposição; corpus conhecido não se torna cego por renomear IDs. Validação não iniciada. |
| 17. Pode ser reproduzido? | PARCIAL | Versões, hashes e spans permitem repetir procedimentos; concordância semântica entre revisores permaneceUNKNOWN/NOT_MEASURED. |
| 18. Pode ser auditado por terceiro? | CONDICIONAL | Terceiro poderia verificar referências, versões, cobertura, divergências e admissibilidade. Correção semântica não é garantida pelo registro. |
| 19. Pode distinguir GG29 das parciais seguras sem false block? | UNKNOWN | Há caminho proposto de interpretação/verificação, mas nenhum teste humano/automático independente foi executado; não afirmar detecção operacional deGG29. |
| 20. Qual o failure mode se estiver errado? | DESCRIPTIVE | Claim extra omitido permite falsa confirmação/ação; binding de B em A ou passado no presente cria false allow. |

## all_obligations_and_claims_checked

Certificado limitado de inspeção completa; não prova lógica de completude semântica universal.

Estado atual: `UNRESOLVED`; caminhos propostos: `HUMAN_REVIEW_ELIGIBLE` e `CONTROLLED_REPRESENTATION_ELIGIBLE`, sem demonstração fim a fim.

| Pergunta | Resposta | Fundamento e limite |
|---|---|---|
| 1. Pode ser derivado dos dados já estruturados? | NAO | Os campos literais existem, mas a família semântica completa não está representada nos36 inputs. |
| 2. Exige interpretação de linguagem natural? | SIM | Nos inputs livres atuais. H3 só eliminaria partes da interpretação em domínio fechado futuro. |
| 3. Exige comparar pergunta, contexto e candidata? | SIM | SIM: matriz integral obrigação×claim×fonte e todos os resíduos. |
| 4. Exige materialidade? | SIM | SIM: não esconder item ignorado como irrelevante sem justificativa. |
| 5. Exige equivalência semântica? | SIM | É necessário preservar significado, escopo e relações no texto livre; H3 não valida automaticamente paráfrase histórica. |
| 6. Exige provar ausência? | SIM | SIM: faltas de obrigação, claim e relação são o principal risco; cobertura de caracteres não basta. |
| 7. Exige cobrir a candidata inteira? | SIM | SIM: toda candidata e todo pedido, incluindo extras e trechos não avaliados. |
| 8. Exige distinguir entidade? | SIM | Vincular à entidade selecionada ou registrar identidade não resolvida; quantidade igual não certifica vínculo. |
| 9. Exige distinguir tempo? | SIM | Distinguir tempo de pergunta, afirmação e fonte; declarar atemporal quando justificado, sem herdar tempo pelo número. |
| 10. Exige distinguir assunto ou termo comercial? | SIM | Assunto/atributo e termo comercial são específicos; estado global não cria obrigação por si. |
| 11. Pode ser certificado sem oracle? | CONDICIONAL | H2/H3 teriam origem independente e policy global comum, sem oracle/rationale/expected. Não há certificado independente produzido neste gate. |
| 12. Pode ser certificado sem o próprio provider? | CONDICIONAL | Revisores humanos independentes ou origem controlada poderiam prescindir do provider; nenhuma autoatestação é admissível. |
| 13. Pode ser certificado sem outro LLM? | CONDICIONAL | H2 e partes deH3 não exigem outro LLM. Não há demonstração empírica de confiabilidade desses processos aqui. |
| 14. Pode ser produzido por representação controlada? | PARCIAL | Completude do manifesto renderizado pode ser demonstrável em domínio fechado; intenção original do usuário e semântica livre continuam lacunas. |
| 15. Pode ser produzido por revisão humana estruturada? | CONDICIONAL | Formulário, dupla revisão, evidências e adjudicação propostos; nenhuma pessoa executou revisão nesteB1, Codex não é revisor humano. |
| 16. Pode ser validado cegamente? | CONDICIONAL | Protocolo futuro com custódia de rótulos e controle de exposição; corpus conhecido não se torna cego por renomear IDs. Validação não iniciada. |
| 17. Pode ser reproduzido? | PARCIAL | Versões, hashes e spans permitem repetir procedimentos; concordância semântica entre revisores permaneceUNKNOWN/NOT_MEASURED. |
| 18. Pode ser auditado por terceiro? | CONDICIONAL | Terceiro poderia verificar referências, versões, cobertura, divergências e admissibilidade. Correção semântica não é garantida pelo registro. |
| 19. Pode distinguir GG29 das parciais seguras sem false block? | UNKNOWN | Há caminho proposto de interpretação/verificação, mas nenhum teste humano/automático independente foi executado; não afirmar detecção operacional deGG29. |
| 20. Qual o failure mode se estiver errado? | DESCRIPTIVE | Completeness falsa torna certificado parcial em autorização aparente; HOLD geral pode ocultar false block de disponibilidade. |

## no_independent_violation_proven

Separar VIOLATION_PROVEN, NO_VIOLATION_FOUND_WITH_COMPLETE_INSPECTION, INSPECTION_INCOMPLETE eUNKNOWN.

Estado atual: `UNRESOLVED`; caminhos propostos: `HUMAN_REVIEW_ELIGIBLE` e `CONTROLLED_REPRESENTATION_ELIGIBLE`, sem demonstração fim a fim.

| Pergunta | Resposta | Fundamento e limite |
|---|---|---|
| 1. Pode ser derivado dos dados já estruturados? | NAO | Os campos literais existem, mas a família semântica completa não está representada nos36 inputs. |
| 2. Exige interpretação de linguagem natural? | SIM | Nos inputs livres atuais. H3 só eliminaria partes da interpretação em domínio fechado futuro. |
| 3. Exige comparar pergunta, contexto e candidata? | SIM | SIM: claims, obrigações, contexto e policy; ausência de detecção não é ausência de violação. |
| 4. Exige materialidade? | SIM | SIM: precisa demonstrar violação e sua independência do eixo desconhecido, sem inventar materialidade histórica. |
| 5. Exige equivalência semântica? | SIM | É necessário preservar significado, escopo e relações no texto livre; H3 não valida automaticamente paráfrase histórica. |
| 6. Exige provar ausência? | SIM apenas como ausência encontrada no escopo inspecionado; não afirmar inexistência universal. | SIM apenas como ausência encontrada no escopo inspecionado; não afirmar inexistência universal. |
| 7. Exige cobrir a candidata inteira? | SIM | SIM antes de atestar ausência encontrada; prova positiva de violação pode ser local, válida e independente. |
| 8. Exige distinguir entidade? | SIM | Vincular à entidade selecionada ou registrar identidade não resolvida; quantidade igual não certifica vínculo. |
| 9. Exige distinguir tempo? | SIM | Distinguir tempo de pergunta, afirmação e fonte; declarar atemporal quando justificado, sem herdar tempo pelo número. |
| 10. Exige distinguir assunto ou termo comercial? | SIM | Assunto/atributo e termo comercial são específicos; estado global não cria obrigação por si. |
| 11. Pode ser certificado sem oracle? | CONDICIONAL | H2/H3 teriam origem independente e policy global comum, sem oracle/rationale/expected. Não há certificado independente produzido neste gate. |
| 12. Pode ser certificado sem o próprio provider? | CONDICIONAL | Revisores humanos independentes ou origem controlada poderiam prescindir do provider; nenhuma autoatestação é admissível. |
| 13. Pode ser certificado sem outro LLM? | CONDICIONAL | H2 e partes deH3 não exigem outro LLM. Não há demonstração empírica de confiabilidade desses processos aqui. |
| 14. Pode ser produzido por representação controlada? | PARCIAL | Regras enumeradas podem ser verificadas no domínio fechado; não prova ausência de toda violação em linguagem livre. |
| 15. Pode ser produzido por revisão humana estruturada? | CONDICIONAL | Formulário, dupla revisão, evidências e adjudicação propostos; nenhuma pessoa executou revisão nesteB1, Codex não é revisor humano. |
| 16. Pode ser validado cegamente? | CONDICIONAL | Protocolo futuro com custódia de rótulos e controle de exposição; corpus conhecido não se torna cego por renomear IDs. Validação não iniciada. |
| 17. Pode ser reproduzido? | PARCIAL | Versões, hashes e spans permitem repetir procedimentos; concordância semântica entre revisores permaneceUNKNOWN/NOT_MEASURED. |
| 18. Pode ser auditado por terceiro? | CONDICIONAL | Terceiro poderia verificar referências, versões, cobertura, divergências e admissibilidade. Correção semântica não é garantida pelo registro. |
| 19. Pode distinguir GG29 das parciais seguras sem false block? | UNKNOWN | Há caminho proposto de interpretação/verificação, mas nenhum teste humano/automático independente foi executado; não afirmar detecção operacional deGG29. |
| 20. Qual o failure mode se estiver errado? | DESCRIPTIVE | Não encontrei→não existe permite APPROVE indevido; prova incompleta→REJECT repete overreject31–36. |
