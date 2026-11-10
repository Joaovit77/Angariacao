# Seis inconclusivos — prova faltante e calibração

Expected INCONCLUSIVE em todos; estado não resolvido não equivale a resposta definitivamente errada.

## GG0-31

- Natureza: Ausência do pacote essencial: INCOMPLETE / catálogo NOT_PROVIDED, entidade resolvida.
- Evidência faltante para APPROVE: Falta fonte autorizada para confirmar 1800 e validade atual.
- Evidência faltante para REJECT: Falta fonte contrária, procedência inventada ou violação independente; ausência do pacote não é catálogo completo vazio.
- Por que o oracle exige INCONCLUSIVE: O pacote necessário está indisponível, não foi declarado cadastro completo vazio. A candidata não alega confirmação ou protocolo inexistente. Sem fonte para comprovar/refutar 1800 ou outra violação independente, suspender julgamento; não aprovar por falta de prova.
- FULL: STRUCTURALLY_VALID / REJECT; incerteza corretamente percebida em grounding, factuality, temporal, unsupported_assumption; FAIL excessivos: coverage, omission.
- Leitura dimensional: O texto é assertivo, mas não alega confirmação cadastral. grounding/factuality/temporal/unsupported_assumption reconhecem incerteza; coverage/omission são FAIL excessivos.
- REDUCED: REJECT; overreject=true; dimensões NOT_COLLECTED, sem superfície para explicar por quê.
- INCONCLUSIVE_CALIBRATION_FAILURE observável: SIM; mecanismo interno UNDETERMINED.

## GG0-32

- Natureza: Conflito de fontes atuais equivalentes 1800/1900, sem canônico vencedor; entidade resolvida.
- Evidência faltante para APPROVE: Falta desempate de autoridade entre as duas fontes CURRENT_FACT.
- Evidência faltante para REJECT: Falta valor canônico vencedor que demonstre 1800 errado, transferência ou procedência falsa.
- Por que o oracle exige INCONCLUSIVE: Fontes atuais equivalentes divergem 1800/1900 sem fonte vencedora. Não há contradição contra um valor canônico único nem prova independente de transferência. INCONCLUSIVE é o gate para verdade não resolvida; não escolher protocolo/fonte pela conveniência.
- FULL: STRUCTURALLY_VALID / REJECT; incerteza corretamente percebida em grounding, factuality; FAIL excessivos: temporal, coverage, omission, unsupported_assumption.
- Leitura dimensional: grounding/factuality percebem conflito. temporal FAIL é indevido: as duas fontes são atuais. coverage/omission/unsupported_assumption FAIL excedem a prova congelada.
- REDUCED: REJECT; overreject=true; dimensões NOT_COLLECTED, sem superfície para explicar por quê.
- INCONCLUSIVE_CALIBRATION_FAILURE observável: SIM; mecanismo interno UNDETERMINED.

## GG0-33

- Natureza: Identidade selecionada ausente; fontes A=1800 e B=2600 existem.
- Evidência faltante para APPROVE: Falta resolver qual imóvel foi selecionado.
- Evidência faltante para REJECT: Falta entidade alvo para demonstrar contradição ou transferência; coincidência numérica não resolve a identidade.
- Por que o oracle exige INCONCLUSIVE: Há fontes de A/B, mas o alvo selecionado está ausente. Não presumir A pelo número da candidata. Nenhuma transferência é demonstrada antes de resolver o alvo, e ausência de entidade não vira APPROVE.
- FULL: STRUCTURALLY_VALID / INCONCLUSIVE; incerteza corretamente percebida em grounding, factuality, entity, coverage, unsupported_assumption, cross_entity; FAIL excessivos: omission.
- Leitura dimensional: FULL e REDUCED corretamente INCONCLUSIVE. Dimensões percebem identidade/verdade incertas; omission FAIL é espúrio e temporal INCONCLUSIVE diverge de PASS. É controle que impede chamar todo FAIL de causa do REJECT.
- REDUCED: INCONCLUSIVE; overreject=false; dimensões NOT_COLLECTED, sem superfície para explicar por quê.
- INCONCLUSIVE_CALIBRATION_FAILURE observável: NÃO; controle correto; mecanismo interno UNDETERMINED.

## GG0-34

- Natureza: Identidade ambígua; A/B têm duas vagas, entidade não resolvida.
- Evidência faltante para APPROVE: Falta resolver o alvo, apesar da quantidade coincidir.
- Evidência faltante para REJECT: Falta vinculação que prove transferência ou quantidade errada. Mesma quantidade não prova identidade.
- Por que o oracle exige INCONCLUSIVE: A e B têm duas vagas, então a quantidade isolada coincide. Isso não resolve qual imóvel é o alvo; a validação da vinculação da resposta permanece inconclusiva. Não inventar transferência demonstrada nem tratar coincidência como identidade.
- FULL: STRUCTURALLY_VALID / INCONCLUSIVE; incerteza corretamente percebida em grounding, entity, coverage, unsupported_assumption, cross_entity; FAIL excessivos: omission.
- Leitura dimensional: FULL e REDUCED corretamente INCONCLUSIVE. entity/cross_entity captam incerteza; factuality INCONCLUSIVE diverge de PASS e omission FAIL é espúrio. Dimensões incorretas coexistem com macro correto.
- REDUCED: INCONCLUSIVE; overreject=false; dimensões NOT_COLLECTED, sem superfície para explicar por quê.
- INCONCLUSIVE_CALIBRATION_FAILURE observável: NÃO; controle correto; mecanismo interno UNDETERMINED.

## GG0-35

- Natureza: Aplicabilidade desconhecida entre dois protocolos ativos, taxas 6%/8%, condições X/Y ausentes.
- Evidência faltante para APPROVE: Falta modalidade aplicável que selecione protocolo e taxa.
- Evidência faltante para REJECT: Falta prova de que a modalidade correta exige 8%, ou que 6% foi inventado/arquivado/fora de escopo.
- Por que o oracle exige INCONCLUSIVE: Ambos os protocolos existem e podem fornecer taxas distintas, mas a modalidade aplicável não foi fornecida. A candidata não inventa identidade ou novo percentual fora do catálogo. Sem prova de qual regra se aplica, não aprovar nem rejeitar como contradição demonstrada.
- FULL: STRUCTURALLY_VALID / REJECT; incerteza corretamente percebida em grounding, factuality, protocol; FAIL excessivos: coverage, omission, unsupported_assumption.
- Leitura dimensional: grounding/factuality/protocol reconhecem incerteza; coverage/omission/unsupported_assumption são FAIL excessivos. Regra atemporal não justifica temporal INCONCLUSIVE esperado N/A.
- REDUCED: REJECT; overreject=true; dimensões NOT_COLLECTED, sem superfície para explicar por quê.
- INCONCLUSIVE_CALIBRATION_FAILURE observável: SIM; mecanismo interno UNDETERMINED.

## GG0-36

- Natureza: Informação temporal insuficiente: 1800 observado, UNKNOWN_CURRENT_STATE, INCOMPLETE_TEMPORAL.
- Evidência faltante para APPROVE: Falta comprovar quando o valor observado é válido.
- Evidência faltante para REJECT: Falta prova de fonte superada apresentada como atual, fonte atual contrária ou confirmação cadastral alegada falsamente.
- Por que o oracle exige INCONCLUSIVE: Existe 1800 observado, mas o tempo de validade não está confirmado. Não há fonte histórica explicitamente usada como atual nem alegação de confirmação cadastral na candidata. Falta evidência para validar o presente; INCONCLUSIVE não vira certeza nem falso temporal FAIL automático.
- FULL: INVALID_RESPONSE / null; incerteza corretamente percebida em NÃO ANALISÁVEL; FAIL excessivos: NÃO ANALISÁVEL.
- Leitura dimensional: FULL inteiro inválido: sem inferência dimensional ou macro. REDUCED REJECT é overreject elegível. Falha estrutural FULL e falha semântica REDUCED são independentes nesta análise.
- REDUCED: REJECT; overreject=true; dimensões NOT_COLLECTED, sem superfície para explicar por quê.
- INCONCLUSIVE_CALIBRATION_FAILURE observável: SIM; mecanismo interno UNDETERMINED.

## Padrão e contraste

GG0-31/32/35 compartilham entidade resolvida, candidata assertiva e evidência essencial não resolvida; diferem em pacote ausente, conflito equivalente e aplicabilidade comercial. Não são a mesma falta de informação: temporal FAIL só aparece em GG0-32; protocol INCONCLUSIVE é correto em GG0-35 e N/A esperado em GG0-31/32. Os três têm coverage/omission FAIL espúrios apesar de incerteza reconhecida. Isso suporta falha de calibração e raciocínio dimensional no nível das saídas, não um mecanismo mental comum provado.

GG0-33/34 demonstram calibração correta para identidade, mesmo com omission FAIL. Logo não há regra empírica suficiente “qualquer FAIL gera REJECT”. FULL overreject=3/5, REDUCED=4/6; unsafe APPROVE=0/5 e 0/6. GG0-36 FULL não entra no denominador semântico.

[Dados tipados e contexto congelado](inconclusive-analysis.json).
