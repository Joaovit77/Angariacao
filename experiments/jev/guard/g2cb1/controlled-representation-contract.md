# Representação e renderização controladas — contrato conceitual

Hipótese H3, não implementação. Não há schema, parser, extrator, renderer, prompt, payload, alteração de geração ou nova candidata neste gate. Este contrato descreve condições que uma arquitetura futura teria de satisfazer; não certifica o corpus existente.

| Etapa conceitual | Possível fonte verificável | Interpretação que permanece |
|---|---|---|
| Pedido estruturado upstream | Slots de intenção explicitamente escolhidos/confirmados por origem confiável, com entidade, tempo e atributo. | A intenção de uma pergunta livre não vira slot confiável por renomeação. Sua tradução requer interpretação independente; metadados da própria candidata não bastam. |
| Obrigações e parcialidade | Lista versionada derivada dos slots e política geral; cada obrigação admite valor, ausência delimitada, UNKNOWN ou abstenção conforme contrato. | Adequação dos slots e da política à intenção, materialidade e contexto; instrução implícita fora do domínio. |
| Plano de claims | Unidades tipadas com sujeito, entidade, atributo, valor, tempo, modalidade, polaridade e binding de fonte. | Correção e completude das fontes, correspondência da intenção, condicionais de protocolo, afirmações fora do domínio. |
| Ressalvas | Bloco obrigatório ligado à obrigação, estado da fonte, entidade, tempo e termo específico. | Determinar por que aquela ressalva é requerida; não aplicar UNCONFIRMED globalmente. |
| Texto controlado | Formas lexicais aprovadas e versões rastreáveis, produzidas exclusivamente das unidades verificadas. | Semântica das formas lexicais e interpolações precisa de revisão; texto livre anexado reabre o problema. |
| Manifesto de cobertura | Relação entre cada unidade renderizada e seu claim, ressalva e fonte; todos os slots contabilizados. | Manifesto não prova que o pedido foi integralmente representado. Cobertura por construção tem domínio delimitado. |

Invariantes conceituais: nenhuma unidade textual sem claim/ressalva verificado; nenhum claim fundamentado sem binding; todo slot obrigatório tem satisfação ou delimitação admissível; entidade/tempo/termo acompanham cada vínculo; nenhuma adição livre; comparação entre texto final e manifesto versionados; alterações invalidam o certificado. Strings de fontes interpoladas não podem introduzir afirmações livres sem inspeção. Permissões e alegações de ações também pertencem ao plano, sem autorizar executar ação.

Em domínio fechado, a presença do bloco e sua cobertura poderiam deixar de exigir interpretação da saída, pois seriam verificáveis por construção e rastreabilidade. Isso depende de renderização fiel e formas lexicais previamente certificadas. Não demonstra completude semântica de entradas livres, política de materialidade ou integridade do catálogo de fontes. Esses pontos podem continuar exigindo revisão humana estruturada; uma segunda LLM preenchendo os slots não é fonte determinística independente (`PROBLEM_DISPLACEMENT_RISK`).

Para 04/11/12, slots devem permitir valor fundamentado junto de limitação específica de taxa, quartos ausentes ou vagas UNKNOWN. Proibir toda parcialidade reduz disponibilidade. Para 29, um plano que omite o slot da taxa seria incompleto somente se a obrigação já tiver origem independente. Impedir essa geração futura é diferente de reconhecer a omissão em texto livre histórico.

Não se pode converter retrospectivamente as candidatas congeladas para uma árvore estruturada e declarar que sua semântica foi certificada. GG0-29 continua false accept histórico; quatro FULL inválidos continuam inválidos. Um manifesto feito pelo próprio gerador não comprova que não há claims extras no texto. Uma auditoria futura precisaria testar também divergência manifesto/texto e falhas de fonte, sem preencher lacunas pelo oracle.

Compatibilidade com Angario não está demonstrada. H3 poderia exigir mudar entrada e geração, com custo de adoção e manutenção potencialmente alto e valores reais UNKNOWN. Não há recomendação de implementação ou integração. Ser reversível no desenho não elimina o esforço de migração. Custos baixos, se futuramente observados, nunca bastariam para promover a arquitetura sem independência e segurança semântica.
