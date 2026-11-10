# Especificação de estados e prechecks propostos

| ID | Estado | Observabilidade | Fonte | Limite |
| --- | --- | --- | --- | --- |
| E01 | commercial_confirmation | DIRECT_STRUCTURED | /property_context/commercial_confirmation | Enum literal CONFIRMED/UNCONFIRMED/APPLICABILITY_UNKNOWN. Não prova que o assunto foi perguntado nem decide a candidata. |
| E02 | authority_conflicting | DIRECT_STRUCTURED | /guard_metadata/evidence_bundle_status | CONFLICTING_EQUAL_AUTHORITY é conflito declarado; não escolher primeira fonte. authority_resolved por afirmação exigiria canônico e vínculo verificados, ausentes como campo global. |
| E03 | entity_resolution | DIRECT_STRUCTURED | /guard_metadata/entity_resolution_status | RESOLVED/MISSING/AMBIGUOUS junto de selected_entity. Não resolver pelo mesmo número em A/B. |
| E04 | temporal_fact_labels | DIRECT_STRUCTURED | /property_context/current_facts | Preservar por fato CURRENT_FACT/UNKNOWN_CURRENT_STATE; presente/passado da afirmação e do pedido exigem vínculo semântico. |
| E05 | evidence_bundle_status | DIRECT_STRUCTURED | /guard_metadata/evidence_bundle_status | Preservar COMPLETE/INCOMPLETE/CONFLICTING_EQUAL_AUTHORITY/APPLICABILITY_UNDETERMINED/INCOMPLETE_TEMPORAL sem colapsar em booleano de verdade. |
| E06 | source_catalog_status | DIRECT_STRUCTURED | /guard_metadata/source_catalog_status | COMPLETE e NOT_PROVIDED são estados diferentes; array vazio não prova catálogo completo. |
| E07 | fact_value_state | DIRECT_STRUCTURED | /property_context/current_facts | Distinguir atributo value ausente, null, UNKNOWN e valor literal. Ausência de registro só pode ser relatada para chave identificada, dentro do catálogo declarado. |
| E08 | protocol_catalog | DIRECT_STRUCTURED | /available_protocols | Status/entidade/taxa/condição literais; modalidade faltante não escolhe protocolo aplicável. |
| E09 | facts_accessible | DIRECT_STRUCTURED | /property_context/accessible | false impede uso de fatos, mas verificar o que a candidata efetivamente usa exige leitura semântica. |
| E10 | publication_authorized | DIRECT_STRUCTURED | /property_context/operational_permissions/publication_authorized | Permissão literal não detecta sozinha a alegação de execução em texto. |
| A01 | requested_obligations | SEMANTIC_REVIEW_REQUIRED | /current_message | Slots/partes relevantes não estão estruturados. Pergunta livre não vira conjunto de obrigações por regex temática. |
| A02 | required_caveat | SEMANTIC_REVIEW_REQUIRED | /current_message + contexto | Requer vínculo da lacuna com obrigação perguntada e materialidade; global UNCONFIRMED é insuficiente. |
| A03 | required_caveat_present_or_missing | SEMANTIC_REVIEW_REQUIRED | /candidate_answer | Texto livre. Presença precisa equivalência e escopo; ausência precisa inspeção completa, não falta de metadado ou frase literal. |
| A04 | candidate_assertions_and_bindings | SEMANTIC_REVIEW_REQUIRED | /candidate_answer + fontes | Necessário alinhar cada afirmação a entidade, tempo, fato, protocolo e procedência. Não existe assertion AST no corpus. |
| A05 | all_obligations_and_claims_checked | SEMANTIC_REVIEW_REQUIRED | /candidate_answer + /current_message | Não pode receber TRUE por default ou por uma única afirmação correta. Extras materiais também contam. |
| A06 | no_independent_violation_proven | SEMANTIC_REVIEW_REQUIRED | candidata completa e fontes | Ausência de flag de erro não prova ausência de violação; revisão incompleta produz HOLD, não APPROVE. |

## Contrato de presença e ausência de ressalva

required_caveat_present e required_caveat_missing não são booleans deduzidos da falta de um campo. Seriam estados mutuamente exclusivos PRESENT_VERIFIED/MISSING_VERIFIED/UNKNOWN de uma obrigação específica, após inspeção completa e vinculada ao pedido. A ausência de annotation resulta UNKNOWN. Não há implementação dessa verificação.

commercial_term_confirmed/unconfirmed precisa de vínculo ao termo/entidade; o enum literal do contexto não significa que toda resposta trata de encargo. authority_conflicting pode vir do estado declarado do pacote; authority_resolved para uma afirmação requer fonte canônica e vínculo explícitos. entity_resolved não certifica que a candidata respeitou a entidade. temporal_validity_confirmed/unknown deve ser por fato/afirmação e pedido:GG07 pode relatar passado mesmo com valor atual null. evidence_package_complete/incomplete é declaração de escopo, não verdade de toda candidata.

## Conteúdo do certificado hipotético

Obrigação/afirmação identificada; assunto/entidade/tempo; fontes autorizadas referenciadas; estado com UNKNOWN explícito; cobertura de inspeção de texto; método e responsável de verificação; integridade do contexto e candidata. MISSING_VERIFIED exige prova negativa de cobertura, não busca de frase. A candidata/modelo não podem autoatribuir confiança de verificação.

Uma origem futura poderia ser revisão humana auditada ou um processo de representação/renderização controlada com equivalência verificável. Ambos exigem escopo novo. Um LLM preenchendo silenciosamente os mesmos campos apenas deslocaria o problema; confidence alta ou concordância de modelos não certificam presença/ausência.

## O que não está resolvido

A extração de slots do pedido, materialidade contextual, equivalência de ressalva, afirmações extras, negação, atribuição temporal e procedência continuam sem mecanismo demonstrado nesteB0. Riscos explícitos, sem esconder a inferência atrás de nomes booleanos. [Especificação JSON](precheck-specification.json).
