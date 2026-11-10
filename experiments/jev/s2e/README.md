# JEV-S2-E — diagnóstico semântico independente

Limites humanos exclusivos deste checkpoint: 12 chamadas reais ao jev-1.14.0, US$0,05 total, serial, sem retry/regeneração/resume. S2-B e S2-D não fornecem autorização, orçamento ou stages. Nenhuma integração de produto.

E1_TEMPORAL, E2_ENTITY e E3_PARTIAL_INVENTION são contextos inteiramente sintéticos novos. Cada um tem DECISION e VALIDATION, duas repetições de bytes idênticos por tarefa. As candidatas fixas ficam somente em VALIDATION. Expected, justificativas e critérios de avaliação nunca entram nos requests. Não se usa saída de R1 em R2. Ordem congelada: E1 D1/D2/V1/V2; E2 D1/D2/V1/V2; E3 D1/D2/V1/V2.

O mini-oráculo usa os mesmos enums e o preparador V2 congelado. E1 segue V2-08: fonte atual obrigatória; histórico superado opcional, preservado como histórico; CURRENT_FACT/SUPERSEDED_FACT/HISTORICAL_SUPPORT_OPTIONAL. E2 tem valor conhecido em A e B: factuality e transferência podem ser refutadas, sem reprovação artificial de tempo/segurança/protocolo. E3 preserva parcial permitida; percentual desconhecido é factuality INCONCLUSIVE, mas identidade de protocolo inventado prova falha de protocol/grounding/unsupported_assumption. A candidata não comunica o valor conhecido e mascara a lacuna: coverage/omission FAIL. As justificativas foram congeladas antes da rede, sem revisão orientada pelos resultados.

As seis requests e o oráculo completos são configurações locais sintéticas congeladas. No run, requests-freeze contém hashes/estrutura e oracle-mini-freeze contém expectativas, hashes e justificativas locais; não há texto bruto retornado pelo provedor. Raw transita somente em memória para parser estrito, wrapper S2-C e hash. A projeção por pergunta reutiliza o helper S2-D congelado. A normalização usa adapter V2 e verifica igualdade com seu wrapper, sem mudar parsed/probabilities. Identidade S2-E é anexada fora de parsed pelo plano local.

Scoring usa o scorer S1 congelado com dataset S2-E explícito e duas repetições, sem fundir denominadores históricos. Estrutural inválido não recebe resultado semântico. Apenas INVALID_PROBABILITIES classificado e seguro pode continuar. Erro operacional, modelo diferente, usage ausente/inválido, persistência insegura, desconhecido estrutural ou violação de preservação/privacidade encerra HOLD. False accept crítico sintético é registrado e não para por si só, conforme autorização.

Antes de HTTP: IN_PROGRESS durável, request hash, stage/attempt únicos e guard de custo. Cada envio reserva 65.536 tokens × US$0,042/Mtok = US$0,002752512; doze reservas = US$0,033030144, abaixo de US$0,05. Guard exige custo conhecido + reserva da próxima chamada <= teto. Usage ausente nunca vira zero. Preço precisa ser reconfirmado em documentação oficial antes da rede. A credencial autorizada é somente Angario_teste, sem impressão/persistência/alteração do arquivo local.

Qualidade é separada do PASS da execução. Critérios conservadores locais estão em quality_rules e no freeze, sem significar significância estatística. Decision incompleta não é compensada por action correta. Em validation todas as três candidatas exigem REJECT; false reject 0/0 permanece não aplicável. Não há controle de candidata parcial correta; partial_answer_allowed avalia permissibilidade do contexto, mesmo com candidata inventada. Histórico de E1 é opcional: recall obrigatório 0/0 não prova recuperação.

R1/R2: EXACT_MATCH exige mesmo resultado normalizado e mesma projeção de vetores/confidence; SEMANTIC_MATCH_WITH_CONFIDENCE_VARIATION preserva escolhas/campos/reasons, podendo variar confidence/probabilities; demais diferenças materiais recebem MATERIAL_DISAGREEMENT. Grupo incompleto permanece INCOMPLETE, sem fabricar concordância. Não há majority vote. Confidence e quartis são descritivos, nunca threshold operacional; a confidence principal de action/verdict não representa confiança na decisão completa.

Testes offline:

```powershell
node --test experiments/jev/s2e/runtime.test.mjs
```

O runner real tem flag explícita exclusiva e não é importado por testes. O lock S2-E é permanente para esta autorização e execution.lock impede reabertura do run. Crash pode deixar IN_PROGRESS e custo reservado: não há auto-resume/reenvio. Artefatos pós-stage passam por scan e hashes; dados privados externos desconhecidos são descartados ou IDs hashados.

Limites: três riscos sintéticos, seis validações negativas e seis decisões respondíveis. Não demonstram generalização, falsos rejects, benefício de provider swap ou prontidão de produção. S2-B permanece HOLD com causa histórica NÃO DETERMINADA / NÃO RECUPERÁVEL. Nenhum lote 180, S2-F, S3 ou integração inicia automaticamente.
