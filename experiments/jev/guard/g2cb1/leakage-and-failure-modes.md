# Oracle leakage e modos de falha

Modelo de ameaça documental. Os testes de mutação deste gate atacam regras dos artefatos; não são ataques executados contra pessoas, extratores ou providers. Ativos protegidos: independência da representação, integridade histórica, disponibilidade das parciais seguras e separação entre violação e incerteza.

| Vetor / agente possível | Efeito perigoso | Controle proposto | Risco residual |
|---|---|---|---|
| Oracle/rationale/expected passam do custodiante ao produtor da representação | Obrigações e provas reproduzem o rótulo. | Vistas separadas; obrigações seladas antes da candidata; avaliação só após selagem. | Cegamento não executado, UNKNOWN. |
| Criticidade e materialidade históricas tratadas como input | Materialidade aparenta ser operacional. | Política geral anterior, evidência do pedido e fonte; rótulos históricos só na avaliação. | Política geral ainda requer revisão independente. |
| IDs, títulos, tags, GMP-17, ordem, caminhos, proporção de classes | Revisor reconhece o par e sua resposta. | Custódia, declaração de exposição e quarentena; esconder metadados avaliativos. | Corpus público ao executor deste gate; renomear não apaga memória. |
| Anotação retrospectiva rotulada como revisão humana ou observação automática | Evidência assistida vira certificado independente. | `ORACLE_ASSISTED_ONLY`; preservar origem legada sem assumir execução humana. | Não há certificado humano independente neste gate. |
| FULL/REDUCED, confidence e histórico expostos | Revisor segue erro histórico ou confiança. | Remover da vista futura; separar comparação posterior. | Independência ainda não testada. |
| Codex produz explicação e a atribui a pessoa humana | Revisão fictícia. | Papel exclusivo de autor documental; formulários vazios e contagens reais zero. | Não pode certificar sua própria independência em relação ao corpus. |
| Outro LLM preenche prechecks ou mesmo provider atesta sua saída | Mesmo problema muda de componente. | Ground truth independente e validação cega seriam pré-condições; proibir autoatestação. | `PROBLEM_DISPLACEMENT_RISK`, H4 não validada. |
| UNCONFIRMED global ou regex da frase histórica | Bloqueia positivos ou perde paráfrase/negação. | Ressalva por pedido × fonte × entidade × tempo × termo, equivalência revisada. | Reconhecimento semântico continua não certificado. |
| Poucos claims enumerados recebem selo completo | Claim extra, permissão ou omissão escapam. | Revisão de toda a candidata, inventários, relações e itens não avaliados. | Duas revisões podem compartilhar a mesma omissão. |
| Cobertura de caracteres confundida com completude semântica | Forma contabilizada, significado perdido. | Separar mapa geométrico de inspeção semântica; recusar certificado com lacunas. | Completude de linguagem livre não demonstrada. |
| “Não encontrado” vira “ausente” | Ressalva equivalente ignorada; false block. | MISSING_VERIFIED só com inspeção integral; caso contrário UNKNOWN. | Equivalência, sujeito e escopo ainda exigem julgamento. |
| Binding liga número certo à fonte/entidade/tempo errados | False allow nos críticos. | Vínculo localizado e versionado com atributo, modalidade e proveniência. | Qualidade das fontes e interpretação permanecem limitações. |
| Falta de prova vira REJECT; falta de contradição vira APPROVE | Mistura 31–36 com violação, ou permite afirmação não sustentada. | Reusar matriz B0 e quatro estados de inspeção; HOLD para representação incompleta. | Separação ainda documental, sem taxa medida. |
| HOLD contado como acerto ou excluído do denominador | Disponibilidade degradada e falso ganho. | Reportar todos os adiamentos, especialmente 12 positivos e 3 parciais no cenário B0. | False block/allow automáticos continuam NOT_MEASURED. |
| Manifesto controlado declara intenção que não foi capturada | H3 elimina superfície textual e conserva omissão no plano. | Origem independente de obrigações, domínio fechado e limites explícitos. | Correspondência à pergunta livre não demonstrada. |
| Fontes/textos/políticas mudam sem invalidar certificado | Binding correto para versão antiga. | Hash, versão, histórico append-only e recertificação. | Custo operacional e viabilidade UNKNOWN. |
| Adjudicação usa oracle ou força consenso | Ground truth circular. | Divergência preservada, adjudicador cego e UNKNOWN permitido. | Concordância não prova correção. |
| Menor custo promove arquitetura sem segurança | Complexidade ou preço substitui evidência. | Nenhuma promoção por custo isolado; H5 avaliada em igualdade. | Custos e benefício não medidos. |

O erro de obrigação ou de materialidade pode permitir 29 ou bloquear 04/11/12. O erro de claim/binding pode permitir os críticos ou transformar incerteza legítima em violação. O erro de completude compromete todas as outras famílias. Por isso, não basta preencher seis booleanos nem mover a inferência para outro serviço.

H4 exigiria extrair obrigações antes de conhecer a candidata, inventariar afirmações e relações, reconhecer ressalvas por equivalência, ligar fontes e declarar limites de inspeção. Ground truth teria de vir de origem independente com adjudicação rastreável; saídas de outro modelo não se tornam verdade por concordarem. Seria necessário testar cegamente omissões, extras, negação, entidade, temporalidade, condição comercial, cobertura e abstenções. Não há prompt de execução, modelo chamado, extrator implementado, nova amostra ou resultado dessa hipótese.

H5/F é uma decisão válida de não prosseguir com JEV Guard. Evita a nova superfície proposta, mas não prova que o produto existente resolva o problema nem mede benefício perdido. STOP seria defensável se a única saída prática fosse outro LLM não validado, se não houvesse origem independente ou se custo/complexidade se mostrassem desproporcionais. Esses custos não foram medidos; B1 mantém HOLD e não pressupõe que continuar seja melhor.
