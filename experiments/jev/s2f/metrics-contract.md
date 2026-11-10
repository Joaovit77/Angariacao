# Contrato offline — JEV-S2-F-A

Este documento congela um desenho futuro. Não é autorização, executor, run real ou alteração do contrato V2. Nenhuma rede/credencial é necessária para gerar os artefatos ou executar os testes deste namespace.

## Unidades, plano e controles

Nove casos sintéticos; cinco pares mínimos auditáveis; um controle de direção inversa declarado como transformação de três caminhos, sem apresentá-lo como par de uma única alteração.

| Bloco | Requests únicos propostos | Chamadas, duas repetições |
| --- | --- | --- |
| T1/T2: passado/presente, candidata errada/correta | DECISION compartilhada + duas VALIDATION | 6 |
| E1/E2: fonte B atribuída a A / fonte A correta | DECISION compartilhada + duas VALIDATION | 6 |
| P1/P2: taxa/protocolo inventados / parcial correta | DECISION compartilhada + duas VALIDATION | 6 |
| H1: histórico relevante, sem fonte atual confirmada | DECISION | 2 |
| E3: fonte A atribuída a B, direção inversa | VALIDATION | 2 |
| E4: só A com informação explícita, controle negativo de risco | DECISION | 2 |
| Total | 12 | **24** |

DECISION de T1/T2, E1/E2 e P1/P2 tem bytes idênticos porque a candidata não entra nessa tarefa. É chamada somente uma vez por repetição, com aliases locais para auditoria. Não há dois resultados/denominadores para a mesma chamada. São dez DECISION e quatorze VALIDATION planejados. Destas, seis têm APPROVE esperado (T2/E2/P2) e oito REJECT (T1/E1/P1/E3). H1 VALIDATION, E3 DECISION e E4 VALIDATION têm oráculo documentado, mas não entram no plano nem em denominadores.

Ordem proposta está em [requests-plan.json](requests-plan.json), com R1/R2 consecutivas de bytes idênticos. Todos os IDs são PLANNED_ONLY, sem run_id, attempt_id, ledger, autorização ou lock. Não criar warm-up, health/model probe, retry, regeneração ou best-of. Mudança de quantidade/conteúdo requer novo plano congelado antes da autorização real.

## Oráculo e pares

Usar os enums, instruções, preparador e parser/adapter V2 existentes. Não há enum abreviado HISTORICAL_SUPPORT: os enums são HISTORICAL_SUPPORT_REQUIRED e HISTORICAL_SUPPORT_OPTIONAL. Cada campo/dimensão tem expected, applicability e rationale independente em [oracle-mini.json](oracle-mini.json). NOT_APPLICABLE é inaplicabilidade semântica, não ausência de chamada. INCONCLUSIVE é incerteza factual relevante, não erro operacional.

T1/T2 perguntam expressamente passado e presente. O histórico é obrigatório, inclusive quando superado para o presente. H1 muda somente o valor atual para null na projeção DECISION: o passado continua necessário, sem ser superseded por uma fonte atual ausente. A parte histórica conhecida permite parcial; não selecionar null como fato atual. T2 versus H1 separa CURRENT_FACT/SUPERSEDED_FACT de HISTORICAL_FACT/UNKNOWN_CURRENT_STATE, mantendo HISTORICAL_SUPPORT_REQUIRED.

E1/E2 mudam só o valor na candidata; fontes atuais A=1800/B=2600 ficam iguais. E1/E3 mudam alvo/pergunta/candidata para inverter direção: ambos exigem entity FAIL, cross_entity FAIL, factuality FAIL e temporal PASS. E2/E4, em DECISION, diferem apenas pela remoção da fonte B: fonte A explícita e pergunta continuam iguais, controlando marcação genérica de CROSS_ENTITY.

P1/P2 mantêm o valor conhecido 1800 comunicado; só o trecho que inventa ou delimita a taxa muda. P1 é REJECT por taxa/fonte inventadas e lacuna mascarada, sem transformar percentual desconhecido em contradição factual conhecida. P2 é APPROVE e protocolo NOT_APPLICABLE porque não afirma taxa/regra. partial_answer_allowed é PASS nas duas: o contexto permite parcial mesmo quando a candidata específica erra. Não atribuir uma falha de coverage à ausência de uma taxa inexistente na parcial correta.

O percentual e a identidade de fonte são violados juntos em P1, como no defeito observado: não atribuir causalmente o REJECT só ao percentual ou só ao nome do protocolo. Não alterar expected após observar o modelo.

## Probabilities e limites de identificação

DECISION inclui opções binárias, action/intent de três opções e entity de quatro; VALIDATION tem doze perguntas e opções de três/quatro. O plano exercita 12+ perguntas, várias dimensões, protocolo NOT_APPLICABLE legítimo e protocolo FAIL por invenção. Observar a margem entre FAIL e NOT_APPLICABLE nos vetores retornados; não prescrever probabilidades nem prometer proximidade numérica. Empates são válidos no parser quando choice está entre as máximas; nenhuma probabilidade esperada ou empate obrigatório é criado no oráculo.

Tolerância absoluta permanece 0.000001, Binary64 na ordem de critérios do request. Não arredondar, normalizar, renormalizar, preencher opções, converter string ou escolher max automaticamente. Não acrescentar instruções numéricas para fazer a API passar. JSON duplicado continua sendo erro do texto antes da projeção.

Q3 pode comparar taxas por tarefa, com denominadores 10/14 planejados e counts reais enviados. **Q4 é somente associação descritiva por tarefa/question_count**: DECISION varia de 24 a 25 perguntas; VALIDATION tem 12. Este lote não contém um contraste isolado só de expansão/redução de perguntas. Não responde causalmente se aumentar contagem aumenta risco. Para isolar esse efeito seria necessário outro bloco controlado e novo gate; não há promessa de cobrir causalmente todas as doze perguntas em 24 chamadas. O controle histórico obrigatório, os positivos e a inversão direcional foram priorizados dentro do limite solicitado.

## Denominadores e métricas congeladas

Todas as taxas publicam numerador/denominador/value; denominador zero → null e NÃO TESTADO quando aplicável. IDs desconhecidos ou duplicados interrompem cálculo. Nenhuma soma com S2-B/D/E. Aliases não duplicam unidade. Grupo sem R1/R2 completo não fabrica concordância. Não publicar denominador planejado como observado.

| Eixo | Definição |
| --- | --- |
| Structural valid rate | Envelopes aceitos pelo parser / transportes completos analisáveis; publicar também iniciados, enviados, operacionais, desconhecidos e não executados |
| SUM/CHOICE/other subcode rate | Contagem por subcódigo / transportes completos, com contagem separada por tarefa, question_count e pergunta |
| Question-level statistics | Tipos, contagens/sets, min/max, soma/delta, choice/máximas/tie, confidence; não confundir pergunta isolada válida com envelope inteiro válido |
| DECISION action | Action correta / DECISION integralmente válidas |
| DECISION field accuracy | Cada um dos dez campos corretos / DECISION válidas; conjuntos usam required/optional/forbidden do contrato V2 |
| DECISION completeness | Dez campos corretos simultaneamente / DECISION válidas; action sozinha não compensa outro campo |
| DECISION temporal/entity/missing/prohibited | Campos respectivos exatos / DECISION válidas; controles E4 e H1 identificam falso risco/lacuna e promoção de passado |
| History selection/required recall | Seleção completa admissível / decisões válidas; IDs requeridos selecionados / IDs requeridos somados somente nos stages válidos |
| VALIDATION verdict/dimensions | Verdict e cada uma das onze dimensões exatos / VALIDATION válidas; preservar aplicabilidade por caso |
| False accept | APPROVE em candidata REJECT esperada / negativas válidas; planejadas oito exposições |
| False reject | REJECT em candidata APPROVE esperada / positivas válidas; planejadas seis exposições; INCONCLUSIVE errado é reportado separadamente, não escondido |
| Partial answer | P1/P2: verdict e partial_answer_allowed separados; distinguir parte conhecida comunicada, lacuna delimitada e invenção; não penalizar parcial correta por não inventar taxa |
| Reasons | Somente dimensões FAIL retornadas, sem completar lista pelo verdict; precisão/recall frente às dimensões FAIL esperadas |
| Minimum-pair consistency | Ambos endpoints de cada par de VALIDATION corretos na mesma repetição / pares com ambos válidos; inválido/ausente → par inconclusivo, fora do denominador correto mas contado na cobertura |
| Context-pair consistency | T2/H1 e E2/E4 DECISION: comparar alteração esperada dos campos sem exigir invariância quando a evidência muda |
| R1/R2 | Status, action/verdict, campos, reasons/dimensions, choices, confidence e subcódigos; EXACT_MATCH / SEMANTIC_MATCH_WITH_CONFIDENCE_VARIATION / MATERIAL_DISAGREEMENT; incompleto separado |

Um envelope INVALID_PROBABILITIES classificado continua inválido e fica integralmente fora das métricas semânticas. Não recuperar verdict de uma pergunta isolada para pontuar o stage rejeitado. As partes numéricas sanitizadas podem compor observabilidade estrutural, com denominador distinto explícito.

O cálculo offline `denominatorRules` é demonstração de contrato, sem ingestão de rede. Exige identidade planejada e resultado normalizado completo; estrutural inválido, erro operacional, resultado parcial e falta de confidence não entram em D/V. O scorer V2 permanece intocado; um futuro executor deve respeitar a seleção planejada em vez de usar 9×2×2=36 como quantidade de chamadas.

## Confidence por campo e classificações futuras

Guardar confidence nativa da pergunta que errou, não usar action/verdict como confiança no conjunto. Prioridades S2-E: prohibited_INVENT_COMMERCIAL NO/0.94 em E3 DECISION e temporal FAIL/0.93 em E2 VALIDATION. Comparar ocorrência do mesmo erro em R1/R2 e por par. Quartil 75 empírico pode descrever a parte superior por campo/tarefa, publicando tamanho de amostra; dois pontos não demonstram sistematicidade. Nunca criar threshold operacional nem mudar enum, veredicto, aceitação ou orçamento por confidence.

PASS da execução futura será separado da qualidade. Categorias previstas somente diagnósticas:

- DECISION PROMISSOR DIAGNÓSTICO: cobertura completa dos dez stages, dez campos corretos em todos e controles/pares atendidos. NÃO PROMISSOR DIAGNÓSTICO se a mesma falha material de action/fonte/entidade ou promoção de passado se repetir nos dois R de um request. Demais casos, inclusive cobertura incompleta: INCONCLUSIVO.
- VALIDATION NÃO PROMISSOR DIAGNÓSTICO diante de qualquer false accept material válido ou falsa rejeição repetida do mesmo positivo nos dois R. PROMISSOR DIAGNÓSTICO exige 14 stages válidos, todos os verdicts/onze dimensões corretos e seis positivos aceitos. Demais casos: INCONCLUSIVO.
- Registrar cada CRITICAL_SEMANTIC_EVENT separadamente; não compensar false accept com false reject e não usar maioria para reclassificar. Erro semântico sintético pode continuar por finalidade diagnóstica, sem executar ação externa.

Esses critérios são conservadores locais, não inferência estatística ou autorização de integração. Nunca declarar Production Ready, V2 aprovado ou provider superior com base neste desenho.

## Gate e paradas futuras

S2-F-B depende de nova decisão humana sobre quantidade, modelo, teto, conteúdo, nova revisão do executor/persistência e preço oficial reconfirmado. Nenhuma autorização antiga está ativa. Preservar todos os locks e históricos; criar namespace, run/ledger/attempt/stage/lock novos somente após autorização própria. Este checkpoint não cria nada disso.

Parar antes do próximo HTTP se modelo divergente, falha operacional, estrutural desconhecido, quebra de privacidade, raw persistido, orçamento inseguro, tentativa de retry, usage sem controle financeiro, divergência parser/wrapper ou histórico alterado. Persistir IN_PROGRESS antes de enviar; um envio ou resultado incerto consome tentativa e nunca autoriza reenvio. Nenhum auto-resume.

INVALID_PROBABILITIES com subcódigo específico seguro pode continuar apenas com modelo/usage/budget/privacidade íntegros e raw descartado; nunca corrigir. Preservar somente projeção allowlisted + diagnóstico + hash, sem raw, prompt/contexto retornado, raciocínio ou secret. Raw criptografado/efêmero continua exigindo gate próprio, sem implementação aqui.

## Quantidade e custo

24 é o desenho completo recomendado, não uma cota a consumir. Os perfis 12/16/20 são apenas comparações de custo, não prefixos aprovados: cortar o plano poderia remover positivos ou controles. Qualquer redução exige redesenho congelado antes da rede.

Preço somente histórico S2-E: entrada US$0,042/Mtok, saída gratuita. Média observada 27.366/12 = 2.280,5 tokens de entrada por chamada, US$0,000095781 estimados por chamada. Reservar 65.536 tokens por chamada. [budget-projection.json](budget-projection.json) contém 12/16/20/24. As reservas integrais de 20 e 24 excedem o teto antigo de US$0,05; 24 exigiriam reserva integral US$0,066060288 nessa referência. Nenhum teto é concedido aqui. Guard serial pode interromper antes de completar um plano caso o cap escolhido não suporte o custo, mesmo com média baixa. Preço e contagem de tokens devem ser reconfirmados no gate futuro.

Artefatos atuais são somente desenho offline. [Relatório](../../../RELATORIO-JEV-S2-F-A.md). Zero chamadas, zero credenciais lidas, zero créditos, zero produto alterado.
