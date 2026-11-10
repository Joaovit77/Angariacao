# Comparação H1–H5

Valores descrevem exigência/carga/risco potencial; não são métricas de desempenho. LOW não significa segurança comprovada. ParaH5, riscos do produto existente continuam não medidos.

- **H1 — Campos atuais apenas**: Estados literais observáveis não enumeram pedido/candidata ou completude. Estado: `NOT_DEMONSTRATED`.
- **H2 — Revisão humana estruturada proposta**: Protocolo auditável proposto, sem revisores recrutados ou resultados; completude semântica permanece a validar. Estado: `HUMAN_REVIEW_ELIGIBLE`.
- **H3 — Representação/renderização controlada conceitual**: Pode preservar claims/ressalvas codificados em domínio fechado; não prova intenção do pedido livre e não certifica candidatas históricas. Estado: `CONTROLLED_REPRESENTATION_ELIGIBLE`.
- **H4 — Extração automática conceitual**: PROBLEM_DISPLACEMENT_RISK se outro LLM apenas preencher prechecks; ground truth independente e inspeção são pré-condições. Estado: `NOT_DEMONSTRATED`.
- **H5 — F — abandonar JEV Guard**: Alternativa legítima para não gastar/integrar; custos herdados e benefício perdido desconhecidos; não produz semântica nem alegação de sucesso. Estado: `VALID_ALTERNATIVE`.

| Dimensão | H1 | H2 | H3 | H4 | H5/F |
|---|---|---|---|---|---|
| Precisão exigida, não alcançada | HIGH | HIGH | HIGH | HIGH | UNKNOWN |
| Risco para independência | LOW | MEDIUM | MEDIUM | HIGH | LOW |
| Carga para auditabilidade semântica | HIGH | HIGH | MEDIUM | HIGH | LOW |
| Risco de exposição/contaminação | LOW | HIGH | MEDIUM | HIGH | LOW |
| Carga humana potencial | LOW | HIGH | MEDIUM | MEDIUM | UNKNOWN |
| Carga computacional potencial | LOW | LOW | MEDIUM | UNKNOWN | LOW |
| Latência operacional não medida | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| Superfície adicional de falha | LOW | HIGH | HIGH | HIGH | LOW |
| Risco de false block de um mecanismo não executado | HIGH | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| Risco de false allow de um mecanismo não executado | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| Disponibilidade real não medida | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| Carga de manutenção potencial | LOW | HIGH | HIGH | HIGH | LOW |
| Carga de compatibilidade/mudança futura | LOW | LOW | HIGH | MEDIUM | LOW |
| Necessidade eventual de provider | LOW | LOW | LOW | HIGH | LOW |
| Necessidade futura de representação/contrato novo | LOW | MEDIUM | HIGH | HIGH | LOW |
| Necessidade de alterar geração futuramente | LOW | LOW | HIGH | MEDIUM | LOW |
| Dificuldade de teste cego posterior | HIGH | HIGH | MEDIUM | HIGH | UNKNOWN |
| Carga para reverter uma proposta futura | LOW | LOW | MEDIUM | MEDIUM | LOW |

As escalas comparam exigências, dependências e riscos potenciais, sem medição operacional. H1 tem baixa superfície adicional, mas não resolve observabilidade. H2 permite inspecionar evidências por pessoas, com viabilidade de cegamento e completude ainda desconhecidas. H3 poderia limitar geração em domínio fechado, exigindo possível mudança de entrada/geração no futuro. H4 não ganha independência só por trocar o modelo decisor. H5 não tem erro semântico de um guard novo porque não o executa, mas isso não mede false allow do produto existente. Nenhuma arquitetura foi promovida.
