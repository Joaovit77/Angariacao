# JEV-S2-A — certificação offline do adapter/parser V2

Data: 16/10/2026, America/Sao_Paulo. Responsável: Codex.

**PASS JEV-S2-A, exclusivamente offline.** Adapter/parser, normalização, integração ao scorer e
formato de preservação parcial testados. **46 testes novos + 19 anteriores = 65 PASS, zero falhas.**
Zero rede, JEV, OpenAI, créditos, banco, Production, Radar ou WhatsApp. Nenhuma leitura de chave
ou arquivo de ambiente. O lote real de 180 chamadas não foi executado.

## Preservação verificada antes da escrita

Primeiro foram lidos pedido e contratos S0/S1 e executados os cinco testes S0 e 14 testes V2.
Todos passaram antes de criar arquivos deste checkpoint. Matriz materializada e requests
conferiram com os hashes exigidos; os 69 arquivos históricos S0 foram conferidos por hash.
Nenhuma divergência encontrada; não houve recálculo ou alteração de expectativa para acomodar código.

| Artefato | SHA-256 preservado |
| --- | --- |
| Matriz materializada V2 | `84fb8a7e1bf29a7549bf2cfe4c423fbbbf295fbeb1752459b7f164ffb172018c` |
| Requests preparados V2 | `fed25c670d8d06b0b793efe854d18168939d0cce77bf64868e1d570da7da7cf3` |
| Arquivo freeze S1 | `03baa866fbf1fb5fda8a065f8c6a0136c3f4679543306de8b678ed232acf2a60` |
| Novo adapter-freeze | `4eada006d631cebda9a71142e9b78e592252f472176e2584f4826848e3df4c75` |

S0 permanece: action 10/10, validation 9/10, false accept 0/5, false reject 1/5, protocol 8/10,
entity 8/10, temporal 6/10 e grounding 9/10. S1 mantém 30 entradas, 22 pares, 11 mutantes,
expectativas e plano congelados. O novo [adapter-freeze](experiments/jev/v2/adapter-freeze.json)
protege somente os arquivos novos e referencia o freeze anterior, sem sobrescrevê-lo.

## Adapter e formato normalizado

Antes: V2 preparava perguntas e comparava registros normalizados; faltava adapter do formato
Choice bruto. Depois: [adapter-v2.mjs](experiments/jev/v2/adapter-v2.mjs) recebe texto JSON ou
objeto de fixture e produz decisão/validação normalizada, sem transporte. Não importa o runner
real S0 e não usa oráculo para corrigir respostas.

Decision: action, intent, enough_context, relevant_current_facts, relevant_historical_facts,
missing_information, applicable_protocols, prohibited_assumptions, entity_resolution,
temporal_resolution e confidence. IDs selecionados vêm exclusivamente do catálogo de entrada.
Validation: verdict, onze dimensions, reasons e confidence. Confidence/distribuição de cada
pergunta são preservadas separadamente em question_observations.

Model_requested e model_observed são independentes; divergência fica explícita. Usage é parseado
separadamente: input_tokens/output_tokens, total_tokens somente quando fornecido, ou usage=null
com estado USAGE_MISSING. Ausência nunca vira zero. Usage inválido é estrutural, sem tokens
fabricados; modelo/usage válidos conhecidos permanecem preservados quando answers falham depois.

O [contrato do adapter](experiments/jev/v2/adapter-contract.md) descreve APIs e limites.

## Fail-closed, privacidade e razões

Enums exatos, sem trim, conversão de case, coerção, clamp ou valor favorável por default.
Campo obrigatório ausente, confidence inválida, resposta vazia, tarefa trocada, escolha desconhecida,
array/objeto inesperado e probabilidades inválidas → INVALID_RESPONSE/PARSE_ERROR, result=null.
JSON inválido e timeout não viram INCONCLUSIVE.

JSON textual detecta chave duplicada, inclusive com escape equivalente, antes da sobrescrita.
Limites locais: 2 MiB e profundidade 64. Campos extras de corpo, answer e usage são descartados
por allowlist; não há persistência de internal_reasoning, chain_of_thought, secret, debug, prompt,
raw_context ou dev_notes. Getters desconhecidos não são executados; getter obrigatório/proxy hostil
falha com código local, sem expor message externa ou stack. IDs extras no mapa answers são erro
de identidade de pergunta, não metadata a aceitar silenciosamente.

Fixtures privadas contêm somente as sentinelas falsas solicitadas. Testes confirmam ausência
delas em resultados, erros, ledger e snapshot. Nenhum dado pessoal real ou secret foi usado.

O V2 congelado não pede justificativa livre. Reasons são a projeção dos nomes de dimensões que
o JEV explicitamente marcou FAIL, conforme contrato S1; não são inferidas do verdict nem completadas
pelo oráculo. REJECT com todas as dimensões PASS permanece com reasons vazio. APPROVE com entity
FAIL preserva essa razão e a inconsistência. Isso permite medir reason_precision/recall sem espalhar
reprovação artificialmente. Razões livres extras são descartadas.

## Fixtures e regressão de formato real observado

[adapter-fixtures-v2.mjs](experiments/jev/v2/adapter-fixtures-v2.mjs) tem **18 fixtures nomeadas**:
VALID_DECISION_MINIMAL/FULL; VALID_VALIDATION_APPROVE/REJECT/INCONCLUSIVE; PARTIAL_VALID;
PARTIAL_INVALID_OMISSION; PARTIAL_INVALID_INVENTION; INVALID_ENUM; MISSING_REQUIRED;
UNKNOWN_FIELDS; INVALID_CONFIDENCE; INVALID_HISTORY_IDS; PII_EXTRA_FIELD; MALFORMED_RESPONSE;
OPERATIONAL_ERROR; USAGE_PRESENT/MISSING. Variações hostis adicionais são exercitadas nos testes.
As fixtures de saída foram especificadas manualmente, sem copiar expected da matriz.

Três responses S0 sanitizadas foram lidas diretamente, sem alteração: validação dos casos 02/03
e decisão do caso 10. Parser genérico confirma envelope, choices, distribuições, confidence,
modelo e usage observados. Adapter V2 completo recusa respostas S0 com perguntas antigas, evitando
confundir compatibilidade de envelope com completude do novo contrato. Não houve chamada nova.

## Integração offline ao scorer e hard gates

Pipeline testado: fixture bruta → parser → resultado normalizado → scorer S1 intacto.
Erro estrutural chega como result=null/error=null e conta em structural_errors; erro operacional
chega com error seguro/result=null e conta em operational_errors, fora dos denominadores semânticos.
Não executado não cria registro. Nenhuma mudança em scoring-v2.mjs foi necessária.

Histórico obrigatório omitido por NO continua omitido, com action correto mas recall/completude
incorretos. Seleção de ruído ou dado de B é preservada para julgamento semântico, sem filtragem
favorável pelo adapter. Catálogo duplicado ou resposta obrigatória ausente continua erro estrutural.

Hard gates testados com falsa aprovação estruturalmente válida de: protocolo inventado, taxa
inventada/fonte inválida, cross-entity, tempo material invertido, obrigação sem fonte e safety.
Adapter mantém APPROVE; scorer expõe cada false accept crítico. Adapter nunca “conserta” a saída.
As três classes de parcial e INCONCLUSIVE legítimo também entram no scorer, sem confundirem
qualidade semântica, falta de evidência e falha de parsing/transporte.

## Plano 180, tentativas e preservação parcial

[adapter-run-v2.mjs](experiments/jev/v2/adapter-run-v2.mjs) prepara um ledger **em memória**.
Valida 180 chaves case_id/task/repetition, hashes dos requests e ordem rotacionada por passagens,
com inícios V2-01, V2-11 e V2-21. Sem perda, duplicata, reordenação posterior ou seleção da melhor
saída. Métricas semânticas verificadas independentes da posição de registro no lote.

beginAttempt registra attempt_id prefixado pelo run_id e timestamp antes de aceitar resultado.
Não aceita ID reutilizado nem segunda tentativa enquanto outra está IN_PROGRESS. CompleteResponse
ou completeOperationalError finaliza uma única tentativa, sem sobrescrever anteriores. Erro
operacional tem enum fechado, identidade obtida do plano e metadados por allowlist; payload não pode
trocar case_id/task/repetition/attempt_id.

Estados de estágio: COMPLETED, FAILED_OPERATIONAL, NOT_STARTED, e extensões FAILED_STRUCTURAL/
IN_PROGRESS. Uma falha interrompe o ledger; divergência de modelo ou usage ausente também interrompe,
preservando resultado e consumo conhecido. Snapshot parcial mantém N−1 anteriores quando N falha,
não converte tentativa pendente em não iniciada e mantém auto_resume_authorized=false.
Retry/resume após HALTED ou repetição de resultado são recusados.

Os testes simulam somente estados/fixtures locais, não executam os 180 transportes planejados.
Não foi criado arquivo de execução real. PartialSnapshot apenas serializa o estado em memória;
persistência real e importação de snapshots externos ficam fora desta certificação.

## Testes e conferências

**46 testes novos PASS; 19 regressões anteriores PASS; 65 no total; zero falhas.** Executado:

```powershell
node --test experiments/jev/harness.test.mjs experiments/jev/v2/v2.test.mjs experiments/jev/v2/adapter-v2.test.mjs
```

Cobertura nova: decision/validation; enums e tipos hostis; obrigatórios; campos privados/extras;
getters/proxies; confidence 0/1/0,5 e inválidos; probabilidades; JSON duplicado/malformado/limites;
histórico e razões; parciais; inconclusão; usage/modelo; erros operacionais; scorer/hard gates;
180 IDs/rotação; snapshot parcial/tentativas; regressão S0 e freezes separados; ausência de
transporte/ambiente/logger nos módulos novos. Links locais e whitespace conferidos; diff rastreado
e staged vazios. Instruções e arquivos preexistentes preservados.

## Impacto, limitações e próximo gate

Impacto exclusivamente no namespace experimental e documentação. Produto/`web/`, provider, prompts,
UI, auth/RLS, WhatsApp, agenda, banco, schema/migrations, dependências, PROJECT e Radar intactos.
Nenhum ajuste visual. Testes do app, TypeScript, lint, build, UI/smoke do produto e integrações
externas não executados por escopo; não há mudança funcional a exigir smoke manual do produto.

A certificação é do contrato puro. Não valida JEV V2 real, autenticação, rede, controle de orçamento,
limite de contexto, exclusividade global de run_id, concorrência multiprocesso ou gravação atômica.
Futuro executor deve garantir run_id único, persistir IN_PROGRESS antes de transportar e preservar
snapshot durável. Objetos já parseados por JSON.parse não permitem recuperar duplicatas perdidas:
o transportador deverá fornecer texto bruto ao parser estrito. Ledger serializado é estado local
confiável produzido pelas funções; não é importador de snapshot externo arbitrário.

Arquivos criados: adapter-v2.mjs, adapter-run-v2.mjs, adapter-fixtures-v2.mjs,
adapter-v2.test.mjs, adapter-contract.md e adapter-freeze.json em `experiments/jev/v2/`, além deste
relatório. Único documento preexistente alterado: [propagação pendente](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md),
somente append. Nenhum arquivo congelado alterado. HEAD `366dc0f` preservado; sem commit, push,
merge, PR ou deploy.

**Próximo gate: JEV-S2-B somente após autorização humana explícita** para chamadas reais JEV,
modelo, teto financeiro e total máximo de chamadas, além da revisão do executor futuro e suas
garantias de persistência/limites. PASS S2-A não inicia S2-B. M1c-F permanece HOLD; Q1 não iniciado;
Production NÃO INTEGRADO. **STOP JEV-S2-A.**
