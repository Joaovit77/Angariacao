# JEV-GUARD-G2-A — análise offline

Análise dos artefatos sanitizados de G1, sem reconstruir raw ou chamar provedores. G1 permanece PASS EXECUTION / NAO_PROMISSOR_DIAGNOSTICO. Conclusão deste estudo: **B — REDUCED_CONTRACT_EXPERIMENT_JUSTIFIED**, somente como hipótese a testar. Nenhum contrato de produto foi selecionado ou implementado.

O núcleo puro [analysis.mjs](analysis.mjs) deriva os quadros de ledger/summary/metrics preservados; o [gerador](generate.mjs) lê somente esse run e escreve apenas neste namespace antes do freeze. Execução offline exige a barreira de rede S2-G-A. Depois do freeze, o gerador recusa regeneração. Os [testes](g2a.test.mjs) e [mutantes](mutation-report.json) verificam fatos, denominadores, projeções intactas e ausência de recuperação semântica.

Os [fatos G1](g1-facts.json), [12 inválidos](invalid-analysis.json), [SUM](sum-mismatch-analysis.json), [CHOICE](choice-mismatch-analysis.json) e [ranking](question-failure-map.json) mantêm a diferença entre pergunta localmente aceitável e envelope elegível. Os 11 verdicts localmente aceitáveis não contam como resultados normalizados. O desenho G2-B é proposta, com zero autorização/chamadas/orçamento.

[Relatório](../../../../RELATORIO-JEV-GUARD-G2-A.md). Nenhum arquivo anterior ou do produto é modificado. Históricos são somente lidos e hashes do produto são conferidos; nenhuma credencial, serviço externo ou dado real é acessado.
