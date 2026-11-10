# Propagação pendente — IA-00

Fatos confirmados nesta auditoria local de 16/10/2026. Não é segunda Tabela Mestre. Nenhuma fonte canônica foi editada. As constatações de ausência são limitadas ao universo inspecionado, detalhado no relatório.

| FRENTE | SUBFRENTE | ESTADO CONFIRMADO | EVIDÊNCIA | BLOQUEIO | PRÓXIMO GATE | CAMINHO DO RELATÓRIO |
| --- | --- | --- | --- | --- | --- | --- |
| IA | Base local de auditoria | Checkout limpo inicial em `codex/b3-2-auditoria`, HEAD `366dc0f`; 73 commits atrás de `origin/main` local `0149ad4`. Último fetch local ocorreu em 12/10, não nesta auditoria | Git status, rev-list, reflog e worktrees; relatório §§1–2 | Ponta remota após 12/10 não consultada; base aberta anterior a M1c | Reconciliar base em tarefa futura autorizada antes de implementação | `C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md` |
| IA | Qualidade/Evals — inventário | 62 arquivos diretamente ligados a IA/Assistente no subconjunto definido; 780 declarações estáticas, sem execução. Fixture semântica atual tem 25 cenários; há três ensaios reais separados e proibidos para Codex | Árvore `0149ad4`, `web/tests`, `web/tests/fixtures/atendimento-semantico.ts`, Vitest e runner manual; relatório §9 | Contagem de declaração não é número de casos aprovados nem baseline de qualidade | Contrato local e matriz offline; não abrir Q1 antes do gate de F | `C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md` |
| IA | Rejeição do atendimento F3 | F3 mantém eventos próprios de bloqueio/validação correlacionados por `execucao_id`; não duplica em `ia-resposta-rejeitada` | Handler em `0149ad4`, testes `ia-metadados-atendimento.test.ts`; relatório §§5 e 9 | Uma avaliação baseada só no evento genérico omite F3 | Definir indicadores separados de provider, aplicação e feedback humano | `C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md` |
| IA | LD-156 / conversa longa | Há histórico documental e testes relacionados a temperatura/chegada; não foi localizado eval da ocorrência específica de primeira tentativa insuficiente e segunda bem-sucedida | Busca rastreada em `0149ad4`; seletor/handler e testes de atendimento; relatório §9 | Código, etapa e versão da ocorrência histórica não disponíveis; causa não demonstrada | Caso sintético com expectativa de produto, sem reproduzir conversa privada ou culpar decisor sem evidência | `C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md` |
| IA | Feedback — divergência documental | Código define `IA_FEEDBACK_SCHEMA_READY=true`, enquanto PROJECT ainda descreve trava false; ambiente não consultado | `feedback-config.ts`, commit `2d1b917`, PROJECT em `0149ad4`; relatório §11 | Ativação ambiental/uso hoje desconhecidos; PROJECT é caminho compartilhado com Radar | Consolidar correção documental futuramente fora da edição concorrente; não presumir feature ativa | `C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md` |
| IA | JEV | Usuário confirmou acesso obtido, sem nunca utilizar; frente totalmente nova. Nenhum artefato de integração localizado na árvore auditada | Esclarecimento humano de 16/10 e busca local; relatório §7 | Acesso não comprova implementação, experimento ou Production | Definir contrato de nova frente em escopo próprio; não integrar nesta etapa | `C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md` |
| IA / Radar | Overlap | `PROJECT.md` e `supabase-schema.sql` aparecem no commit Radar local `a162724`; cadeia de comparáveis/embeddings é compartilhada. Nenhum desses arquivos foi editado | Diff de objetos da branch Radar e consumidores F13 em `0149ad4`; relatório §12 | Manifesto ativo R1/R2/R3 da outra máquina não disponível; status da worktree Radar inacessível no ambiente | Conferir manifesto antes de mudar arquivos; excluir caminhos com conflito real do trabalho paralelo | `C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md` |
| IA | Tabela Mestre | Cópia canônica/sincronizada não localizada nos caminhos locais pesquisados; apenas relatório e esta propagação criados | Busca por nomes, caminho informado inexistente e árvore Git; relatório §3 | Fonte canônica mantida na outra máquina | Consolidação manual posterior na fonte única | `C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md` |

## Registro pendente — IA-Q0-CONTRATO-LOCAL

Data: 16/10/2026. Registro de checkpoint para consolidação manual; não substitui a Tabela Mestre canônica. O histórico IA-00 acima permanece preservado.

| Campo | Estado / evidência |
| --- | --- |
| FRENTE | IA |
| CHECKPOINT | IA-Q0-CONTRATO-LOCAL |
| PASS/HOLD | PASS IA-Q0-CONTRATO-LOCAL, exclusivamente documental; links/IDs/contagens/privacidade evidente/whitespace e manifesto conferidos, sem validação funcional ou modelo real |
| EVIDÊNCIA | Contrato documental, 25 casos existentes inventariados, 27 slices, 36 casos propostos e 12 mutantes especificados; sem runner, scorer, dataset executável ou ensaio real |
| BASE | Código de referência local `0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883`; checkout documental em `366dc0f1b8c7ec5794d880de6f038b0698e25598`, sem atualização Git |
| M1c-F | HOLD; data temporal necessária em 19/10/2026 00:00 UTC não fecha volume, metadados ou baseline |
| Q1 | NÃO INICIADO; nenhuma implementação ou avaliação de modelo autorizada por Q0 |
| JEV | PLANEJADO / FRENTE NOVA, fora de Q0 |
| RADAR | Nenhum arquivo alterado; documentos novos fora do conjunto conhecido. Manifesto ativo da outra máquina permanece pendente para implementação futura |
| PRÓXIMO GATE | Fechamento formal de M1c-F com C1/volume/metadados/cobertura; revisão humana do contrato e escopo Q1; overlap Radar resolvido; base de implementação reconciliada |
| CONTRATO | [docs/IA_QUALIDADE_EVALS_CONTRATO.md](docs/IA_QUALIDADE_EVALS_CONTRATO.md) |
| MATRIZ | [IA_Q0_MATRIZ_CASOS.md](IA_Q0_MATRIZ_CASOS.md) |
| RELATÓRIO | [RELATORIO-IA-Q0-CONTRATO-LOCAL.md](RELATORIO-IA-Q0-CONTRATO-LOCAL.md) |
| CAMINHOS DOS NOVOS ARQUIVOS | `C:/Users/ciria/Desktop/sistema-angariação/Angariação/docs/IA_QUALIDADE_EVALS_CONTRATO.md`; `C:/Users/ciria/Desktop/sistema-angariação/Angariação/IA_Q0_MATRIZ_CASOS.md`; `C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-IA-Q0-CONTRATO-LOCAL.md` |
| LIMITES | Zero alteração de produto/prompts/modelos, Radar, migration, banco, Production ou OpenAI; sem commit/push/PR/merge/deploy. Métricas C1 continuam não apuradas |

## Registro pendente — JEV-S0

Data: 16/10/2026. Experimento próprio autorizado depois de Q0; preserva o histórico acima e não
substitui a Tabela Mestre canônica nem inicia Q1.

| Campo | Estado / evidência |
| --- | --- |
| FRENTE | JEV |
| CHECKPOINT | JEV-S0 |
| ESTADO | EXPERIMENTO ISOLADO |
| PASS/HOLD | PASS JEV-S0: execução correta do experimento, sem aprovação operacional do modelo |
| NÚMERO DE CASOS | 10 sintéticos, duas etapas independentes; 20 respostas reais JEV. Uma tentativa anterior falhou por DNS, preservada separadamente |
| ACESSO / MODELO | API oficial TypeSafe, Node nativo/fetch, credencial local exclusiva indicada pelo usuário; `jev-1.14.0` confirmado nas vinte respostas |
| RESULTADO | PROMISSOR PARA CONTINUAR TESTES; ação 10/10, veredicto 9/10, falsas aceitações 0/5, falsas rejeições 1/5, inconclusivos 0/10 |
| LIMITAÇÕES | Resposta parcial válida rejeitada; seleção histórica incompleta; motivos pouco discriminantes e ambiguidades no baseline auxiliar; amostra pequena, uma repetição |
| LATÊNCIA / USAGE | p50 265,19 ms; máximo 466,07 ms; entrada 72.721 / saída 8.907 tokens; estimativa US$ 0,0031, custo faturado não retornado |
| PRODUCTION | NÃO INTEGRADO |
| PRÓXIMO GATE | Revisão independente do baseline/dimensões e falhas; nova versão congelada, orçamento e autorização para outra rodada isolada. Sem integração, mudança de provider ou prompt |
| EVIDÊNCIA | [RELATORIO-JEV-S0.md](RELATORIO-JEV-S0.md); [harness](experiments/jev/README.md); resultados locais ignorados em `experiments/jev/results/real-1792191699709/` |
| PRESERVAÇÃO | Zero alteração de produto, banco, Production, Radar, rotas, OpenAI, dependências ou fixtures existentes; sem dado pessoal real, WhatsApp ou ação operacional; nenhum segredo novo persistido |
| DEMAIS GATES | M1c-F HOLD e Q1 NÃO INICIADO; STOP JEV-S0; sem commit/push/merge/PR/deploy |

## Registro pendente — IA-CONTRATOS-OFFLINE-00

Data: 16/10/2026. Acrescentado para consolidação manual na Tabela Mestre canônica da outra máquina; históricos IA-00/Q0 preservados. Não é segunda Tabela Mestre.

| Campo | Estado / evidência |
| --- | --- |
| FRENTE | IA |
| CHECKPOINT | IA-CONTRATOS-OFFLINE-00 |
| PASS/HOLD | PASS exclusivamente documental: contratos/lacunas/cobertura e matriz conferidos; nenhuma suite, caso ou integração executada |
| BASE | Referência local `0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883`; checkout `codex/b3-2-auditoria`, HEAD `366dc0f1b8c7ec5794d880de6f038b0698e25598`; sem fetch ou atualização Git |
| INVENTÁRIO | 36 contratos: 20 COBERTO, 9 PARCIAL, 7 NÃO COBERTO no recorte inspecionado; 12 casos conceituais e 14 mutantes propostos |
| LACUNAS P0 | O007/O008/O011: composição de retry de feedback sem novo envio, ação com resposta perdida sem novo efeito e isolamento de sessões/tenant. Risco de cobertura, não incidente comprovado |
| LACUNAS P1 | O001–O006/O009/O012: error.message legado, inicialização do logger, falhas de sugestão ativa, usage parcial, concorrência, persistência parcial e segunda geração falhando |
| LACUNAS P2 | O010: getters hostis artificiais de sucesso Chat; estudos de semântica dos IDs/modelo e durabilidade, sem autorização de mudança compartilhada |
| PRIVACIDADE | 12 pontos brutos de error.message em quatro arquivos; nenhum vazamento real observado. Detalhe genérico continua responsabilidade do emissor |
| PERSISTÊNCIA | U/E assíncronos independentes, sem retry/outbox/atomicidade conjunta; não fabricar consumo zero ou presumir rollback quando resposta se perde |
| COBERTURA M1c | A/D1 PARCIAL; B/C/D2/E1/E2 COBERTO no contrato offline principal, com composição de segunda geração B ainda parcial; feedback/ações fora de novo marco M1c |
| M1c-F | HOLD; C1/volume não apurados; limite temporal necessário em 19/10/2026 00:00 UTC não fecha baseline |
| Q1 | NÃO INICIADO / BLOQUEADO; contrato Q0 preservado |
| JEV | PLANEJADO / FRENTE NOVA, fora deste checkpoint |
| RADAR / CONFLITO | Zero alteração; novos caminhos fora do conjunto conhecido. Manifesto ativo da outra máquina indisponível. Registro/executor/sanitizador/infraestrutura e cadeia compartilhada exigem conferência de overlap antes de futura edição |
| PRÓXIMO GATE | Decisão humana sobre subconjunto de testes offline, manifesto isolado e base reconciliada; não abre Q1. Q1 segue dependente de fechamento formal M1c-F, revisão humana e overlap resolvido |
| CONTRATOS | [docs/IA_CONTRATOS_FALHA_PRIVACIDADE.md](docs/IA_CONTRATOS_FALHA_PRIVACIDADE.md) |
| MATRIZ | [IA_CONTRATOS_OFFLINE_MATRIZ.md](IA_CONTRATOS_OFFLINE_MATRIZ.md) |
| RELATÓRIO | [RELATORIO-IA-CONTRATOS-OFFLINE-00.md](RELATORIO-IA-CONTRATOS-OFFLINE-00.md) |
| LIMITES | Somente três documentos novos e este append; zero código de produto, Radar, migrations, banco, Production, OpenAI ou integração real. Sem commit/push/PR/merge/deploy. STOP |

## Registro pendente — JEV-S1

Data: 16/10/2026. Preparação offline própria, posterior a JEV-S0. Históricos anteriores preservados;
não é nova Tabela Mestre nem atualização retroativa das métricas S0.

| Campo | Estado / evidência |
| --- | --- |
| FRENTE | JEV |
| CHECKPOINT | JEV-S1 |
| PASS/HOLD | PASS JEV-S1: oráculo V2 pronto para novo experimento isolado; sem resultado novo de modelo |
| ORACLE V2 | Versão 2.0.0 congelada; action separado de decision completeness; dez campos decisórios + calibration independente; onze dimensões de validação |
| CASOS | 24 principais + cinco variantes adicionais de mutantes + um controle positivo = 30 inputs únicos; expectativas 14 APPROVE, 13 REJECT, três INCONCLUSIVE |
| PARES / MUTANTES | 22 pares mínimos; 11 mutantes selecionados, seis reutilizando casos principais; L1–L6 com histórico necessário explícito |
| MÉTRICAS | Action/campos/completude/verdict, FAR/FRR/inconclusão, seleção/recall/ruído histórico, dimensões, precisão de razões, consistência e confiança; denominadores/ausentes/erros separados |
| PRÓXIMO EXPERIMENTO | Proposta JEV-S2: 30 × três repetições × duas tarefas = 180 chamadas, mesmas entradas, sem seleção da melhor saída, retries ou regeneração; NÃO AUTORIZADO por S1 |
| CUSTO PROJETADO | Média S0: US$ 0,02749; proxy textual: US$ 0,11847; hipótese conservadora de contexto: US$ 0,49545. Teto proposto US$ 0,50, ainda não aprovado |
| VERIFICAÇÃO | 14 testes V2 e cinco S0 offline; 69 arquivos históricos S0 preservados por hash; métricas S0 intactas; nenhum transporte ou leitura de credencial |
| CHAMADAS S1 | Zero JEV, zero OpenAI; nenhum banco, Production, Radar ou WhatsApp |
| PRODUCTION | NÃO INTEGRADO |
| PRÓXIMO GATE | Revisão humana do oráculo/pares e autorização específica de orçamento/modelo/lote; adapter/parser V2 offline antes de qualquer execução real |
| EVIDÊNCIA | [RELATORIO-JEV-S1.md](RELATORIO-JEV-S1.md); [oráculo](experiments/jev/v2/oracle-v2.md); [plano](experiments/jev/v2/planned-run-v2.json); [freeze](experiments/jev/v2/freeze-v2.json) |
| PRESERVAÇÃO | Zero alteração do Angario, provider/prompts, web, banco, migration, Radar, Production ou dependências; M1c-F HOLD e Q1 NÃO INICIADO |
| GIT / STOP | Sem commit/push/merge/PR/deploy; STOP JEV-S1 |

## Registro pendente — JEV-S2-A

Data: 16/10/2026. Append de certificação offline; históricos S0/S1 e demais frentes preservados.

| Campo | Estado / evidência |
| --- | --- |
| FRENTE | JEV |
| CHECKPOINT | JEV-S2-A |
| PASS/HOLD | PASS exclusivamente offline: adapter/parser V2, normalização, scorer e preservação parcial certificados no contrato local |
| ADAPTER | Decision/validation separadas, enums fechados, parsing fail-closed, allowlist e JSON com detecção de duplicatas; sem transporte/ambiente/logger |
| PRIVACIDADE | 18 fixtures sintéticas nomeadas e variações hostis; extras, raciocínio livre, secrets e contexto descartados; nenhum dado real ou credencial lido |
| TESTES | 46 novos + 19 anteriores = 65 PASS; zero falhas; três responses S0 lidas como regressão de envelope sem alterar histórico |
| SCORER / HARD GATES | Erro estrutural separado de operacional/inconclusão; escolhas/razões sem correção semântica; falsas aprovações críticas continuam visíveis |
| PRESERVAÇÃO | 69 arquivos S0 e freeze S1 intactos; matriz/requests nos hashes anteriores; adapter-freeze próprio criado sem sobrescrever S1 |
| PLANO 180 | Identidades únicas e rotação exata conferidas; nenhum transporte executado; tentativa única/prefixo parcial/estados/HALTED testados em memória |
| JEV CALLS | 0 |
| OPENAI | 0 |
| REDE / CRÉDITOS | 0; nenhuma leitura de chave ou arquivo de ambiente |
| PRODUCTION | NÃO INTEGRADO |
| LIMITAÇÕES | Certificação pura não cobre executor real, persistência atômica, concorrência global, autenticação ou limites financeiros/contexto |
| PRÓXIMO GATE | JEV-S2-B somente após autorização humana explícita de chamadas reais, modelo, teto financeiro e total máximo; revisar executor/persistência/limites antes do lote |
| EVIDÊNCIA | [RELATORIO-JEV-S2-A.md](RELATORIO-JEV-S2-A.md); [contrato adapter](experiments/jev/v2/adapter-contract.md); [adapter-freeze](experiments/jev/v2/adapter-freeze.json) |
| PRESERVAÇÃO DE PRODUTO | Zero alteração Angario/web/provider/prompts/Radar/banco/migrations/Production; M1c-F HOLD e Q1 NÃO INICIADO |
| GIT / STOP | Sem commit/push/merge/PR/deploy; não executar S2-B; STOP JEV-S2-A |

## Registro pendente — JEV-S2-B

Data: 16/10/2026. Append do lote real V2 interrompido; históricos e freezes anteriores preservados.

| Campo | Estado / evidência |
| --- | --- |
| FRENTE | JEV |
| CHECKPOINT | JEV-S2-B |
| PASS/HOLD | HOLD — FAILED_STRUCTURAL / INVALID_PROBABILITIES na quarta chamada, V2-02/validation/1; nenhum retry/resume |
| RUN_ID | jev-s2b-1792195299496-15869859 |
| MODELO | jev-1.14.0 solicitado e observado nas quatro respostas |
| AUTORIZADO | Até 180 chamadas reais / US$ 0,50 total |
| EXECUTADO | Quatro chamadas iniciadas, três normalizadas, uma falha estrutural, zero falhas operacionais; 176 NOT_STARTED e zero IN_PROGRESS |
| PRE-GATES | Quatro hashes obrigatórios intactos; 65 testes certificados + sete testes de runtime PASS; preço oficial reconfirmado |
| PREÇO / CUSTO ESTIMADO | US$ 0,042/Mtok input, output gratuito; usage 8.656 entrada / 2.912 saída, conhecido em 4/4; custo US$ 0,000363552 ESTIMATED / BILLED_UNKNOWN |
| MÉTRICAS PARCIAIS | Action 2/2; completude 0/2; validation 1/1. False accept 0/0 não aplicável; false reject 0/1; sem evidência de robustez do lote |
| REPETIÇÕES / PARES / MUTANTES | Nenhum grupo completo de três repetições; 22 pares e 11 mutantes inconclusivos; negativos não alcançados |
| HARD GATE | Parada estrutural, não semântica; probabilidades inválidas sem detalhe por pergunta preservado. Não atribuir causa ao provider/modelo/parser sem evidência |
| DECISOR | INCONCLUSIVO |
| VALIDADOR | INCONCLUSIVO |
| PRODUCTION | NÃO INTEGRADO |
| RESULTADOS | Diretório durável exclusivo experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/; ledger, resumo e métricas parciais; nenhum metrics-final |
| PRIVACIDADE / PRESERVAÇÃO | Nenhuma chave em artefatos; raw somente hash; adapter/oráculo/scorer intactos; zero alteração Angario/web/OpenAI/banco/Radar/Production |
| PRÓXIMO GATE | HOLD: revisão offline de compatibilidade/parser e diagnóstico sanitizado. Nova execução/continuação somente por decisão humana; cota restante não autoriza resume automático |
| EVIDÊNCIA | [RELATORIO-JEV-S2-B.md](RELATORIO-JEV-S2-B.md); [summary parcial](experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/summary.json) |
| GIT / STOP | Sem commit/push/merge/PR/deploy; não integrar, não alterar OpenAI, não abrir Q1 nem tocar M1c-F; STOP JEV-S2-B |

## Registro pendente — JEV-S2-C

Data: 17/10/2026. Append de diagnóstico exclusivamente offline; histórico S2-B e freezes anteriores preservados.

| Campo | Estado / evidência |
| --- | --- |
| FRENTE | JEV |
| CHECKPOINT | JEV-S2-C |
| PASS/HOLD | PASS exclusivamente offline para compatibilidade e diagnóstico sanitizado |
| S2-B | HOLD PRESERVADO — 4 iniciadas, 3 normalizadas, 1 FAILED_STRUCTURAL / INVALID_PROBABILITIES, 176 não iniciadas |
| CAUSA HISTÓRICA | NÃO DETERMINADA / NÃO RECUPERÁVEL; raw da chamada 4 indisponível; nenhum subcódigo retroativo |
| CONTRATO | Tolerância absoluta 0,000001, valores finitos em [0,1], opções exatas, choice na máxima; sem relaxamento ou renormalização |
| DIAGNÓSTICO | Wrapper isolado; subcódigos específicos; categoria e resultado do parser congelado preservados; scorer intacto |
| TESTES | 72 anteriores + 85 novos = 157 PASS; 68 fixtures, 500 vetores adicionais, 20 responses S0 e 3 projeções válidas S2-B |
| PRIVACIDADE | 119 variantes, 51 adicionais em texto bruto, zero sentinelas nos retornos/relatórios persistíveis; getters e proxies tratados sem mensagens externas |
| PRESERVAÇÃO | S0/S1/S2-A, matriz/requests, 17 artefatos S2-B e lock intactos; freeze S2-C próprio; raw sensível não persistido |
| RAW FUTURO | Recomendação B + C: diagnóstico estrutural e projeção allowlisted com hash; criptografado/efêmero somente proposta |
| CALLS | 0 neste checkpoint |
| OPENAI / CRÉDITOS | 0 / 0; nenhuma leitura de chave ou ambiente |
| AUTORIZAÇÃO | S2-B authorization closed by HOLD; 176 não iniciadas não autorizam resume; lock preservado |
| PRODUCTION | NÃO INTEGRADO |
| NEXT GATE | Decisão humana após diagnóstico: A novo lote 180; B reduzido, exemplo 12; C probes 2–6; D encerrar; nenhuma opção executada |
| RECOMENDAÇÃO | Opção C para deliberação, com nova quantidade/custo/desenho explícitos; não reexecutar chamada 4 nem iniciar chamada 5/S3 |
| EVIDÊNCIA | [RELATORIO-JEV-S2-C.md](RELATORIO-JEV-S2-C.md); [contrato](experiments/jev/v2/probability-diagnostics/probability-contract.md); [compatibilidade](experiments/jev/v2/probability-diagnostics/compatibility-report.json); [privacidade](experiments/jev/v2/probability-diagnostics/privacy-report.json) |
| PRODUTO / GIT / STOP | Zero alteração Angario/web/banco/Radar/WhatsApp/Production; sem commit/push/merge/PR/deploy; STOP JEV-S2-C |

## Registro pendente — JEV-S2-D

Data: 17/10/2026. Append de probe real independente, exclusivamente diagnóstico; históricos e freezes anteriores preservados.

| Campo | Estado / evidência |
| --- | --- |
| FRENTE | JEV |
| CHECKPOINT | JEV-S2-D |
| PASS/HOLD | PASS DIAGNOSTIC; sem aprovação semântica do JEV |
| RUN_ID | jev-s2d-probdiag-1792253130113-4d03f514 |
| AUTORIZAÇÃO | 6 chamadas / jev-1.14.0 / US$0,05; autorização exclusiva deste probe, sem retry/resume |
| PROBES | P1 uma pergunta binária; P2 três perguntas de 2/3/4 opções; P3 doze perguntas de 2/3/4 opções; duas repetições de bytes idênticos por probe |
| EXECUTADAS | 6 iniciadas / 6 transportes completos / 6 STRUCTURALLY_VALID; 0 INVALID_PROBABILITIES, 0 structural unknown, 0 operational errors |
| MODELO | jev-1.14.0 solicitado e observado em 6/6 |
| PREÇO | Oficial reconfirmado 17/10/2026 15:59Z: US$0,042/Mtok input, output gratuito; 64k/request, 32k/pergunta; sem long-context |
| TOKENS | 5.398 entrada / 1.360 saída; usage conhecido 6/6; total_tokens não fornecido, sem fabricação |
| CUSTO ESTIMADO | US$0,000226716; BILLED_UNKNOWN; teto US$0,05 respeitado |
| LATÊNCIA | Min 240 ms / p50 289 ms / max 733 ms |
| PROBABILITIES | 32 vetores / 94 valores; option sets exatos, choices na máxima; somas 0.9999999999999999–1; maior delta absoluto 1.1102230246251565e-16; sem normalização |
| R1/R2 | Estrutura, sets, status, choices, máximas, modelos, usage e somas consistentes em P1/P2/P3; confidence variou nos três probes; nenhuma melhor repetição escolhida |
| SUBCÓDIGOS | Nenhum observado em rede; falhas classificadas e hard stops exercitados somente offline |
| TESTES | 157 anteriores + 31 novos = 188 PASS antes da rede; zero falhas; limites, budget, crash, atomicidade, privacidade e no auto-resume cobertos |
| PRIVACIDADE / RAW | Scan após cada stage e final; zero credencial/campo privado detectado; 19 artefatos finais; nenhum raw persistido, seis raw_sha256 preservados |
| S2-B | HOLD PRESERVADO: 4 iniciadas, 3 normalizadas, 1 falha estrutural, 176 NOT_STARTED; causa NÃO DETERMINADA / NÃO RECUPERÁVEL |
| PRESERVAÇÃO | Freezes S0/S1/S2-A/S2-C, matriz/requests/scorer/adapter/wrapper, run/ledger/authorization/lock S2-B intactos; lock próprio S2-D preservado |
| PRODUCTION | NÃO INTEGRADO |
| PRODUTO / OPENAI | Angario/web intocados; OpenAI 0 chamadas; banco/Radar/WhatsApp/Production não acessados |
| PRÓXIMO GATE | Decisão humana: encerrar, pequeno lote diagnóstico maior ou novo V2 completo do zero; nenhum inicia automaticamente |
| RECOMENDAÇÃO | Encerrar este probe; se houver continuidade, avaliar pequeno lote maior antes de lote completo, com nova quantidade/custo/desenho explícitos |
| EVIDÊNCIA | [RELATORIO-JEV-S2-D.md](RELATORIO-JEV-S2-D.md); [summary](experiments/jev/results/s2d-probdiag-jev-s2d-probdiag-1792253130113-4d03f514/summary.json); [comparação](experiments/jev/results/s2d-probdiag-jev-s2d-probdiag-1792253130113-4d03f514/repetition-comparison.json); [hashes](experiments/jev/results/s2d-probdiag-jev-s2d-probdiag-1792253130113-4d03f514/hashes.json) |
| GIT / STOP | Sem commit/push/merge/PR/deploy; não iniciar lote 12/180/S3/integração; STOP JEV-S2-D |

## Registro pendente — JEV-S2-E

Data: 17/10/2026. Append de lote diagnóstico semântico independente; nenhum histórico ou autorização anterior reutilizado.

| Campo | Estado / evidência |
| --- | --- |
| FRENTE | JEV |
| CHECKPOINT | JEV-S2-E |
| PASS/HOLD | PASS da execução; qualidade semântica avaliada separadamente |
| RUN_ID | jev-s2e-semantic-1792255143175-41551ba6 |
| AUTORIZAÇÃO | Máximo 12 chamadas / jev-1.14.0 / US$0,05, somente este novo lote |
| EXECUTADAS | 12 iniciadas / 12 transportes completos; 10 estruturalmente válidas; 2 INVALID_PROBABILITIES classificados; zero unknown estrutural/operacional |
| CENÁRIOS | E1_TEMPORAL, E2_ENTITY, E3_PARTIAL_INVENTION; DECISION e VALIDATION; duas repetições de bytes idênticos por tarefa; mini-oráculo e seis requests congelados antes da rede |
| MODELO | jev-1.14.0 solicitado/observado 12/12 |
| TOKENS / CUSTO | 27.366 entrada / 8.886 saída; US$0,001149372 ESTIMATED / BILLED_UNKNOWN; usage conhecido 12/12 |
| PREÇO | Reconfirmado oficialmente em 17/10/2026 16:32:41Z: US$0,042/Mtok input, output gratuito; 64k/request e 32k/pergunta; sem long-context |
| LATÊNCIA | Min 251 ms / p50 270,5 ms / max 449 ms |
| PROBABILITIES | 220 vetores, 602 valores; dois defeitos observados: soma 0.9900000000000001 em E1/V/R2 e choice NOT_APPLICABLE 0.47 abaixo de FAIL 0.48 em E2/V/R1; sem correção/renormalização |
| SUBCÓDIGOS | PROBABILITY_SUM_MISMATCH e PROBABILITY_CHOICE_MISMATCH; envelopes continuam inválidos, fora das métricas semânticas daqueles stages |
| DECISION | INCONCLUSIVO; action 6/6, completude 0/6, micro 48/60, entidade/fontes atuais 6/6, temporal 2/6, missing 4/6, prohibited 0/6 |
| VALIDATION | INCONCLUSIVO; verdict 4/4 válidos, temporal 1/4, cross_entity 0/4, demais nove dimensões 4/4; duas validações inválidas não pontuadas |
| EVENTOS CRÍTICOS | Zero false accept observado entre quatro validações válidas; false reject 0/0 não aplicável, pois não há candidata APPROVE neste desenho |
| R1/R2 | Quatro pares SEMANTIC_MATCH_WITH_CONFIDENCE_VARIATION; dois MATERIAL_DISAGREEMENT por diferença estrutural; sem escolha de melhor repetição ou majority vote |
| CONFIDENCE | Action 0,98–1; verdict válido 1; erros de campo também com confidence alta nativa, sem threshold operacional nem reclassificação |
| TESTES | 188 anteriores + 26 novos = 214 PASS antes da rede; zero falhas; mini-oráculo, limite 12, budget, crash, no auto-resume, privacidade e scorer preservados |
| PRIVACIDADE | Scan a cada stage e final, zero credencial/campo privado detectado; 29 artefatos finais e 28 hashes conferidos; 12 raw_sha256, nenhum raw persistido |
| S2-B | HOLD PRESERVADO: 4 iniciadas, 3 normalizadas, 1 FAILED_STRUCTURAL, 176 NOT_STARTED; causa NÃO DETERMINADA / NÃO RECUPERÁVEL; falhas novas não explicam retroativamente a antiga |
| S2-D | Fontes, seis chamadas, métricas, artefatos e locks intactos; autorização consumida não reutilizada |
| PRODUCTION | NÃO INTEGRADO |
| PRODUTO / OPENAI | Angario/web/provider intocados, OpenAI zero chamadas; banco/Production/Radar/WhatsApp não acessados |
| PRÓXIMO GATE | Decisão humana: A encerrar; B novo V2 completo do zero; C diagnóstico direcionado se houver interesse nas falhas concretas |
| RECOMENDAÇÃO | C para deliberação separada, com nova quantidade/custo/desenho; não iniciar S2-F/180/S3/integração/provider swap |
| EVIDÊNCIA | [RELATORIO-JEV-S2-E.md](RELATORIO-JEV-S2-E.md); [summary](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/summary.json); [decision](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/decision-metrics.json); [validation](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/validation-metrics.json); [erros](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/errors.json) |
| GIT / STOP | Sem commit/push/merge/PR/deploy; zero retry/regen/resume; STOP JEV-S2-E |

## Registro pendente — JEV-S2-F-A

Data: 17/10/2026. Append de desenho exclusivamente offline; nenhuma autorização ou execução real criada.

| Campo | Estado / evidência |
| --- | --- |
| FRENTE | JEV |
| CHECKPOINT | JEV-S2-F-A |
| PASS/HOLD | PASS exclusivamente OFFLINE para desenho e contratos locais |
| CHAMADAS | 0 JEV / 0 OpenAI / 0 rede / 0 créditos; nenhuma credencial ou ambiente lido |
| S2-E | PASS execução / DECISION INCONCLUSIVO / VALIDATION INCONCLUSIVO; 12 transportes, 10 válidos e dois defeitos estruturais preservados sem reinterpretação |
| FALHAS CONGELADAS | SUM_MISMATCH: soma 0.9900000000000001; CHOICE_MISMATCH: NOT_APPLICABLE 0.47 abaixo de FAIL 0.48; erros de campo com confidence 0.94/0.93 preservados |
| MATRIZ | Nove casos sintéticos, cinco pares mínimos auditados, um controle direcional B→A/A→B declarado; oráculo separado por campo/dimensão, sem probabilidades golden |
| CONTROLES POSITIVOS | T2/E2/P2 APPROVE; seis exposições futuras planejadas para false reject, oito negativas; inválidos futuros não recebem crédito semântico |
| QUANTIDADE PROPOSTA | 24 chamadas futuras: 12 requests únicos × 2 repetições; dez DECISION / quatorze VALIDATION; decisões de pares só de candidata deduplicadas |
| CUSTO HISTÓRICO | Projeção média 24 = US$0,002298744; reserva integral = US$0,066060288; preço S2-E somente referência, sem reconfirmação atual |
| TETO | 20/24 reservas integrais excedem o antigo US$0,05; quantidade e cap futuros dependem de decisão humana, sem importar autorizações antigas |
| MÉTRICAS | Estrutura/subcódigos, dez campos/completude, onze dimensões/verdict, false accept/false reject, história obrigatória, pares e R1/R2; confidence por pergunta sem threshold |
| LIMITES | Q4 só associação descritiva por tarefa/contagem, sem contraste causal isolado; duas repetições não demonstram sistematicidade/generalização |
| TESTES | 214 regressões anteriores + 34 novos = 248 PASS; freeze próprio, pares, positivo, denominadores, custos, não vazamento e preservação conferidos |
| S2-B | HOLD PRESERVADO: 4 iniciadas, 3 normalizadas, 1 FAILED_STRUCTURAL, 176 NOT_STARTED; causa NÃO DETERMINADA / NÃO RECUPERÁVEL |
| S2-D / S2-E | Fontes, mini-oráculo S2-E, requests, runs, ledgers, métricas, freezes, authorization e locks intactos; denominadores não combinados |
| PRODUCTION | NÃO INTEGRADO |
| PRODUTO / GIT | Angario/web/provider/OpenAI intocados; banco/Radar/WhatsApp/Production não acessados; sem commit/push/merge/PR/deploy |
| PRÓXIMO GATE | Decisão humana sobre S2-F-B: quantidade, teto, limites do desenho, preço atual e executor revisados antes de qualquer rede |
| EVIDÊNCIA | [RELATORIO-JEV-S2-F-A.md](RELATORIO-JEV-S2-F-A.md); [matriz](experiments/jev/s2f/diagnostic-matrix.json); [plano](experiments/jev/s2f/requests-plan.json); [métricas](experiments/jev/s2f/metrics-contract.md); [custos](experiments/jev/s2f/budget-projection.json) |
| STOP | Somente planejamento; nenhum run real, ledger, tentativa ou lock novo; não executar S2-F-B/180/S3/integração |


## JEV-S2-F-B — PASS EXECUTION

- FRENTE: JEV.
- CHECKPOINT: JEV-S2-F-B.
- RUN: jev-s2f-diagnostic-1792258267412-99056db2.
- AUTORIZAÇÃO: 24 chamadas; jev-1.14.0; US$0,08; finalidade diagnóstica exclusiva; nova autorização humana.
- EXECUTADAS: 24/24; DECISION 10; VALIDATION 14; modelo observado jev-1.14.0 em 24/24.
- CUSTO: estimado US$0,002235744; entrada 53.232, saída 17.218; cobrança efetiva desconhecida.
- REGRESSÃO: 248 anteriores + 44 novos = 292 PASS; zero FAIL; testes sem rede.
- ESTRUTURA: 24/24 válidas; SUM_MISMATCH 0/24; CHOICE_MISMATCH 0/24; operational/structural unknown 0; retry 0; raw persistido 0; privacy PASS.
- DECISION: NAO_PROMISSOR_DIAGNOSTICO; action 10/10; completude 2/10; temporal 4/10; prohibited 4/10; histórico obrigatório 4/4; erro material repetido de fonte null em H1.
- VALIDATION: INCONCLUSIVO; verdict 14/14; false accept 0/8; false reject 0/6; positivos 6/6; cross_entity 2/14; temporal/protocol 8/14; partial 14/14.
- PARES: 0/10 completos corretos, cobertura 10/10; R1/R2 12/12 semântica igual com variação de confiança; 20 eventos críticos.
- S2-B: HOLD preservado; 4 iniciadas/3 normalizadas/1 FAILED_STRUCTURAL/176 NOT_STARTED; causa NÃO DETERMINADA / NÃO RECUPERÁVEL.
- S2-D/E/F-A: hashes e listas intactos; plano aprovado sem alterações.
- PRODUCTION: NÃO INTEGRADO; Angario/web inalterados; OpenAI 0; Production/banco/Radar/WhatsApp não acessados.
- RELATÓRIO: [RELATORIO-JEV-S2-F-B.md](RELATORIO-JEV-S2-F-B.md).
- PRÓXIMO: decisão humana; investigar offline H1 e divergências dimensionais, sem nova execução paga automática. STOP.


## JEV-S2-G-A — PASS OFFLINE / CAPABILITY MAP

- FRENTE: JEV.
- CHECKPOINT: JEV-S2-G-A.
- TIPO: OFFLINE / CAPABILITY MAP.
- JEV CALLS: 0. OPENAI: 0. REDE: 0. CRÉDITOS: 0. CREDENCIAIS LIDAS: 0.
- REGRESSÃO: 292 anteriores PASS; 35 novos; suíte completa 327 PASS/0 FAIL, com bloqueio técnico de rede e zero tentativas.
- EVIDÊNCIAS: 54 registros, somente S0–S2-F-B; F-B com maior peso; métricas/oráculos históricos preservados.
- MAPA: 54 capacidades / 16 módulos; APTA_PARA_EXPERIMENTO_DE_PRODUTO 10; APTA_COM_GUARDA_DE_CODIGO 6; SOMENTE_ASSISTIVA 9; NAO_PROMOVER 6; NAO_AVALIADA 23.
- DECISION HISTÓRICO: NAO_PROMISSOR_DIAGNOSTICO. VALIDATION HISTÓRICO: INCONCLUSIVO.
- H1: erro operacionalmente material; null como atual/CURRENT_FACT indevido nas duas repetições.
- TAXONOMIA: 44 erros revistos sem mudar scores; 8 materiais, 14 semânticos, 12 de taxonomia, 10 de aplicabilidade.
- ARQUITETURA: shadow C como primeiro desenho recomendado; B como candidata híbrida eventual; nenhuma implementada.
- VISION: NAO_AVALIADA; benchmark próprio somente em gate futuro. Radar/follow-up/match específicos não avaliados.
- PRIORIDADE SUGERIDA: GUARD, ENTITY, TEMPORAL, FOLLOWUP, RADAR, MATCH, VISION. Guarda de fonte/tempo é pré-requisito antes de efeitos; escolha humana.
- PRODUCTION: NÃO INTEGRADO. ANGARIO: INALTERADO. web/schema/RLS/prompts intactos.
- HISTÓRICOS: S2-B HOLD preservado; S0/S1/S2-A/C/D/E/F-A/F-B, locks e runs intactos.
- RELATÓRIO: [RELATORIO-JEV-S2-G-A.md](RELATORIO-JEV-S2-G-A.md).
- PRÓXIMO: decisão humana sobre qual capability abrir como experimento; nenhuma frente iniciada. STOP.


## JEV-GUARD — G0 — PASS OFFLINE CONTRACT / BENCHMARK

- FRENTE: JEV-GUARD. CHECKPOINT: G0.
- TIPO: OFFLINE CONTRACT / BENCHMARK.
- JEV CALLS: 0. OPENAI: 0. REDE: 0. CRÉDITOS: 0. CREDENCIAIS: 0.
- CONTRATO: candidata validada em APPROVE/REJECT/INCONCLUSIVE; invalid → result null; verdict não autoriza efeito.
- BENCHMARK: 36 casos únicos; 12 APPROVE, 18 REJECT, 6 INCONCLUSIVE; 18 pares; 14 CRITICAL e quatro negativas ordinárias.
- CONTROLES: três parciais positivas, duas abstenções corretas, quatro estados de ausência, tempo/entidade/protocolos sintéticos e alegação de autorização inexistente.
- MÉTRICAS: verdict primário; false accept crítico/ordinário, false reject parcial/full, inconclusivos, estrutura e cobertura separados; dimensões diagnósticas secundárias.
- REGRESSÃO: 327 anteriores PASS + 74 novos = 401 PASS/0 FAIL; bloqueio técnico de rede, zero tentativas. MUTANTES: 11/11 mortos, zero sobreviventes.
- QUALIDADE JEV-GUARD: NÃO AVALIADA NESTE G0; fixtures não contam como resultados do modelo.
- HISTÓRICO: DECISION NAO_PROMISSOR_DIAGNOSTICO; VALIDATION INCONCLUSIVO; S0–S2-G-A byte-idênticos, S2-B HOLD preservado.
- PRODUCTION: NÃO INTEGRADO. ANGARIO: INALTERADO. web/schema/RLS/prompts/provider intactos.
- SHADOW: somente desenho SHADOW_ONLY; REAL_SHADOW não autorizado.
- PROPOSTA G1: 36 casos ×1, somente validation; zero chamadas/teto autorizados neste G0; nova autorização humana/preço/executor/persistência/privacy obrigatórios.
- RELATÓRIO: [RELATORIO-JEV-GUARD-G0.md](RELATORIO-JEV-GUARD-G0.md).
- PRÓXIMO: decisão humana sobre G1. Nenhuma execução, feature flag ou integração iniciada. STOP.


## JEV-GUARD — G1 — PASS EXECUTION / NAO_PROMISSOR_DIAGNOSTICO

- FRENTE: JEV-GUARD. CHECKPOINT: G1. TIPO: SYNTHETIC_BENCHMARK real isolado.
- RUN: jev-guard-g1-1792269758441-39438172. MODELO: jev-1.14.0 observado 36/36. VALIDATION somente, uma repetição, concorrência 1.
- AUTORIZAÇÃO: 36 chamadas, teto TOTAL US$ 0,12; zero retry, integração e dados reais. CHAMADAS: 36/36; não iniciadas 0.
- REGRESSÃO: 401 base PASS; 57 novos; suíte conjunta 458 PASS/0 FAIL antes da rede, zero tentativas de rede em testes.
- PREÇO: US$ 0,042/M entrada; saída gratuita; TypeSafe oficial reconfirmado. USAGE: 90.649 input / 22.119 output; total_tokens não fornecido. CUSTO ESTIMADO: US$ 0,003807258; margem US$ 0,116192742; BILLED_UNKNOWN.
- LATÊNCIA HTTP: min 225 / p50 245 / p95 259,25 / max 465 ms, apenas este lote.
- ESTRUTURA: 24 válidos/36, 12 INVALID_RESPONSE (10 SUM_MISMATCH, 2 CHOICE_MISMATCH); zero operacionais/unknown. Inválidos result=null, fora de toda semântica.
- VERDICT: 21/24 (87,50%); positivos válidos 10/12, negativos 11/18, inconclusivos 3/6, críticos 8/14.
- FALSE ACCEPT: 1/11; CRITICAL 0/8; ordinário 1/3 em GG0-29. FALSE REJECT: 0/10, parcial 0/1, full 0/9.
- INCONCLUSIVE: 1/3 correto, unsafe APPROVE 0/3, overreject 2/3 (GG0-32/36).
- PARES: 7 PASS, 1 FAIL, 10 INCONCLUSIVE; acerto 7/8, cobertura 8/18.
- DIMENSÕES: grounding 23/24; factuality 22/24; entity 24/24; temporal 16/24; protocol 17/24; coverage 21/24; omission 19/24; unsupported 22/24; cross_entity 8/24; partial 19/24; safety 24/24.
- CONFIDENCE: nativa por pergunta, observacional, sem threshold/retry/seleção; erros macro 0,35/0,56/0,69.
- PRIVACY: PASS; zero raw/credential/Authorization/contexto retornado/reasoning/debug/dado real persistido. OPENAI: 0.
- HISTÓRICO: 228 arquivos diretos + hashes transitivos e 769 do produto intactos; G0/parser/wrapper/scorer/oráculo imutáveis; S2-B HOLD e causa histórica não determinada preservados.
- ANGARIO/web/schema/RLS/prompts Production: INALTERADOS; nenhuma flag, endpoint de produto, worker, UI ou integração.
- QUALIDADE: NAO_PROMISSOR_DIAGNOSTICO pelo false accept ordinário, sem mudar critério/materialidade; cobertura parcial impede generalização. PASS de execução é independente da qualidade.
- RELATÓRIO: [RELATORIO-JEV-GUARD-G1.md](RELATORIO-JEV-GUARD-G1.md).
- PRÓXIMO RECOMENDADO: análise offline dos artefatos e eventual novo desenho somente por decisão humana; sem REAL_SHADOW, dados reais, integração ou execução adicional. STOP.


## JEV-GUARD — G2-A — PASS OFFLINE FAILURE ANALYSIS

- FRENTE: JEV-GUARD. CHECKPOINT: G2-A. TIPO: OFFLINE FAILURE ANALYSIS.
- G1: PASS EXECUTION / NAO_PROMISSOR_DIAGNOSTICO; run jev-guard-g1-1792269758441-39438172 intacto.
- REGRESSÃO: 458 históricos PASS; 46 novos; suíte conjunta 504 PASS/0 FAIL; 11/11 mutantes mortos. Bloqueio técnico de rede, zero tentativas.
- ESTRUTURA G1: 12/36 inválidos, cada um com uma pergunta falha; 10 SUM ~0,99 e 2 CHOICE com margem ~0,01. Mecanismo interno do provider não determinável dos artefatos sanitizados.
- LOCALIZAÇÃO: factuality 3; coverage/partial_answer_allowed/safety 2 cada; cross_entity/temporal/verdict 1 cada; demais 0.
- MACRO DIAGNÓSTICO: 11/12 inválidos dimensionais com verdict local aceitável; nenhuma recuperação semântica. Taxa por pergunta macro 1/36 = dimensional 11/396 = 2,78%, sem causalidade atribuída.
- GG0-29: MACRO_GUARD_FAILURE; expected REJECT / observed APPROVE / confidence 0,35; omission=FAIL não reclassifica verdict nem apaga a falha.
- CRÍTICOS: 14 planejados, oito válidos, seis inválidos; false accept 0/8, nunca 0/14.
- INCONCLUSIVOS: GG0-33 correto; GG0-32/36 overreject; 1/3 válido correto; sem mudança de oracle.
- DIMENSÕES: scores intactos; safety 24/24 só expected PASS; 16 erros cross_entity são PASS→NOT_APPLICABLE. Diagnóstico/eval separável do Guard macro, sem promoção.
- CONCLUSÃO B: REDUCED_CONTRACT_EXPERIMENT_JUSTIFIED; HYPOTHESIS_REQUIRES_EXPERIMENT, sem arquitetura adotada automaticamente.
- PROPOSTA G2-B: mesmos 36 casos FULL versus VERDICT_ONLY, duas amostras novas pareadas por caso; 72 chamadas propostas, ZERO autorizadas/executadas. Nenhum request futuro persistido ou namespace/executor G2-B criado.
- JEV: 0 calls. OPENAI: 0. REDE: 0. CRÉDITOS: 0. CREDENCIAIS: 0.
- ANGARIO/web/schema/RLS/prompts Production: INALTERADOS; zero integração, flags, endpoints, UI ou shadow.
- HISTÓRICO: 300 arquivos diretos + verificações transitivas e 769 arquivos do produto preservados; G0/G1/parser/wrapper/scorer/oracle/locks/runs/reports intactos.
- RELATÓRIO: [RELATORIO-JEV-GUARD-G2-A.md](RELATORIO-JEV-GUARD-G2-A.md).
- PRÓXIMO: decisão humana sobre proposta ou encerramento; nenhuma execução automática. STOP.


## JEV-GUARD — G2-B0 — PASS OFFLINE PAIRED EXPERIMENT FREEZE

- FRENTE: JEV-GUARD. CHECKPOINT: G2-B0. TIPO: OFFLINE PAIRED EXPERIMENT FREEZE.
- G2-A: REDUCED_CONTRACT_EXPERIMENT_JUSTIFIED; não demonstrou superioridade. G1: PASS EXECUTION / NAO_PROMISSOR_DIAGNOSTICO intacto.
- REGRESSÃO: 504 históricos PASS antes de fontes B0; 151 novos; suíte final 655 PASS/0 FAIL; 20/20 mutantes mortos. Barreira técnica de rede, zero tentativas.
- CASOS: mesmos 36, 12/18/6 expected, 14 críticos, quatro ordinários, 18 pares mínimos. GG0-29 intacto, expected REJECT, histórico MACRO_GUARD_FAILURE.
- BRAÇOS: FULL com 12 perguntas byte-idêntico ao G0; REDUCED com uma pergunta verdict idêntica. Única diferença questions, provada nos 36 pares; 72 payloads/body/SHA256 congelados, zero oracle leak.
- ORDEM: pares adjacentes GG0-01→36; ímpares FULL→REDUCED, pares REDUCED→FULL; concorrência 1. Dois braços novos, nunca G1 como controle.
- COMPONENTES: adapter REDUCED novo e puro; FULL/parser/wrapper históricos fail-closed preservados; novo macro scorer equivalente ao G0; paired scorer com quatro estados estruturais/cinco semânticos. Dimensões REDUCED=NOT_COLLECTED.
- COMPARAÇÃO: REDUCED_FAVORED/FULL_FAVORED/NO_CLEAR_WINNER/COMPARISON_INCONCLUSIVE; gate prévio >=30 pares válidos e todas as sentinelas; estrutura não compensa piora material. Nenhum desempenho ou vencedor observado.
- MÉTRICAS: por braço e par com denominadores explícitos, GG0-29, 14 críticos, seis inconclusivos, 12 positivos/três parciais; custos/tokens/latência preparados, NOT_RUN.
- CALLS: 0. FUTURO PROPOSTO: 72. MODELO PROPOSTO: jev-1.14.0. AUTORIZAÇÃO REAL: NÃO CONCEDIDA.
- BUDGET: cenário histórico conservador US$ 0,198180864; sugestão futura US$ 0,25, sujeita a preço atual e nova autorização. Cap/calls autorizados atuais: zero.
- OPENAI/REDE/CRÉDITOS/CREDENCIAIS: 0. Nenhum preço online, health check, probe, warm-up, retry ou executor de rede.
- HISTÓRICOS: 330 arquivos diretos + hashes/listas transitivos e 769 arquivos do produto intactos.
- ANGARIO/web/schema/RLS/prompts Production: INALTERADOS; nenhuma flag, endpoint, worker, UI, DB, cron, queue, shadow ou integração.
- RELATÓRIO: [RELATORIO-JEV-GUARD-G2-B0.md](RELATORIO-JEV-GUARD-G2-B0.md).
- PRÓXIMO: decisão humana sobre G2-B real, com autorização/preço/executor/locks/budget/pre-HTTP/privacy próprios. NÃO iniciar. STOP.


## JEV-GUARD — G2-B — REAL PAIRED EXPERIMENT

- FRENTE: JEV-GUARD. CHECKPOINT: JEV-GUARD-G2-B. TIPO: REAL PAIRED EXPERIMENT.
- RUN: jev-guard-g2b-1792280596715-d49a4dc0; dois braços contemporâneos novos, 36 casos cada; G1 não é controle.
- CALLS: 72/72 autorizadas, iniciadas e transportes concluídos; 0 não iniciadas/IN_PROGRESS/operacionais; concorrência 1, R1, zero retry/warm-up/extra. Autorização CLOSED, saldo 0, sem reutilização.
- MODEL: jev-1.14.0 solicitado/observado 72/72. CAP: US$ 0,25. PREÇO: fonte oficial TypeSafe reconfirmada 2026-10-17T23:28:39.919Z, input US$ 0,042/M, output gratuito. Reserva inicial US$ 0,198180864. Custo estimado US$ 0,005957364; BILLED_UNKNOWN.
- EXECUTION: PASS / COMPLETED. FULL: NAO_PROMISSOR_DIAGNOSTICO. REDUCED: NAO_PROMISSOR_DIAGNOSTICO. COMPARATIVE: COMPARISON_INCONCLUSIVE.
- REGRESSÃO: 655 históricos PASS, 58 novos, conjunta 713 PASS/0 FAIL; após freeze 209 aplicáveis PASS/0 FAIL, zero tentativas de rede. B0 20/20 mutantes mortos preservados.
- FREEZE: dez fontes do executor e 38 entradas B0 intactas; 72 bodies/SHA256 e ordem congelados; equivalência questions-only e zero oracle leak.
- ESTRUTURA: FULL 32 válidos/4 inválidos (GG0-14/22/24/36, PROBABILITY_SUM_MISMATCH); REDUCED 36 válidos/0 inválidos, dimensions=NOT_COLLECTED. Sem recuperar semântica FULL inválida.
- MACRO: FULL 28/32, REDUCED 31/36; nos 32 BOTH_VALID, verdicts concordam 32/32, 28 acertos e quatro erros comuns. False accept GG0-29 em ambos (1/4 ordinários); críticos 0/11 FULL e 0/14 REDUCED; false reject 0/12 ambos.
- SENTINELAS: GG0-29 APPROVE/APPROVE, expected REJECT, falha persiste; críticos BOTH_VALID 11/14, inconclusivos 5/6, parciais positivas 3/3 corretas. Overreject INCONCLUSIVE 3/5 FULL, 4/6 REDUCED; unsafe APPROVE 0/5 e 0/6.
- COMPARAÇÃO: 32/36 BOTH_VALID passa mínimo30, mas três críticos e um inconclusivo sem FULL válido impedem conclusão. material_worse pareado vazio; novo erro REDUCED GG0-36 com FULL inválido, sem prova de regressão pareada. Nenhum vencedor ou superioridade geral.
- PARES MÍNIMOS: FULL 14 PASS/1 FAIL/3 INCONCLUSIVE; REDUCED 17 PASS/1 FAIL/0 INCONCLUSIVE, denominador18 por braço.
- TOKENS: input90649/output22106 FULL; input51193/output1730 REDUCED; total input141842/output23836; total_tokens=null. Latência p50/p95 FULL261/290ms, REDUCED252,5/280ms; delta pareado p50−7ms, descritivo. Todos os inválidos FULL em pares/segunda posição: limitação de ordem e conteúdo, sem causalidade atribuída.
- PRIVACY: PASS, raw transitório, zero chave/raw/contexto retornado persistido; estado durável pré-HTTP e locks verificados. fsync de diretório indisponível no Windows declarado nos recibos.
- HISTÓRICOS: 369 arquivos diretos, 13 listas e verificações transitivas +769 produto preservados. G1 negativo, G2-A e HOLD S2-B mantidos. Propagação somente APPEND, prefixo histórico preservado por hash.
- ANGARIO: INALTERADO. web/schema/RLS/prompts Production: INALTERADOS. PRODUCTION: NÃO ACESSADA. OpenAI/banco/Radar/WhatsApp: 0 acesso/chamadas. Zero integração, shadow, flag, endpoint, UI, deploy ou ação Git.
- RELATÓRIO: [RELATORIO-JEV-GUARD-G2-B.md](RELATORIO-JEV-GUARD-G2-B.md).
- PRÓXIMO GATE: revisão humana offline, sem novo lote ou integração. Autorização encerrada. STOP.


## JEV-GUARD — G2-C-A — OFFLINE FAILURE DECOMPOSITION

- FRENTE: JEV-GUARD. CHECKPOINT: JEV-GUARD-G2-C-A. TIPO: OFFLINE FAILURE DECOMPOSITION.
- JEV CALLS:0. OPENAI:0. REDE:0. CRÉDITOS:0. CREDENCIAIS:0. Nenhum preço atual, raw ou reasoning reconstruído.
- G2-B EXECUTION: PASS/COMPLETED, run jev-guard-g2b-1792280596715-d49a4dc0 intacto. FULL: NAO_PROMISSOR_DIAGNOSTICO. REDUCED: NAO_PROMISSOR_DIAGNOSTICO. COMPARISON: COMPARISON_INCONCLUSIVE. Autorização CLOSED, chamadas reutilizáveis0.
- GG0-29: MACRO_GUARD_FAILURE APPROVE/APPROVE expectedREJECT mantida. FULL omission=FAIL detecta ressalva material; coverage=INCONCLUSIVE erra FAIL;9/11 dimensões corretas. Contrafactual documental DIMENSIONS_SUPPORT_REJECT. Primary MULTIPLE_CONTRIBUTORS: inconsistência de agregação observada + erro dimensional, sem mecanismo interno conhecido nem causa exclusiva.
- INCONCLUSIVOS:31/32/35 overreject nos dois, combinando sinais corretos de incerteza com FAIL espúrios;33/34 controles corretos apesar de erros dimensionais;36 FULL inválido sem semântica, REDUCED overreject. INCONCLUSIVE_CALIBRATION_FAILURE observável, mecanismo interno UNDETERMINED.
- FULL INVÁLIDOS:14 partial_answer_allowed,22 omission,24 factuality,36 unsupported_assumption; todos SUM~0,99. Superfície dimensional adicional observada, não causalidade geral. Quatro em pares/FULL segundo: DESCRIPTIVE ASSOCIATION ONLY.
- DIMENSÕES:32 FULL elegíveis,352 observações,274 corretas/78 erradas;3 casos macro+dimensões integralmente corretos;25 macro corretos com erro dimensional;4 macro errados (1 suporte ao expected,3 mistos). Nenhum inválido recuperado.
- STRUCTURAL: REDUCED_STRUCTURAL_ADVANTAGE_OBSERVED,36/36 versus32/36. SEMANTIC_ADVANTAGE: NOT_DEMONSTRATED. Agreement32/32 STRONG_DESCRIPTIVE_SIGNAL, sem36/36 ou superioridade universal. EFFICIENCY_ADVANTAGE_OBSERVED só no run histórico. Críticos0/11 FULL e0/14 REDUCED; parciais positivas3/3 ambos.
- GMP-17:04×29 retira só ressalva comercial; expectedAPPROVE→REJECT, observadoAPPROVE→APPROVE nos dois. Dimensão omission muda corretamente, macro não.
- ORACLE/PROMPT: auditados sem mutation. GG29 claramente sustentado;31/32/35/36 supported-with-ambiguity de redação, expected preservado. Regra de ressalva e REJECT×INCONCLUSIVE já existem; saliência/consistência são hipóteses, não gap causal provado. Nenhum prompt novo.
- DIMENSIONS CURRENT ROLE: E (diagnóstico offline + telemetria descritiva com erros + superfície estrutural adicional). Controle necessário para decisão não demonstrado.
- REGRESSÃO:713 históricos PASS antes de fontes;43 novos PASS na última execução;0 FAIL finais;12/12 mutantes mortos. Execuções separadas, não rerun conjunto756. Barreira de rede.
- HISTÓRICOS:486 arquivos diretos,769 produto e15 listas intactos. G0/G1/G2-A/B0/B, S0–S2, parser/wrapper/adapters/scorers/oracles, locks/runs/reports/autorização preservados. Propagação apenas APPEND.
- ANGARIO: INALTERADO. web/schema/RLS/prompts Production: INALTERADOS. PRODUCTION/DB/Radar/WhatsApp:0 acesso. Zero integração, flag, endpoint, shadow, deploy ou ação Git.
- RELATÓRIO: [RELATORIO-JEV-GUARD-G2-C-A.md](RELATORIO-JEV-GUARD-G2-C-A.md).
- PRÓXIMO GATE RECOMENDADO: revisão humana; se continuidade, somente desenho offline A+B+E com controles, sem implementar guard, redigir prompt ou iniciar G2-C-B. AlternativaF (não prosseguir) preservada. STOP.


## JEV-GUARD — G2-C-B0 — DESENHO HÍBRIDO A+B+E

- FRENTE: JEV-GUARD. CHECKPOINT: JEV-GUARD-G2-C-B0. TIPO: OFFLINE HYBRID DESIGN A+B+E.
- DESENHO: INCONCLUSIVO. RECOMENDAÇÃO: HOLD para provider e implementação. Auditoria documental PASS; nenhum próximo gate iniciado.
- HERANÇA: G2-B PASS/COMPLETED, FULL eREDUCED NAO_PROMISSOR_DIAGNOSTICO, COMPARISON_INCONCLUSIVE, autorizaçãoCLOSED/reutilização0. G2-C-A PASS offline;GG29 MULTIPLE_CONTRIBUTORS, agregação observável+erro dimensional coexistente;calibração inconclusiva e superfície estrutural preservadas. Vantagem semântica/necessidade11 dimensões/gap de prompt principal não demonstrados; mecanismo internoUNDETERMINED.
- CONTRATO: A obrigações/ressalvas;B REJECT por prova independente, INCONCLUSIVE sem prova suficiente e evidência não resolvida, APPROVE somente com candidata inteira verificada;E estados literais com proveniência. HOLD/STOP são disposições, não novos verdicts.
- OBSERVABILIDADE:10 famílias de estados literais copiáveis;6 famílias semânticas requerem representação/verificação ainda ausente. Pergunta e candidata livres não trazem slots/assertions/caveats estruturados. Annotation humana retrospectiva não é extrator determinístico.
- REPLAY:36 casos congelados,12 positivos,18 negativos/14 críticos,6 inconclusivos;GG04/11/12/29 eGMP17 preservados. Leitura humana condicional distingue os rótulos36/36, assistida pelo oracle, sem medir qualidade de máquina. Camada literal sem representação:HOLD36/36, verdicts0;12/12 positivas,3/3 parciais e14/14 críticos adiados. Não contar como sucesso.
- FALSE BLOCK:UNCONFIRMED global atingiria10/12 positivas, incluindo04/11/12;critério por frase também rejeitado. Semântica faltante não viraMISSING_VERIFIED ouFALSE.
- FALSE ALLOW:parte verdadeira/ressalva isolada/confidence/provider não aprovam candidata inteira;violações comprovadas mantêm prioridadeREJECT. Taxas reais de false block/allow não medidas(null), pois nenhum guard existe.
- GO/HOLD/STOP:fonte semântica verificável36/36 semoracle,0 falseREJECT/adiamento em12 positivas/3 parciais,GG29 comprovado sem frase,14/14 críticos,6/6 inconclusivos e avaliação independente antes de reconsiderar provider. Não satisfeitos pelo replay anotado.
- TESTES:314 históricos direcionados PASS antes de artefatos;50 novos PASS;0 FAIL/0 skipped. Execuções separadas, sem rerun alegado dos756 anteriores.22/22 mutantes documentais mortos, somente cópias em memória;barreira offline.
- PRESERVAÇÃO:524 arquivos históricos,769 produto,16 listas intactos. G2-B/G2-C-A/corpus/oracle/scorers/parser/adapters/métricas/locks/autorização e histórico da Tabela Mestre mantidos;APPEND somente.
- JEV/OPENAI/REDE/CRÉDITOS/CREDENCIAIS/PRODUCTION/DB/WHATSAPP/RADAR:0. ANGARIO/web/schema/RLS/UI/workers/endpoints/prompts Production:INALTERADOS. Nenhum guard,extrator,prompt,request,G3,lote,integração,deploy ou ação Git de escrita.
- OPÇÃO F:não prosseguir é mais defensável para nenhum gasto/integração agora;abandono definitivo depende de decisão humana.
- RELATÓRIO:[RELATORIO-JEV-GUARD-G2-C-B0.md](RELATORIO-JEV-GUARD-G2-C-B0.md).
- PRÓXIMO POSSÍVEL:somente revisão humana e eventual proposta de auditoria offline da observabilidade/representação sob novo escopo. Não iniciado. STOP.


## JEV-GUARD — G2-C-B1 — SEMANTIC OBSERVABILITY AUDIT DESIGN

- FRENTE: JEV-GUARD. CHECKPOINT: JEV-GUARD-G2-C-B1. Somente auditoria e desenho documental offline.
- B0 PRESERVADO: INCONCLUSIVO / HOLD para provider e implementação; replay36/36, 14 críticos, UNCONFIRMED global atingiria10/12 positivos, cenário literal HOLD36/36 com12 positivos/3 parciais adiados. Não são medições novas.
- B1: OBSERVABILITY_INCONCLUSIVE / HOLD. As seis famílias semânticas continuam sem certificação operacional independente; completude de linguagem livre não demonstrada.
- DESENHO: mapa6×20 perguntas; matriz de observabilidade; H1–H5 em18 eixos; contrato humano futuro e representação controlada conceitual; todos36 controles, GG04×29/GMP17, GG11/12, seis inconclusivos e14 críticos. H5/F permanece alternativa legítima.
- PROVENIÊNCIA: annotations retrospectivas ORACLE_ASSISTED_ONLY. Rótulo legado MANUAL_RETROSPECTIVE_REVIEW preservado, sem alegar certificado humano independente. Codex é autor documental, não revisor humano.
- COMPLETUDE: cobertura de caracteres não prova enumeração semântica. MISSING_VERIFIED só com inspeção integral; sem evidência, UNKNOWN. Quatro estados de inspeção preservam a matriz B0 sem alterar linhas.
- HERANÇA: FULL/REDUCED NAO_PROMISSOR_DIAGNOSTICO; COMPARISON_INCONCLUSIVE; GG29 false accept histórico; quatro FULL inválidos preservados. G2-C-A PASS OFFLINE/MULTIPLE_CONTRIBUTORS; vantagem semântica, necessidade11 dimensões e prompt gap principal não demonstrados; mecanismo UNDETERMINED.
- TESTES: baseline histórico direcionado364 PASS; B1 documental39 PASS, zero falhas/skipped. Mutantes documentais26 executados/rejeitados, zero sobreviventes/PLANNED, baseline real e cópias em memória. Não medem desempenho semântico.
- PRESERVAÇÃO:551 históricos (incluem524 do B0 mais26 artefatos B0 e relatório),769 produto e17 listas intactos. APPEND somente; prefixo anterior53687 bytes preservado por hash. Sem segunda Tabela Mestre, novo ID ou alterações em Radar/CON-09/outras frentes.
- MÉTRICAS B1: false block/allow, accuracy, precision, recall, F1, ganho, custo, latência, melhoria de provider e concordância humana=null/NOT_MEASURED.
- AUTORIZAÇÃO: CLOSED, reutilização0. Nenhum provider autorizado. Nenhuma implementação autorizada. JEV/OpenAI/rede/requests externas/APIs/créditos/secrets/credenciais/Production:0.
- EXECUÇÃO SEMÂNTICA: nenhuma revisão humana, validação cega, pacote cego, dataset novo, guard, extrator, schema, prompt operacional ou geração. Angario/web/RLS/UI/workers/endpoints/banco/pipeline: inalterados.
- RELATÓRIO: [RELATORIO-JEV-GUARD-G2-C-B1.md](RELATORIO-JEV-GUARD-G2-C-B1.md).
- PRÓXIMO ÚNICO POSSÍVEL: revisão independente da elegibilidade e do protocolo de observabilidade, apenas se solicitada; sem ID novo e não iniciada. Não abrir provider, implementação ou G3. STOP.
