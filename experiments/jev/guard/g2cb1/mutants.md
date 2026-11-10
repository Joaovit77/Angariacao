# Mutantes documentais executados

Baseline real: PASS_DOCUMENTARY_CONSISTENCY_ONLY. 26 mutantes aplicados a cópias em memória e rejeitados pelas asserções; zero sobreviventes, zero PLANNED. Não alteraram fontes históricas. Isso prova consistência das regras declaradas, não prevenção operacional de leakage nem detecção semântica.

| ID | Violação documental introduzida | Baseline | Resultado real |
|---|---|---|---|
| M01 | Usar oracle como input | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M02 | Usar rationale como input | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M03 | Expected verdict gera obrigação | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M04 | Regex específica GG29 | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M05 | UNCONFIRMED global | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M06 | Anotação humana vira observação automática | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M07 | Não encontrado equivale a ausente | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M08 | Completeness sem enumerar claims | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M09 | Caveat missing sem inspeção completa | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M10 | Aceitar claim sem binding | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M11 | REJECT por falta de prova | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M12 | APPROVE por falta de contradição | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M13 | HOLD como acerto semântico | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M14 | Esconder false block em HOLD | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M15 | Outro LLM como determinístico | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M16 | Autoatestação do provider | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M17 | Reclassificar históricos | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M18 | Abrir autorização de chamadas | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M19 | Alterar prompt operacional | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M20 | Promover só por menor custo | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M21 | Codex se declara revisor humano | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M22 | Renderer certifica texto livre antigo | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M23 | Cobertura de caracteres prova completude semântica | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M24 | Alterar matriz B0 na referência | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M25 | Inventar métrica sem execução | PASS | REJECTED_DOCUMENTARY_MUTATION |
| M26 | Executar validação cega sem novo gate | PASS | REJECTED_DOCUMENTARY_MUTATION |

Registro: [mutation-report.json](mutation-report.json). O baseline é revalidado nos testes antes de cada cópia mutada. As seis sondas adicionais verificam papel de Codex, limite de renderização, completude, referência B0, métrica inventada e validação não autorizada.
