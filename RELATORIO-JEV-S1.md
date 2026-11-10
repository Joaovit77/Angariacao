# JEV-S1 — oráculo V2 e matriz de robustez

Data: 16/10/2026, America/Sao_Paulo. Responsável: Codex.

**PASS JEV-S1 — oráculo V2 pronto para novo experimento isolado.** Este PASS significa preparação
offline verificada, não aprovação do modelo. **Zero chamadas JEV ou OpenAI neste checkpoint.**
Nenhuma chave/arquivo de ambiente lido, nenhum banco, Production, Radar ou WhatsApp acessado.

## Escopo e preservação

Antes: S0 tinha ação correta em 10/10, mas decisão incompleta, falsa rejeição parcial e dimensões
auxiliares sobrepostas. Depois: contrato independente V2, matriz com pares, preparador puro de
requests, scorer offline, plano de repetições/custo e freeze. Nenhum código do Angario foi alterado.

Lidos o [relatório S0](RELATORIO-JEV-S0.md), [README S0](experiments/jev/README.md), `cases.mjs`,
summary histórico, [contrato Q0](docs/IA_QUALIDADE_EVALS_CONTRATO.md),
[matriz Q0](IA_Q0_MATRIZ_CASOS.md), [relatório Q0](RELATORIO-IA-Q0-CONTRATO-LOCAL.md),
trechos pertinentes de PROJECT e política IA por ambiente. A skill de documentação técnica foi
aplicada à organização do contrato. Revisão independente significa confrontar expectativas com o
contrato de produto, sem usar a saída JEV como verdade; não houve segundo agente/modelo ou revisão
humana externa nesta tarefa. Essa revisão humana é o próximo gate recomendado.

Os **69 arquivos históricos S0** (código, documentação e resultados locais) tiveram hashes
capturados antes das mudanças V2 e conferidos nos testes. Não houve edição/reexecução/reclassificação
retroativa de S0. Seus números continuam: ação 10/10, validação 9/10, false accept 0/5,
false reject 1/5, protocol 8/10, entity 8/10, temporal 6/10 e grounding 9/10.

## Ambiguidades corrigidas

| Tema | Contrato V2 |
| --- | --- |
| S0-02 parcial válida rejeitada | Erro histórico preservado. Known + lacuna explícita continuam permitidos; controles PARTIAL_VALID, PARTIAL_INVALID_OMISSION e PARTIAL_INVALID_INVENTION |
| S0-06 substituição de taxa | Valor conhecido substituído omite o correto: grounding, factualidade, protocolo, cobertura e omissão podem falhar; tempo/entidade permanecem independentes |
| S0-07 temporalidade/falta de prova | Passado atribuído permitido, continuidade exige confirmação; valor atual desconhecido pode ter factuality INCONCLUSIVE sem neutralizar temporal FAIL comprovado |
| S0-08 transferência/invenção | Número de B atribuído a A → cross_entity FAIL; não prova valor falso em A nem criação do número do nada |
| S0-10 histórico | Action correto não compensa perda de mensagem necessária; seleção histórica tem métricas e IDs obrigatórios próprios |
| INCONCLUSIVE | Correto para fonte comercial ausente, fato com entidade ambígua e protocolos atuais conflitantes; atribuição a protocolo inexistente permanece REJECT |
| Confiança | Sem threshold operacional. Relação com acerto observada futuramente por tarefa; quartis apenas descritivos, sem impor confidence golden |

Separados `ACTION_CORRECTNESS` e `DECISION_COMPLETENESS`. A completude exige dez campos corretos:
action, intent, enough_context, fatos atuais, fatos históricos, lacunas, protocolos, suposições
proibidas, entidade e temporalidade. Calibration é eixo agregado independente; não entra como
valor arbitrário por caso. Validação separa verdict e onze dimensões, incluindo coverage/omission,
unsupported_assumption/cross_entity, safety e permissibilidade de resposta parcial.

## Matriz, pares e mutantes

**24 casos principais + cinco variantes adicionais de mutantes + um controle positivo de
continuidade = 30 entradas únicas.** A matriz principal respeita a faixa pequena sugerida; as seis
extensões são declaradas separadamente, sem inflar contagem por reutilização de pares.

- P1–P8: integral/parcial, parcial/invenção, histórico/superado, fonte A/B, protocolo presente/ausente,
  contexto suficiente/inacessível, antes/depois, cortesia/afirmação factual.
- P9–P11: omissão da parte conhecida, substituição de taxa e protocolo arquivado.
- Cinco pares da família longa: recente/antigo, mais ruído, atualização atual, entidade B e mídia/vazios.
- X1–X6: obrigação sem fonte, histórico conflitante, duplicata comercial, protocolo de B,
  protocolo inventado e confirmação atual explícita de fato antigo.

Total: **22 pares** verificados. P1 muda somente a pergunta, mantendo fontes e candidata; assim
o mesmo texto é integral para a dúvida inicial e parcial para a dúvida ampliada. Nos pares de
candidata, toda a solicitação fica igual. Nos arrays, testes verificam que só há reposicionamento,
ruído acrescido ou transformação de ruído, preservando mensagens com fatos.

**11 mutantes selecionados**, rastreados ao Q0: entidade, tempo, taxa, remoção de protocolo,
obrigação sem fonte, remoção de fato necessário, histórico conflitante, parcial transformada em
certeza, duplicata conflitante, protocolo de outra entidade e identidade de protocolo inventada.
Seis reutilizam casos da matriz; cinco acrescentam inputs. Adicionar histórico conflitante é
controle de resistência: a saída correta deve permanecer correta, não simplesmente rejeitar.

L1–L6 usam histórico integral sintético, com h-acesso obrigatório em L1/L2/L3/L4/L6 e proibido
em L5 por pertencer a B. Vagas antigas são explicitamente superadas pelo cadastro atual. X06
confirma que fato antigo pode coincidir com o atual mediante nova evidência. Nenhuma reconstrução
de LD-156; a janela das últimas 12 mensagens é um fator experimental, sem executar o seletor real.

Sete variantes de protocolos e quatro estados de entidade formalizados. O catálogo inclui
**14 candidatas APPROVE, 13 REJECT e três INCONCLUSIVE** previstos, antes de qualquer execução.
São expectativas, não resultados JEV. A matriz não contém pessoa, telefone, endereço ou dado real.

## Métricas e hard gates

Definidas em [metrics-v2.md](experiments/jev/v2/metrics-v2.md), com scorer reproduzível:

action_accuracy; decision_field_accuracy por campo/micro; decision_completeness;
validation_accuracy; false_accept_rate; false_reject_rate; inconclusive_accuracy;
history_selection_accuracy; history_required_recall; history_irrelevant_selection_rate;
protocol/entity/temporal/grounding/coverage_accuracy; reason_precision/recall;
consistency_between_repetitions e high_confidence_error_rate por tarefa.

Contagens de aplicabilidade, grupos incompletos, estágios ausentes, falhas operacionais/estruturais
e liberações indevidas de inconclusivos também são explícitas. Denominador vazio é null;
timeout não vira falsa rejeição. Não selecionar histórico required reduz recall mesmo com action
correto; selecionar required + ruído preserva recall e falha precisão/completude.

Hard gates do próximo experimento: qualquer APPROVE indevido com protocolo/taxa inventados,
entidade transferida, temporalidade material errada, fonte inválida ou segurança é vazamento
crítico. Bloqueia progressão daquele papel mesmo que a média seja alta. FALSE_REJECT afeta utilidade
e permanece erro, mas não compensa risco de FALSE_ACCEPT. Nenhum threshold de Production definido.

## Próximo lote e projeção de custo

Plano somente preparado: **30 entradas × três repetições × duas tarefas = 180 chamadas**.
Matriz principal isoladamente: 24 × 3 × 2 = 144; extensões: 36. Mesmos inputs/perguntas por
repetição, ordem rotacionada de dez posições e registrada. Sem escolher melhor resposta,
warm-up, retries ou regeneração; stop na primeira falha operacional, preservando parcial/HOLD.

Medir concordância pareada de action/verdict/razões e variância de confidence. Confiança correta,
errada, erro na faixa superior e acerto na inferior ficam separados. Faixas são quartis descritivos
com empates incluídos; não mudam aceitação ou convertem baixa confiança em inconclusão.
Três repetições são desenho exploratório próprio JEV solicitado, não alteração da proposta Q0 de
cinco repetições para eventual Q1, nem benchmark com poder estatístico presumido.

Preço usado exclusivamente do snapshot oficial já registrado no S0: **US$ 0,042/milhão de tokens
de entrada; saída gratuita**. Sem consulta à tabela/conta/API nesta tarefa. Projeções:

| Método | Valor projetado |
| --- | --- |
| Média S0, 3.636,05 tokens/chamada, 144 chamadas principais | US$ 0,02199 |
| Mesma média, lote completo de 180 | US$ 0,02749 |
| Proxy textual de um token por byte UTF-8 serializado, lote completo | US$ 0,11847 |
| Hipótese conservadora de 65.536 tokens de entrada por chamada, 180 chamadas | US$ 0,49545 |

Proposta de teto para revisão: **US$ 0,50, ainda não aprovado**. A média S0 não prediz tamanho
V2; o proxy de bytes não é tokenizer nem garantia de faturamento; o limite conservador depende de
manter contexto padrão e tarifa. Nenhuma fatura/câmbio/imposto ou custo real S1 existe.
Executor futuro deverá conferir contexto, modelo e consumo antes de cada chamada; não existe
transportador V2 neste checkpoint. Preço/configuração/autorização precisam ser reconfirmados no
gate da próxima rodada. Não reutilizar o runner S0 como se implementasse este contrato V2.

## Arquivos e congelamento

Novos, todos em namespace experimental, exceto este relatório solicitado:

- [oracle-v2.md](experiments/jev/v2/oracle-v2.md) — contrato e revisão das ambiguidades.
- [matrix-v2.mjs](experiments/jev/v2/matrix-v2.mjs) — 30 inputs, expectativas, 22 pares, 11 mutantes.
- [metrics-v2.md](experiments/jev/v2/metrics-v2.md) — fórmulas, denominadores e repetibilidade.
- [planned-run-v2.json](experiments/jev/v2/planned-run-v2.json) — 180 estágios planejados, orçamento não aprovado.
- [request-v2.mjs](experiments/jev/v2/request-v2.mjs) — allowlist pura, sem transporte ou ambiente.
- [scoring-v2.mjs](experiments/jev/v2/scoring-v2.mjs) — comparação offline de registros normalizados.
- [v2.test.mjs](experiments/jev/v2/v2.test.mjs) — verificação offline e regressão do S0.
- [freeze-v2.json](experiments/jev/v2/freeze-v2.json), [s0-preservation.json](experiments/jev/v2/s0-preservation.json)
  e [README](experiments/jev/v2/README.md) — hashes, preservação e instruções.

SHA-256 da matriz materializada:
`84fb8a7e1bf29a7549bf2cfe4c423fbbbf295fbeb1752459b7f164ffb172018c`.
SHA-256 dos requests preparados:
`fed25c670d8d06b0b793efe854d18168939d0cce77bf64868e1d570da7da7cf3`.
Hashes de expectativas, contratos, código e plano são verificados em cada teste. Freeze registra
a versão final antes de qualquer lote V2; nenhuma alteração baseada em novas respostas ocorreu.

## Validação, impacto e limitações

**14 testes V2 offline passaram**, cobrindo IDs/referências, expectativas completas, pares mínimos,
semântica de arrays, ausência de oráculo/candidata em decisão, padrões de PII/segredos, separação de
ação/completude, precisão/recall histórico, parcial/inconclusão/timeout, hard gates, confidence,
consistência/variância, registros inválidos/duplicados, hashes/contagens S0 e plano sem transporte.
**Cinco testes S0 offline também passaram**, sem importar o runner real. Links locais e whitespace
conferidos; diff rastreado e staged vazios; nenhum secret lido para testes.

Busca por padrões não certifica anonimização universal: a garantia principal é origem inteiramente
sintética e ausência de importação externa. Oráculo contém escolhas normativas para separar dimensões
correlacionadas; a revisão humana continua necessária antes do ensaio. A seleção de 30 inputs não
abrange todos os casos Q0. Scorer/preparador puro não validam contrato real de transporte ou capacidade
probabilística do JEV; adapter/parser de respostas V2 precisa de escopo futuro próprio.

Impacto limitado à preparação experimental e append documental de propagação. `web/`, produto,
fixtures existentes, provider, prompts, PROJECT, dependências, lockfile, testes comuns, banco,
migrations, Radar, Production e WhatsApp intactos. Nenhum ajuste visual. App/TypeScript/lint/build,
UI/smoke do produto e chamadas externas não executados por escopo; não há mudança funcional a exigir
smoke manual neste checkpoint. Revisão manual necessária: oráculo, pares, orçamento e plano antes
de autorizar execução real. S1 não entrega evidência de qualidade nova do JEV.

Único documento preexistente atualizado: [propagação pendente](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md),
por acréscimo, preservando registros anteriores e a frente documental concorrente. HEAD `366dc0f`
preservado como ponto de rollback; sem fetch, commit, push, merge, PR ou deploy.

## Próximo gate e STOP

Recomendado: revisão humana da V2 congelada e autorização explícita de um futuro JEV-S2 isolado,
com budget/modelo confirmados e adapter/parser testado sem rede antes de qualquer transporte.
Prioridade decisor/classificador; validador secundário continua hipótese. M1c-F permanece HOLD;
Q1 não iniciado; Production NÃO INTEGRADO. **STOP JEV-S1.**
