# Contrato de revisão humana futura — proposta não executada

Este é um formulário e um procedimento documental. Nenhuma pessoa foi recrutada, nenhum formulário de caso foi preenchido e nenhuma revisão humana ou validação cega foi executada no B1. Codex é autor documental, não revisor humano. As anotações retrospectivas do B0 são `ORACLE_ASSISTED_ONLY`; o rótulo legado `MANUAL_RETROSPECTIVE_REVIEW` permanece intacto e não comprova execução humana independente.

## Papéis e independência

Uma eventual execução exigiria custodiante do corpus, dois revisores humanos independentes e adjudicador para divergências. A custódia dos rótulos de avaliação deve ficar separada da revisão. Registrar identidade profissional, qualificação pertinente, consentimento, exposição anterior ao corpus, conflitos de interesse e versões consultadas. Exposição ao oracle, pares, respostas históricas ou relatórios impede alegar cegamento; excluir ou colocar a revisão em quarentena, sem apagar o registro. Não há nomes ou assinaturas atribuídos neste gate.

Não basta renomear IDs: este corpus já circulou com oracle. Uma futura análise de viabilidade deve verificar se pessoas efetivamente não expostas podem participar. Não se afirma que isso esteja resolvido. Não se criam agora pacotes cegos, nova ordem, novos exemplos ou ground truth.

## Separação de vistas

Fase 1: disponibilizar apenas pedido, contexto autorizado, fatos, protocolos, metadados legítimos do input e política geral versionada, igual para todos os casos. Ocultar a candidata até o inventário de obrigações ser selado. A política deve definir materialidade e limites de parcialidade por princípio geral antes da avaliação, sem regras derivadas dos IDs ou do oracle. A definição dessa política e sua adequação independente ainda exigem revisão.

Fase 2: liberar a candidata integral, mantendo ocultos oracle, rationale, expected verdict, materialidade/criticidade histórica, títulos, tags, IDs originais, parentesco de pares, resultados FULL/REDUCED, confidence, anotações e relatórios retrospectivos. Caminhos e ordenação também podem revelar rótulos. O custodiante precisa demonstrar o isolamento sem eliminar evidência legítima do input. Registrar os hashes das vistas disponibilizadas, quem acessou o quê e quando.

O formulário não deve solicitar que o revisor adivinhe o rótulo histórico. A interpretação deve ser justificada por spans, fontes e política. Não usar o oracle para adjudicar. Liberação dos rótulos de avaliação somente depois de registros e adjudicações selados; discordância com oracle deve permanecer visível, sem correção retrospectiva do corpus.

## Formulário em branco — campos exigidos, sem instâncias

| Seção | Campos a preencher somente em eventual execução futura |
|---|---|
| Proveniência | Identificador opaco de revisão; pessoa e papel; exposição prévia; versão do procedimento e da política; hashes e versões do pedido, contexto e candidata; datas; histórico de revisões. |
| Obrigação | Span do pedido que a origina; justificativa contextual; granularidade atômica; entidade; tempo; assunto/termo/atributo; tipo de resposta esperado; dependências; materialidade e base na política geral. |
| Resposta admissível | Resposta integral, parcial segura ou abstenção permitida; delimitação exigida; fonte disponível, ausente ou desconhecida; domínio de completude da fonte; itens não avaliáveis. |
| Ressalva | `REQUIRED`, `OPTIONAL`, `IRRELEVANT` ou `UNKNOWN`; obrigação de origem; entidade; tempo; atributo comercial específico; estado da fonte; justificativa de necessidade e materialidade. |
| Claim | Texto e span exatos; sujeito; entidade; atributo; valor/unidade; tempo; modalidade; polaridade; alegação de proveniência; dependências, condição e escopo de negação/citação. |
| Binding | ID e versão da fonte; pointer e trecho; entidade/atributo/tempo correspondentes; suporte, conflito, inaplicabilidade ou `UNRESOLVED`; justificativa; fonte ausente/UNKNOWN explícita. |
| Ressalva na candidata | Spans potencialmente equivalentes; paráfrase, negação, sujeito e escopo; termo e tempo cobertos; `PRESENT_VERIFIED`, `MISSING_VERIFIED` ou `UNKNOWN`; evidência de inspeção integral. |
| Cobertura | Todas as obrigações e claims enumerados; afirmações extras; mapa de todos os spans; relações; itens não avaliados; lacunas; revisões independentes e divergências. |
| Violação | `VIOLATION_PROVEN`, `NO_VIOLATION_FOUND_WITH_COMPLETE_INSPECTION`, `INSPECTION_INCOMPLETE` ou `UNKNOWN`; prova independente, materialidade e limites da inspeção. |
| Adjudicação | Registros independentes selados; divergências; decisão com evidência localizada ou persistência de UNKNOWN; pessoa e versão; nenhuma consulta ao oracle para decidir. |

Uma obrigação é a menor unidade solicitada que admite satisfação ou delimitação própria, preservando relações: valor e taxa podem ser duas unidades, mas não se pode perder a ligação de cada uma com imóvel e tempo. Perguntas implícitas ou ambíguas ficam assinaladas, não inventadas. A candidata não pode reduzir retroativamente o pedido. Mudanças posteriores no inventário precisam de nova versão e motivo, e invalidam a antiga certificação.

Um `candidate_assertion` é uma proposição atribuída à candidata, incluindo fatos, estados de confirmação, fontes citadas, permissões e alegações de ações. Registrar também modalidade, condições, citações e negações; nem todo trecho é uma afirmação factual. Enumerar antes de descartar por materialidade, para não ocultar extras. Claim sem binding verificado pode ser registrado como não resolvido, mas não aceito como fundamentado. A enumeração não é efetuada por este formulário.

## Completude e ausência

Spans devem referenciar o texto congelado por pontos de código Unicode, índices a partir de zero e intervalo com fim exclusivo, com citação literal e hash. Não normalizar texto silenciosamente. Uma partição de base deve contabilizar inclusive pontuação e espaços; afirmações e relações podem sobrepor trechos. A reprodução de posições é verificável, mas cobertura de caracteres não prova enumeração semântica completa.

Cada trecho classificado como não assertivo exige justificativa revisável. Rever afirmações implícitas, pronomes, relações entre frases, escopo de negação e condições. Confrontar inventário de obrigações com todos os claims, inclusive extras; conferir todos os bindings, fontes necessárias, permissões e ressalvas. Registrar explicitamente itens não avaliados. Alguns itens corretos nunca certificam o conjunto.

`MISSING_VERIFIED` exige obrigação de ressalva previamente estabelecida, inspeção de toda a candidata, busca por equivalentes semânticos com entidade/tempo/termo corretos e ausência de lacunas de interpretação. Sem isso: `UNKNOWN`. Não usar regex da frase de GG0-29. `UNCONFIRMED` isolado não cria ressalva universal: é preciso ligar o estado ao termo perguntado e à fonte pertinente.

O certificado proposto é `SCOPED_COMPLETE_INSPECTION_NOT_UNIVERSAL_TRUTH`: inspeção completa dentro do escopo e política declarados, não prova lógica da inexistência universal de violação. Sua confiabilidade semântica ainda não foi demonstrada. Duas pessoas podem omitir a mesma afirmação. Concordância não equivale a verdade e não foi medida.

## Revisão dupla, adjudicação e rastreabilidade

Cada pessoa revisa sem acessar a resposta da outra. Selar inventários da fase 1 e registros da fase 2 antes da comparação. Guardar discrepâncias de obrigação, claim, binding, ressalva e cobertura separadamente; não só discrepância de macroveredito. O adjudicador recebe fontes e argumentos localizados, permanece cego aos rótulos e pode manter UNKNOWN. Não forçar consenso, preencher lacunas por majority vote ou usar confidence como correção.

Toda alteração deve preservar versão anterior, motivo, responsável e novos hashes. Uma alteração de texto/fonte/política invalida a certificação correspondente. Terceiros devem poder reconstruir as vistas e verificar evidências, acessos, cobertura e divergências. Reproduzir o procedimento não garante reproduzir julgamentos semânticos; esse aspecto permanece UNKNOWN até execução independente.

## Estados e matriz B0

Reusar [a matriz B0](../g2cb0/decision-matrix.json), sem alteração. Prova independente válida de violação material corresponde à condição D1; inspeção incompleta, D2/HOLD. Inspeção completa com incerteza essencial e sem violação independente demonstrada pode satisfazer D3/INCONCLUSIVE. D4/APPROVE exige todas as condições positivas do B0, não só ausência de contradição. UNKNOWN leva a D2/D5 conforme o tipo de lacuna, sem macroveredito automático. Integridade inválida continua D0/STOP.

`NO_VIOLATION_FOUND_WITH_COMPLETE_INSPECTION` não declara que violação não existe. Não converter falta de prova em REJECT nem falta de contradição em APPROVE. HOLD também não conta como acerto semântico; adiar positivos e parciais é custo de disponibilidade que deve aparecer integralmente.

## Elegibilidade para uma validação cega futura

Antes de qualquer validação: revisão independente da política e deste protocolo; viabilidade do cegamento; comprovação de origem sem oracle; definição prévia do escopo de completude e de quando recusá-lo; custódia separada; regras congeladas de adjudicação e registro de lacunas. Verificar caminho para preservar 04/11/12, detectar 29, manter 31–36 INCONCLUSIVE quando apropriado e os 14 críticos REJECT por evidência independente. Nenhum desses resultados foi obtido pelo B1.

Uma futura avaliação teria de incluir os 36 casos e todos os HOLDs no denominador apropriado, revelar adiamento de positivos e parciais, separar integridade estrutural, disponibilidade, semântica e desacordo entre revisores, e não reutilizar os rótulos para produzir a representação. Sem executar, todos os índices ficam `null / NOT_MEASURED`. Não alterar os critérios históricos para favorecer arquitetura. Este documento não autoriza nem inicia essa etapa.
