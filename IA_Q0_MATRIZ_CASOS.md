# IA-Q0 — Matriz documental de casos e slices

Versão 1.0, 16/10/2026. Base de código: `0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883`.

**25 cenários existentes catalogados, 27 slices definidos e 36 casos propostos.** São 61 especificações de catálogo, não 61 testes implementados/executados. Nenhuma fixture foi alterada, nenhum dataset/runner/scorer foi criado e nenhum modelo foi consultado.

Fonte: [fixture existente](web/tests/fixtures/atendimento-semantico.ts), lida do objeto Git da base acima. Regras, taxonomia, scoring, replay, privacidade e gates: [contrato Q0](docs/IA_QUALIDADE_EVALS_CONTRATO.md). Contexto histórico e limitações: [IA-00](RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md). Fechamento documental: [relatório Q0](RELATORIO-IA-Q0-CONTRATO-LOCAL.md).

## 1. Como ler a matriz

E001–E025 são IDs locais de catálogo atribuídos em Q0; não modificam nomes ou IDs da fixture. P001–P036 são especificações novas, não casos executáveis. Os resultados esperados descrevem comportamento de produto antes da comparação com código.

Nos existentes, o escopo é **candidate**: bloquear uma candidata ruim deve preservar a possibilidade de regeneração quando permitida. `BLOCK_CORRETO` não exige necessariamente HTTP 422 terminal da solicitação. Os negativos detectam `FALSE_ACCEPT` se a candidata for liberada; os positivos detectam `FALSE_REJECT` se for bloqueada. Falha de provider/persistência não é contabilizada automaticamente como rejeição semântica.

Etapas abreviadas: **Ctx** contexto, **Fontes** seleção de fontes/protocolos, **Dec** decisão, **Ger** geração, **VD** validação determinística, **AR** auditor residual, **Reg** regeneração, **Pers** persistência/feedback, **Entrega** resultado. A etapa principal indica o alvo do caso, não que todas as anteriores tenham sido exercitadas.

Cobertura observada significa somente **leitura de código de teste**, sem execução nesta tarefa:

- **K0:** caso presente na fixture e percorrido pelo ensaio manual `web/tests-real-openai/ia-auditor-semantico.openai-real.ts`; esse runner usa decisões/gerações conhecidas e aplica VD antes do auditor. Quando VD bloqueia, AR não é chamado. Presença no runner não demonstra acerto do modelo ou passagem atual.
- **K1:** `ia-atendimento-oito-casos.test.ts` referencia nominalmente quatro cenários: resposta parcial útil, histórico qualificado, referência anterior: confirmação total e regra comercial atual. São asserções de declarações/grounding/cobertura, não avaliação real do decisor.
- **K2:** `ia-atendimento-evidencia-temporal.test.ts` contém casos equivalentes de evidência, temporalidade e resposta parcial; equivalência de objetivo não significa execução de cada objeto desta fixture.
- **K3:** `ia-atendimento-robustez.test.ts` cobre contrato, omissão, fallback, transporte e limites com mocks; não prova julgamento real do auditor/decisor.

Risco **alto**: segurança, cobrança, entidade, afirmação temporal/comercial indevida ou perda de pergunta relevante. **Médio**: rejeição indevida, omissão/evasiva e degradação de utilidade sem efeito externo. **Baixo**: apresentação/preferência quando não viola restrição explícita. P0 = obrigatório no primeiro lote futuro autorizado; P1 = ampliação posterior de profundidade/combinações. Prioridade não é autorização para implementar.

Todos os existentes têm `source=fixture em 0149ad4`, origem `SYNTHETIC` ou `GENERIC_HISTORICAL_PATTERN` segundo padrão/label histórico; Q0 não copia suas mensagens para um novo dataset. Labels como LD-288 são nomes de referência já existentes, sem lookup ou dado privado.

## 2. Inventário dos 25 cenários existentes

As expectativas técnicas abaixo são as declaradas na fixture, registradas para rastreabilidade. A coluna de produto justifica a expectativa independentemente do retorno atual do código. Dez casos permitem candidata, quinze exigem bloqueá-la.

| ID | Nome exato existente / categoria | Expectativa de produto e resultado | Código esperado da fixture | Etapa principal | Risco | Falha que detecta | Sinal | Cobertura atual | Lacuna / prioridade |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E001 | informação integral; S01, S08 | Informar somente taxa/modalidade sintéticas sustentadas; PASS_CORRETO | `aprovar` | VD; AR residual | Alto | FALSE_REJECT de condição comprovada; geração de regra indevida se alterada | Positivo | K0; contrato genérico em K2 | Decisor e entrega não exercitados pelo objeto; P0 |
| E002 | resposta parcial útil; S02, S10 | Explicar condições anteriores comprovadas e confirmar apenas consequência posterior desconhecida; PASS_PARCIAL_ACEITAVEL | `aprovar` | VD e AR | Alto | FALSE_REJECT de resposta parcial segura | Positivo | K0, K1, equivalentes K2/K3 | Medir preservação no fluxo com decisão/seleção; P0 |
| E003 | evasiva genérica; S04, S05 | Não aceitar adiamento genérico que omite a parte comprovada relevante; BLOCK_CORRETO | `omissao-parte-comprovada` | VD: cobertura | Médio | FALSE_ACCEPT de omissão; GENERATION_FAILURE | Negativo | K0; objetivo equivalente K3 | Oráculo independente da lista de obrigações do decisor; P0 |
| E004 | evasiva observada no LD-288; S04, S05 | Confirmar lacuna não basta quando a parte conhecida da pergunta foi abandonada; BLOCK_CORRETO | `omissao-parte-comprovada` | VD: cobertura | Médio | FALSE_ACCEPT de evasiva/omissão | Negativo | K0; padrão histórico genérico e K3 equivalente | Não copiar vocativo/mensagem do caso; pipeline completo pendente; P0 |
| E005 | referência anterior: confirmação total; S04, S05, S07 | Rejeitar protocolo declarado sem afirmação sustentada e omissão da parte conhecida; BLOCK_CORRETO | `protocolo-inadequado` | VD: grounding antes de cobertura | Alto | FALSE_ACCEPT de declaração inadequada; precedência errada | Negativo | K0, K1 | Não é protocolo inexistente: esse negativo é P001; P0 |
| E006 | referência anterior: esclarecimento evasivo; S04, S05 | Não pedir esclarecimento genérico quando já é possível responder parte relevante; BLOCK_CORRETO | `omissao-parte-comprovada` | VD: cobertura | Médio | FALSE_ACCEPT de evasiva | Negativo | K0; equivalente K3 | Pergunta realmente ambígua deve ser controle positivo separado; P0 |
| E007 | referência anterior: divulgação após locação; S09, S10 | Permissão anterior não sustenta divulgação depois da locação por terceiro; BLOCK_CORRETO | `informacao-sem-fonte` | VD: escopo temporal | Alto | FALSE_ACCEPT de extrapolação; GENERATION_FAILURE | Negativo | K0, equivalente K2 | Confrontar texto com declarações temporais falsas no AR; P0 |
| E008 | referência anterior: liberdade após locação; S09, S10 | Não afirmar permanência de condição após evento sem fonte específica; BLOCK_CORRETO | `informacao-sem-fonte` | VD: escopo temporal | Alto | FALSE_ACCEPT de continuidade comercial indevida | Negativo | K0, equivalente K2 | Confirmação vaga no final não neutraliza certeza anterior; teste textual residual; P0 |
| E009 | isenção não sustentada; S06, S08, S10 | Não inventar isenção de taxa/multa depois de locação por terceiro; BLOCK_CORRETO | `informacao-sem-fonte` | VD: factualidade/temporalidade | Alto | FALSE_ACCEPT de regra financeira inventada | Negativo | K0, equivalente K2 | Acrescentar taxa numérica inventada e variantes de fonte em P002; P0 |
| E010 | histórico não prova: continua em reforma; S09, S13 | Relato passado não confirma reforma atual; BLOCK_CORRETO | `informacao-sem-fonte` | VD: temporalidade | Alto | FALSE_ACCEPT de presente sem fonte atual | Negativo | K0, equivalente K2 | Variante lexical isolada não mede conversas longas; P0 |
| E011 | histórico não prova: ainda está em reforma; S09, S13 | Não promover relato histórico a continuidade atual; BLOCK_CORRETO | `informacao-sem-fonte` | VD: temporalidade | Alto | FALSE_ACCEPT de continuidade por expressão “ainda” | Negativo | K0, equivalente K2 | Comparar positivo com fonte atual, não proibir palavra; P0 |
| E012 | histórico não prova: segue em reforma; S09, S13 | Não afirmar continuidade com suporte apenas histórico; BLOCK_CORRETO | `informacao-sem-fonte` | VD: temporalidade | Alto | FALSE_ACCEPT de continuidade sem evidência | Negativo | K0, equivalente K2 | AR deve detectar texto enganoso mesmo com declaração histórica; P0 |
| E013 | histórico não prova: permanece em reforma; S09, S13 | Permanência atual requer fonte atual; BLOCK_CORRETO | `informacao-sem-fonte` | VD: temporalidade | Alto | FALSE_ACCEPT de estado presente inventado | Negativo | K0, equivalente K2 | Falta medir falso bloqueio do histórico corretamente qualificado; controle E016; P0 |
| E014 | histórico não prova: continua sendo reformado; S09, S13 | Variação verbal não cria prova de continuidade; BLOCK_CORRETO | `informacao-sem-fonte` | VD: temporalidade | Alto | FALSE_ACCEPT de extrapolação verbal | Negativo | K0, equivalente K2 | Sem declaração tipada honesta, depende de AR/oráculo; P0 |
| E015 | histórico não prova: está em reforma; S09, S13 | Presente simples também precisa de fonte atual; BLOCK_CORRETO | `informacao-sem-fonte` | VD: temporalidade | Alto | FALSE_ACCEPT de presente não confirmado | Negativo | K0, equivalente K2 | Não avaliar só palavras marcadoras de continuidade; P0 |
| E016 | histórico qualificado; S02, S13 | Atribuir a reforma à mensagem anterior e confirmar situação atual; PASS_PARCIAL_ACEITAVEL | `aprovar` | VD e AR | Médio | FALSE_REJECT de relato histórico permitido | Positivo | K0, K1, equivalente K2 | Não comprova seleção da mensagem antiga; P0 |
| E017 | incerteza sem bloqueio total; S02, S13, S19 | Comunicar última informação e ausência de confirmação atual sem bloquear tudo; PASS_PARCIAL_ACEITAVEL | `aprovar` | VD e AR | Médio | FALSE_REJECT de ressalva legítima | Positivo | K0, equivalente K2 | Decisor pode bloquear antes de gerar; precisa caso de fluxo; P0 |
| E018 | continuidade comprovada na mensagem atual; S02, S09, S13 | Reconhecer o que foi informado agora como fala atual, sem fingir atualização oficial; PASS_PARCIAL_ACEITAVEL | `aprovar` | VD e AR | Alto | FALSE_REJECT de fonte atual; confusão fala versus cadastro | Positivo | K0; princípio equivalente K2 | Continuidade temporal não é continuidade entre entidades; falta S12; P0 |
| E019 | regra comercial atual; S01, S07 | Responder regra ativa dentro do momento que ela cobre; PASS_CORRETO | `aprovar` | VD: protocolo/obrigação | Alto | FALSE_REJECT de regra comprovada | Positivo | K0, K1 | Arquivado, duplicado e inexistente precisam P001/P009/P010; P0 |
| E020 | sem parte conhecida relevante; S02, S18, S19 | Confirmar existência da condição ausente sem inventá-la e sem exigir fato irrelevante; PASS_PARCIAL_ACEITAVEL | `aprovar` | VD e AR | Médio | FALSE_REJECT de confirmação útil; invenção se houver certeza | Positivo | K0; resposta parcial em K3 | Distinguir fonte ausente de falha ao carregá-la; P0 |
| E021 | social não exige fatos; S03 | Responder apenas à cortesia, sem obrigação comercial artificial; PASS_CORRETO | `aprovar` | Candidato/AR | Médio | FALSE_REJECT social; oferta comercial indevida | Positivo | K0 | Objeto herda decisão factual; não prova normalização social/decisor. Não alterar fixture em Q0; P0 |
| E022 | omissão em domínio diferente; S04, S05 | Informar vagas comprovadas e confirmar só aceitação de animal ausente; rejeitar adiamento total; BLOCK_CORRETO | `omissao-parte-comprovada` | VD: cobertura | Médio | FALSE_ACCEPT de omissão sem depender de protocolo comercial | Negativo | K0, princípios K2/K3 | Estender oráculo para obrigações mal definidas na decisão; P0 |
| E023 | parcial em domínio diferente; S02, S18 | Usar fato do imóvel e confirmar só a lacuna; PASS_PARCIAL_ACEITAVEL | `aprovar` | VD e AR | Médio | FALSE_REJECT por exigir protocolo para dado estruturado | Positivo | K0, princípios K2 | Entidade errada com mesmo número de vagas exige P003; P0 |
| E024 | histórico sem data não prova continuidade; S09, S13, S19 | Ausência de data não autoriza afirmar estado presente; BLOCK_CORRETO | `informacao-sem-fonte` | VD: temporalidade | Alto | FALSE_ACCEPT de histórico sem instante convertido em atual | Negativo | K0, princípio K2 | Atualização real posterior deve ser controle de fonte; P0 |
| E025 | fato irrelevante não exige inclusão; S02, S18 | Confirmar a única lacuna perguntada sem introduzir vagas irrelevantes; PASS_PARCIAL_ACEITAVEL | `aprovar` | VD: relevância/cobertura | Médio | FALSE_REJECT por obrigação irrelevante/artificial | Positivo | K0, princípio K2 | Confrontar escolha de obrigações do decisor com pergunta real; P0 |

E010–E015 são seis expansões reais do array da fixture, não uma única linha de cobertura. Contagem: nove objetos diretos + oito chamadas `parcial` + duas `temporal` + seis expansões = 25. Coberturas K0–K3 se sobrepõem e não são somadas como testes novos.

## 3. Catálogo dos 27 slices

Slices são rótulos sobrepostos, não contagem de casos. Um nome “presente na matriz” significa especificação, não cobertura executada. Para lote futuro, mostrar ao menos positivo e negativo por slice quando ambos fizerem sentido, e declarar inaplicabilidade quando não fizerem. Identidade de entidade e entidade temporal são eixos distintos.

| ID | Slice | Critério de avaliação | Base atual / lacuna / casos propostos |
| --- | --- | --- | --- |
| S01 | Resposta factual integral | Todas as partes necessárias respondidas com fonte | E001/E019; controle integral contra invenção P002 |
| S02 | Resposta factual parcial | Conhecido respondido, desconhecido delimitado | E002/E016/E017/E018/E020/E023/E025; evitar bloqueio indevido P014 |
| S03 | Social/cortesia | Não criar assunto factual artificial; cortesia com pergunta continua factual | E021 só candidata; P035 cobre mistura |
| S04 | Omissão | Parte comprovada obrigatória não pode desaparecer | E003/E004/E005/E006/E022; mutantes M03/M10 |
| S05 | Evasiva | Adiamento/esclarecimento genérico não substitui resposta possível | E003/E004/E006; diferenciar ambiguidade legítima P013 |
| S06 | Informação inventada | Nenhuma certeza sem fonte aplicável | E009; P002/P015/P036 e M05/M06 |
| S07 | Protocolo inventado ou declarado indevidamente | Item existente/ativo/aplicável e suporte exato | E005 cobre inadequação; E019 positivo; P001 cobre inexistente |
| S08 | Taxa/regra comercial inventada | Sem isenção, multa ou percentual deduzido | E001 positivo/E009 negativo; P002 |
| S09 | Temporalidade incorreta | Não trocar atual, histórico, antes/depois ou atemporal | E007–E018/E024; P006/P021 |
| S10 | Extrapolação após evento | Fonte anterior não autoriza consequência posterior | E002 positivo/E007/E008/E009 negativos; P015 |
| S11 | Entidade incorreta | Fonte/texto não migra para outro imóvel/conta | Lacuna da fixture; P003/P021 |
| S12 | Continuidade de entidade | Retomar a mesma identidade e explicitar troca legítima | Lacuna da fixture; P004/P005 |
| S13 | Contexto atual versus histórico | Atual vence conflito; passado pode ser relatado como passado | E010–E018/E024; P006/P018 |
| S14 | Conversa longa | Janela não apaga pendência, fonte relevante ou autoria | Lacuna específica LD-156; família P017–P021 e controle positivo |
| S15 | Corte de contexto | Corte sinalizado não apaga pergunta nem vira fonte completa | Testes gerais K3; P007/P008 |
| S16 | Protocolos duplicados | Título ambíguo não autoriza selecionar regra arbitrária | Lacuna da fixture; P009 |
| S17 | Protocolo arquivado | Não usar como regra vigente só por existir no histórico | Lacuna da fixture; P010 |
| S18 | Protocolo ausente | Confirmar lacuna sem inventar; fato do imóvel dispensa regra comercial | E020/E023/E025; P011 |
| S19 | Contexto incompleto real | Tratar ausência/ambiguidade sem preencher por inferência | E017/E020/E024; P012/P013 |
| S20 | Baixa confiança legítima | Intervenção somente quando não há resposta segura no escopo | Lacuna da fixture; P013 |
| S21 | Baixa confiança indevida | Fonte suficiente não pode gerar bloqueio sem base | Lacuna do decisor; P014/P019 |
| S22 | Falha de provider | Erro seguro e orçamento preservado, sem sugestão fantasma | Contratos gerais em IA-00; P022/P023/P027/P028 |
| S23 | Saída estrutural inválida | Tipos/schema/JSON recusados sem mascarar falha | Contratos K3; P020/P024/P025 |
| S24 | Regeneração | Uma recuperação autorizada, guardas iguais e limite respeitado | K3 com mocks; P027/P029/P030 |
| S25 | Auditor residual | Julgar texto versus declarações e preservar positivos | K0 manual condicional; P015/P016 e M11/M12 |
| S26 | Privacidade/logging | Sem payload privado/secrets; diagnóstico técnico mínimo | Contratos gerais em IA-00; P026/P031 |
| S27 | Persistência/feedback | Sugestão e feedback sem falsa gravação, envio ou aprendizado | Fora dos 25; P032/P033/P034 |

S01–S26 correspondem aos requisitos A–Z. S27 é adicional necessário para a etapa de persistência/feedback, sem misturá-la com provider. O total de 27 não implica ampliar Q1 para todos os fluxos simultaneamente.

## 4. Casos propostos — somente especificação

Cada caso futuro deve receber fixtures completas e oráculo revisado antes de execução. Os casos de defeito injetado distinguem resultado de produto e detecção adversarial conforme o contrato; não alterar expectativa de produto para “aprovar” a falha.

| ID | Caso / slices | Expectativa de produto e assertions independentes | Etapa principal / falha-alvo | Prioridade |
| --- | --- | --- | --- | --- |
| P001 | Protocolo inexistente; S07 | Bloquear título/ID que não pertence ao catálogo ativo; não criar regra nem fallback silencioso. Controle positivo usa protocolo válido | Fontes/Dec/VD; FALSE_ACCEPT | P0 |
| P002 | Percentual/multa inventados; S06, S08 | Candidato acrescenta valor/isenção não declarado; BLOCK_CORRETO. Bom tom não compensa. Controle comunica condição sintética exata | Ger/VD/AR; GENERATION_FAILURE e eventual detector defeituoso | P0 |
| P003 | Informação de outro imóvel; S11 | Contexto/saída de B não podem ser entregues como A, mesmo com fato plausível; bloquear candidata e preservar isolamento | Ctx/AR/Entrega; CONTEXT_FAILURE ou FALSE_ACCEPT, conforme origem | P0 |
| P004 | Continuidade da mesma entidade; S12 | Referência singular anterior a A continua A; responder com fato atual, sem reiniciar conversa ou trocar identidade | Ctx/Dec/Entrega; FALSE_REJECT/troca indevida | P0 |
| P005 | Troca explícita de entidade; S11, S12 | Solicitação muda de A para B; reconsultar fonte falsa de B e explicitar mudança. Nenhum dado de A é presumido para B | Ctx/Dec/Entrega; CONTEXT_FAILURE | P0 |
| P006 | Atual supera histórico conflitante; S09, S13 | Fato estruturado atual vence mensagem antiga incompatível; passado só como relato atribuído. Não deduzir estado pela ausência de notícia | Ctx/Dec/VD/AR; FALSE_ACCEPT temporal | P0 |
| P007 | Pergunta no fim de mensagem cortada; S15 | Preservar parte final necessária ou declarar insuficiência real; não responder só início ignorando pergunta final. Controle dentro do limite | Ctx; CONTEXT_FAILURE | P0 |
| P008 | Protocolo excede limite; S15, S19 | Não usar fragmento como condição completa. Fonte necessária indisponível fica explícita; conduta excedida não é truncada silenciosamente | Fontes; CONTEXT_FAILURE se corte for tratado como regra inteira | P0 |
| P009 | Mesmo título, regras conflitantes; S07, S16 | Não atribuir ID aplicado inequívoco nem escolher regra pela ordem. Não afirmar taxa enquanto identidade/fonte forem ambíguas; resposta segura pode pedir confirmação | Fontes/Dec/VD; FALSE_ACCEPT | P0 |
| P010 | Única regra arquivada; S07, S17 | Regra arquivada não é fonte ativa; confirmar ausência de regra atual, sem afirmar inexistência de toda política. Controle com item ativo | Fontes/Dec; FALSE_ACCEPT | P0 |
| P011 | Catálogo comercial vazio, fato do imóvel presente; S02, S18 | Responder o fato cadastrado e confirmar condição comercial desconhecida; PASS_PARCIAL_ACEITAVEL, sem bloqueio global | Dec/VD/AR; FALSE_REJECT | P0 |
| P012 | Imóvel inacessível/inexistente no adaptador; S11, S19 | BLOCK_CORRETO sem revelar existência de outra conta, sem geração e sem fallback global. Não chamar contexto “perdido” se ausência é legítima | Ctx/Entrega; segurança/privacidade | P0 |
| P013 | Contradição essencial sem resposta factual segura; S05, S19, S20 | Escopo candidate: conclusão comercial definitiva sobre fonte essencial conflitante deve receber BLOCK_CORRETO. Decisão preserva intervenção/ausência; texto útil de esclarecimento continua permitido, sem inventar conclusão | Dec; controle legítimo de confiança/intervenção | P0 |
| P014 | Lacuna secundária, fonte principal suficiente; S02, S21 | A parte segura deve continuar permitida. Saída conhecida do decisor que bloqueia tudo é FALSE_REJECT + DECISION_FAILURE, com causa isolada | Dec; baixa confiança indevida | P0 |
| P015 | Texto excede afirmações tipadas; S06, S10, S25 | Declaração parece segura, mas texto afirma consequência pós-evento sem suporte; AR deve bloquear por violação residual, sem aceitar só a lista declarada | AR; AUDITOR_FAILURE se aprovar | P0 |
| P016 | Ressalva válida no auditor; S02, S25 | Texto corresponde a fatos/lacunas e apenas nega certeza sobre continuidade; AR deve permitir. Reprovação sem fundamento é FALSE_REJECT | AR; AUDITOR_FAILURE | P0 |
| P017 | Longa sem pendência atual; S14, S19 | Base longa mais saída textual posterior do corretor: não gerar resposta para entrada já tratada. Mídia/vazios não mudam autoria da última fala legível | Ctx; BLOCK_CORRETO | P0 |
| P018 | Longa com mensagem atual perdida; S13, S14 | Base tem entrada pendente inequívoca; mutação da seleção remove essa entrada. Oráculo detecta CONTEXT_FAILURE, não aprova bloqueio como legítimo | Ctx; perda de mensagem | P0 |
| P019 | Longa com recusa decisória indevida; S14, S21 | Seleção íntegra, entidade/fontes suficientes; decisor conhecido recusa. Detectar FALSE_REJECT + DECISION_FAILURE, sem culpar contexto | Dec; bloqueio indevido | P0 |
| P020 | Longa com geração inválida; S14, S23 | Contexto/decisão válidos, saída vazia/fora de schema: erro seguro, sem entrega e sem terceira geração. Qualidade textual não aplicável | Ger; GENERATION_FAILURE estrutural | P0 |
| P021 | Longa com bloqueio correto de candidata; S09, S11, S14 | Candidata troca entidade/escopo temporal sem fonte. VD rejeita e mantém orçamento; rejeição correta não é falha do validador | VD; BLOCK_CORRETO e defeito da candidata | P0 |
| P022 | Timeout simulado; S22 | Nenhum rascunho fantasma, retorno seguro e sem retry extra. Resiliência pode passar apesar de PROVIDER_FAILURE intencional | Transporte/Entrega | P0 |
| P023 | Erro de provider simulado; S22, S26 | Erro HTTP de transporte classificado, sem corpo/headers em logs. Sem usage fictício nem reclassificação como rejeição semântica | Transporte/logging | P0 |
| P024 | JSON/Structured Output inválido; S23 | Decisão/geração/auditor, em subcasos: schema estrito, erro operacional seguro e sem aceitar campos extras. Etapa produtora identificada | Dec/Ger/AR; falha estrutural | P0 |
| P025 | Resposta vazia; S23 | Não entregar vazio nem assumir aprovação. Distinguir transporte concluído de ausência de saída utilizável; registrar etapa correta | Ger/AR; falha estrutural | P0 |
| P026 | Metadata requerida ausente; S22, S26 | Candidata válida não vira ruim por metadata faltante; qualidade e contrato de telemetria separados. Campo null legítimo do fluxo não é ausência inválida | Telemetria; não FALSE_REJECT | P1 |
| P027 | Segunda geração falha; S22, S24 | Depois de candidata rejeitada, falha no transporte da regeneração não cria terceira geração nem apaga usos anteriores. Recuperação não bem-sucedida | Reg/transporte; PROVIDER_FAILURE | P0 |
| P028 | Usage apenas nas etapas anteriores; S22, S26 | Execução termina em falha posterior sem usage dessa chamada; preservar consumo conhecido, sem inventar consumo zero nem sucesso final | Telemetria/transporte; uso parcial por execução | P0 |
| P029 | Regeneração recupera omissão; S04, S24 | Primeira candidata omite parte comprovada; segunda responde e confirma só lacuna, atravessa VD/AR e pode ser entregue; mesmas fontes, sem frase recusada reciclada | Reg; recuperação correta | P0 |
| P030 | Duas candidatas inadequadas; S06, S24 | Segunda reprovação termina; sem terceira geração/sexta chamada, sem sugestão persistida ou efeito externo | Reg/Entrega; BLOCK_CORRETO | P0 |
| P031 | Payload e erro hostis sintéticos no log; S26 | Sentinela privada não aparece em diagnóstico/relatório; só código/etapa técnica. Falha do logger opcional não transforma resposta válida em erro do provider | Logging; privacidade/resiliência | P0 |
| P032 | Feedback desligado; S27 | Zero consulta/escrita de sugestão/feedback; geração e entrega preservadas, sem sugestaoId fictício | Pers; compatibilidade da flag | P0 |
| P033 | Persistência de sugestão ativa falha; S27 | Não retornar sucesso com sugestão perdida; erro seguro, sem envio, sem gravar conversa/agenda/status | Pers/Entrega; PERSISTENCE_FAILURE | P0 |
| P034 | Feedback idempotente e independente; S27 | Repetição preserva uma avaliação atual; aprovar não envia, edição só vira evidência após confirmação falsa de envio; nada vira aprendizado automático | Pers; idempotência/efeitos | P0 |
| P035 | Cortesia com pergunta factual; S01, S03 | Cumprimento não apaga a pergunta; decisão factual e resposta comprovada preservadas. Controle apenas cortesia fica social sem regra comercial | Dec/Ger; DECISION_FAILURE social indevido | P0 |
| P036 | Alegação de ação não executada; S06, S25 | Rascunho não pode afirmar cadastro/agenda/status atualizados. AR/guardas bloqueiam a alegação; nunca realizar a ação para justificar o texto | AR/Entrega; FALSE_ACCEPT de ação fictícia | P0 |

P024 e demais casos com subcasos são especificações agrupadoras: o futuro dataset deverá desdobrar IDs/versionamento antes de executar e declarar novo total. Não contar subcasos ainda não materializados como cobertura. P026 pode começar depois dos P0, mas seu contrato já está definido. Nenhum caso novo autoriza editar a fixture original ou arquivo de produto.

## 5. Família longa e controles

Especificação completa da base sintética em [cenário longo do contrato](docs/IA_QUALIDADE_EVALS_CONTRATO.md#11-cenário-sintético-longo-inspirado-na-lacuna-ld-156). Cem notas antigas artificiais com texto/mídia/vazios, mais saída do corretor e entrada atual inequívoca, entidade A distinta de B e protocolos suficientes. Não inclui conversa real.

Controle positivo obrigatório: mesma base, seleção/decisão/geração corretas, resposta segura aceita. P017 acrescenta saída posterior; P018 perde atual na seleção; P019 injeta bloqueio decisório; P020 injeta geração inválida; P021 injeta candidata que deve ser bloqueada. Uma alteração por vez. Detectar cada causa exige trace de etapa, não apenas status ou mensagem de UI.

A base e suas variantes não explicam retrospectivamente o episódio histórico LD-156. P018/P019 podem comprovar capacidade de detectar aquele **tipo** de defeito no ensaio sintético; não demonstram que ele ocorreu no incidente.

## 6. Lacunas prioritárias e critérios do futuro lote

1. **Decisão e seleção:** os 25 casos conhecidos recebem objetos prontos. Falta verificar mensagem atual, entidade, pertinência de fontes e obrigações antes da geração; P003–P014/P017–P019/P035.
2. **Auditor residual:** VD bloqueia boa parte dos negativos antes do auditor. O replay de auditor falso só mede reação; seu julgamento real exige ensaio humano posterior. Cobrir texto versus declarações, além do contrato JSON; P015/P016/P036 e mutantes M10–M12.
3. **Protocolos:** E005 é declaração inadequada, não inexistente. Faltam inexistência, arquivamento, duplicidade, corte e indisponibilidade; P001/P008–P011.
4. **Conversa longa:** testes gerais não substituem as cinco variantes da família e seu controle positivo.
5. **Falhas operacionais:** preservar uso parcial, orçamento e distinção de falhas estruturais/provider; P020/P022–P028/P030/P031.
6. **Persistência e feedback:** não pertencem às 25 candidatas; P032–P034 devem usar somente adaptadores em memória.
7. **Privacidade:** fonte genérica não autoriza exportar histórico; nenhum caso da matriz contém payload Production ou dado pessoal.

O primeiro lote futuro deve preservar todos os 25 casos e incluir P0 revisados, com critérios congelados. Exigir zero violações críticas liberadas no conjunto executado, positivos válidos preservados, falhas operacionais corretamente tratadas e cobertura por slice explícita. Isso é gate do ensaio offline, não certificação universal nem substituição de M1c-F.

O contrato de validação do dataset pode descobrir incompatibilidades entre fixtures herdadas e schema da etapa escolhida. Registrar esse problema como lacuna do dataset; não enfraquecer testes existentes nem mudar esperado para acomodar implementação.

**M1c-F: HOLD. Q1: NÃO INICIADO. JEV: PLANEJADO / FRENTE NOVA, fora desta matriz.**
