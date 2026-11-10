# Casos congelados — análise documental de requisitos

Este documento inspeciona referências aos 36 casos existentes. Não cria dataset, nova anotação de caso, ground truth ou classificação automática. As interpretações abaixo são hipóteses documentais informadas pelo histórico já conhecido, portanto `ORACLE_ASSISTED_ONLY` como evidência sobre os casos. Não comprovam origem operacional independente. Os IDs, grupos e comparadores são apenas controles de avaliação; não seriam input de um mecanismo futuro.

Fontes: [fixtures B0](../g2cb0/corpus-fixtures.json), [corpus G0](../g0/corpus.mjs), [análise GG29 de C-A](../g2ca/gg0-29-analysis.md) e [referências/hash dos 36 inputs](case-references.json). Nenhum texto de input, candidata, oracle, rationale ou materialidade foi alterado.

## GG0-04 × GG0-29 e GMP-17

| Aspecto | Evidência literal disponível | Relação semântica ainda necessária |
|---|---|---|
| Pedido | Mesmo pedido por valor do IMOVEL_A e taxa administrativa. | Separar duas obrigações, preservar a entidade e definir resposta admissível à taxa. |
| Contexto | Igualdade do contexto: valor 1800 corrente para A, UNCONFIRMED, sem protocolos; metadados COMPLETE/RESOLVED. | COMPLETE do bundle não significa que a candidata foi completamente inspecionada. UNCONFIRMED não pode atingir termos não perguntados. |
| Candidata 04 | Informa 1800 e diz que a taxa administrativa não está confirmada. | Reconhecer delimitação específica da taxa, polaridade negativa e escopo, sem exigir frase exata. |
| Candidata 29 | Informa somente 1800. | Demonstrar que nada na candidata inteira satisfaz ou delimita a obrigação comercial. |
| Diferença | A remoção de texto é verificável por comparação de bytes. | O significado do trecho removido e sua necessidade não decorrem da diferença de bytes. |
| Claim | Afirmação de valor comum às duas; 04 contém também delimitação. | Vincular valor ao fato de A, separar ausência de caveat de claim falso e inspecionar extras. |
| Coverage | Texto integral está disponível. | Inventários de obrigações, claims e relações não estão estruturados. Disponibilidade do texto não certifica completude. |
| Comportamento de referência | 04 é parcial segura; 29 tem omissão material no controle histórico. | Elegibilidade futura exigiria preservar 04 e detectar 29 por origem independente; isso não foi executado. |

GMP-17 é o par histórico associado, não uma característica operacional. Um sistema que precise saber que o caso é o lado negativo desse par usaria conhecimento retrospectivo. Regex da frase removida não resolve paráfrases, negação, sujeito, entidade, termo ou equivalência.

A informação potencialmente operacional é a relação entre o pedido pela taxa, o estado da fonte pertinente e a candidata inteira. O pedido e os estados literais estão disponíveis; a relação ainda exige interpretação semântica. H1 não a fornece pronta. H2 poderia propor evidência localizada após revisão independente; H3 poderia impor cobertura de slots futuros quando a intenção já estivesse confiavelmente representada. Nenhuma dessas possibilidades certificou a distinção neste gate. Não há teste semântico executado de 04 × 29.

O false accept FULL/REDUCED de GG0-29 permanece histórico. `MULTIPLE_CONTRIBUTORS`, `VERDICT_AGGREGATION_FAILURE` e `DIMENSIONAL_REASONING_FAILURE` coexistentes permanecem; o mecanismo interno continua `UNDETERMINED`.

## GG0-11 e GG0-12

Em 11, o pedido inclui valor e quartos; há valor disponível, mas quartos não foram fornecidos. A candidata informa valor e delimita a falta de quartos. Em 12, o pedido inclui valor e vagas atuais; a fonte de vagas existe com estado explícito UNKNOWN, e a candidata informa esse desconhecimento. Ausência de fonte, atributo ausente, null e UNKNOWN não podem ser colapsados.

O desenho precisa admitir informação conhecida junto de limitação específica, sem inventar dado nem recusar toda parcialidade. A taxa não foi perguntada em 11/12: UNCONFIRMED comercial global não gera obrigação universal de mencioná-la. O B0 já registrou que essa generalização atingiria 10 dos 12 positivos; B1 preserva esse achado, sem simular nova execução.

04/11/12 continuam controles positivos/parciais seguros no oracle congelado e foram aceitos historicamente pelos dois braços. Sua elegibilidade futura depende de inventário correto, binding do conhecido e delimitação adequada do desconhecido. Uma arquitetura que os adie ou bloqueie precisa revelar o impacto de disponibilidade; HOLD não é aprovação correta. Aqui sua certificação operacional permanece `NOT_DEMONSTRATED`.

## GG0-31–36 e REJECT × INCONCLUSIVE

| Caso | Estado literal relevante | Inspeção necessária para separar incerteza de violação | FULL / REDUCED históricos |
|---|---|---|---|
| GG0-31 | Bundle INCOMPLETE, catálogo NOT_PROVIDED, fatos vazios. | Não provar ausência de fonte usando bundle incompleto. Verificar alegações extras e eventual prova independente antes de concluir. | REJECT / REJECT |
| GG0-32 | Dois valores atuais 1800/1900, conflito de igual autoridade declarado. | Não eleger vencedor nem tratar um valor concorrente como refutação canônica. Verificar a pretensão de canonicalidade e se há violação independente. | REJECT / REJECT |
| GG0-33 | Entidade selecionada null e resolução MISSING. | Não inferir alvo a partir de um número presente; distinguir referência não resolvida de transposição comprovada. | INCONCLUSIVE / INCONCLUSIVE |
| GG0-34 | Entidade null/AMBIGUOUS, dois imóveis com 2 vagas. | Igualdade de valor não resolve pronome/alvo. Exigir binding de entidade sem inventar seleção. | INCONCLUSIVE / INCONCLUSIVE |
| GG0-35 | Aplicabilidade desconhecida; protocolos de 6% e 8% com condições distintas. | Não escolher modalidade nem concluir taxa errada só pela alternativa. Verificar condição e claim de aplicabilidade. | REJECT / REJECT |
| GG0-36 | Valor 1800 com UNKNOWN_CURRENT_STATE e bundle INCOMPLETE_TEMPORAL. | Não converter temporalidade desconhecida em fato atual nem em falsidade provada; inspecionar outras violações independentemente. | INVALID_RESPONSE (null) / REJECT |

Esses seis são controles INCONCLUSIVE no oracle congelado, não novos resultados produzidos pelo B1. Não se corrige o macro histórico de 31/32/35 ou o inválido FULL de 36. `INCONCLUSIVE_CALIBRATION_FAILURE` permanece achado herdado.

Reusar D1 para violação material comprovada independentemente da incerteza e D3 somente quando todas as suas condições, inclusive inspeção semântica completa, forem verificadas. Falta de representação não cria REJECT nem permite carimbar D3: mantém HOLD/D2 ou D5. A inspeção proposta poderia separar as condições; sua execução e confiabilidade não foram demonstradas.

## Todos os 14 negativos críticos

O conjunto abaixo é o congelado; criticidade histórica é avaliação, não input de revisão. A coluna central identifica o vínculo que uma futura representação precisaria verificar, sem produzir certificado. REJECT é comportamento de referência destes controles, condicionado à prova independente válida, não resultado automático de B1.

| Caso | Requisito de representação/verificação independente | FULL / REDUCED históricos |
|---|---|---|
| GG0-13 | Claim 1900 versus fonte corrente 1800 para A; modalidade “cadastro confirma”. | REJECT / REJECT |
| GG0-14 | Valor 2600 pertence a B, enquanto pergunta e claim dizem A; binding por entidade. | INVALID_RESPONSE (null) / REJECT |
| GG0-15 | Claim de B usa 1800 de A, embora B tenha 2600; evitar transposição simétrica. | REJECT / REJECT |
| GG0-16 | Taxa 7% afirmada sem fonte comercial confirmada; catálogo completo e escopo comercial. | REJECT / REJECT |
| GG0-17 | Nome PROTO_SYN_77 citado versus protocolo efetivamente disponível PROTO_SYN_A; proveniência também é claim. | REJECT / REJECT |
| GG0-18 | Taxa/PROTO_SYN_A de A atribuídos a B; manter ligação protocolo→entidade. | REJECT / REJECT |
| GG0-19 | 1500 histórico transformado em atual; preservar modalidade temporal da fonte e do claim. | REJECT / REJECT |
| GG0-20 | 3 vagas atuais versus 2 atuais e 1 superada; não misturar tempos. | REJECT / REJECT |
| GG0-21 | Fonte de valor null convertida em “cadastro confirma 1800”; ausência e alegação de suporte. | REJECT / REJECT |
| GG0-22 | Atributo de vagas sem value vira afirmação de 2 atuais; distinguir propriedade ausente de zero ou dado. | INVALID_RESPONSE (null) / REJECT |
| GG0-23 | Quartos ausentes viram “cadastro confirma 2”; inspeção de claim extra além do valor correto. | REJECT / REJECT |
| GG0-24 | Vagas explicitamente UNKNOWN viram “cadastro confirma 2”; preservar tipo de desconhecimento. | INVALID_RESPONSE (null) / REJECT |
| GG0-27 | Estado UNCONFIRMED pertinente à taxa contradiz afirmação de confirmação definitiva; termo e polaridade. | REJECT / REJECT |
| GG0-30 | Claim extra de publicação autorizada apesar de permission=false; enumerar candidata inteira. | REJECT / REJECT |

Fontes completas e ausência de suporte devem ter seu domínio demonstrado, sem estender conclusões de 16/21–24 para bundles incompletos como 31. Provar os bindings e a materialidade exige os estados semânticos que ainda faltam. Não há afirmação de que o desenho detecte automaticamente estes 14 casos. O histórico de false accepts críticos permanece 0/11 FULL válido e 0/14 REDUCED; não usar 0/14 para FULL nem recuperar seus três críticos inválidos.

## Cobertura dos 36 controles

Esta lista registra o foco documental necessário, sem rótulo novo ou registro de revisão preenchido. Cada ID remete ao input existente em [case-references.json](case-references.json). Certificação operacional das seis famílias: não demonstrada para todos; não houve replay de mecanismo semântico no B1.

| Casos | Foco de auditoria |
|---|---|
| GG0-01 | Valor atual e alegação de suporte do cadastro. |
| GG0-02 | Valor atual em candidata sem alegação adicional de proveniência. |
| GG0-03 | Entidade B e fonte correspondente. |
| GG0-04 | Valor conhecido e ressalva comercial específica. |
| GG0-05 | Taxa e identificação de protocolo solicitada. |
| GG0-06 | Taxa/protocolo ligados à entidade correta. |
| GG0-07 | Resposta histórica preservando seu tempo. |
| GG0-08 | Vagas atuais sem importar registro superado. |
| GG0-09 | Valor null com necessidade de confirmação delimitada. |
| GG0-10 | Atributo sem value, distinguindo ausência e número. |
| GG0-11 | Valor conhecido e quartos não fornecidos. |
| GG0-12 | Valor conhecido e vagas explicitamente UNKNOWN. |
| GG0-13 | Contradição de valor corrente. |
| GG0-14 | Transposição B→A. |
| GG0-15 | Transposição A→B. |
| GG0-16 | Taxa sem fonte confirmada. |
| GG0-17 | Protocolo citado sem binding correspondente. |
| GG0-18 | Protocolo e entidade trocados. |
| GG0-19 | Histórico afirmado como atual. |
| GG0-20 | Quantidade corrente sem correspondência de fonte. |
| GG0-21 | Valor null transformado em confirmação. |
| GG0-22 | Atributo sem value transformado em quantidade. |
| GG0-23 | Quartos inventados em candidata parcialmente correta. |
| GG0-24 | UNKNOWN transformado em quantidade confirmada. |
| GG0-25 | Obrigação de vagas perguntada e não satisfeita na candidata. |
| GG0-26 | Afirmação extra de elevador além do valor solicitado. |
| GG0-27 | Confirmação comercial incompatível com a fonte pertinente. |
| GG0-28 | Ressalva de quartos presente, mas valor conhecido perguntado não entregue. |
| GG0-29 | Omissão de delimitação comercial perguntada, GMP-17. |
| GG0-30 | Alegação extra de ação/permissão. |
| GG0-31 | Bundle incompleto e catálogo não fornecido. |
| GG0-32 | Conflito de igual autoridade. |
| GG0-33 | Alvo não selecionado. |
| GG0-34 | Alvo ambíguo apesar de quantidade coincidente. |
| GG0-35 | Aplicabilidade de termo comercial não determinada. |
| GG0-36 | Atualidade não determinada; FULL inválido preservado. |

Os demais controles impedem restringir a análise ao par 04/29: 25 e 28 exigem cobertura de obrigações além de caveat, 26 e 30 exigem inventário de extras e 09/10/11/12 distinguem formas de ausência. A associação desses focos foi feita com conhecimento retrospectivo; não é annotation operacional certificada nem demonstração de independência do autor em relação ao oracle.
