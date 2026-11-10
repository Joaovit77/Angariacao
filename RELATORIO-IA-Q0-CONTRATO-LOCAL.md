# Relatório — IA-Q0-CONTRATO-LOCAL

Data: 16/10/2026, America/Sao_Paulo. Responsável: Codex.

Decisão: **PASS IA-Q0-CONTRATO-LOCAL — exclusivamente documental**. Contrato e matriz criados, conferidos e limitados ao escopo autorizado. IA-M1c-F permanece **HOLD**; Q1 permanece **NÃO INICIADO**. PASS Q0 não certifica qualidade atual do modelo ou funcionamento real do produto.

## 1. Autorização, base e manifesto prévio

O usuário autorizou Q0 hoje como preparação documental/offline, apesar do gate temporal de M1c-F ainda aberto. Proibiu produto, prompts/modelos, Radar, PROJECT, schema/migrations, embeddings/comparáveis, banco remoto, Production, OpenAI, benchmark e integração Git/deploy. A atualização da propagação pendente é a única exceção expressa à preservação de documentos preexistentes.

Checkout: `C:/Users/ciria/Desktop/sistema-angariação/Angariação`; branch `codex/b3-2-auditoria`; HEAD `366dc0f1b8c7ec5794d880de6f038b0698e25598`. Referência local de código: `origin/main` em `0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883`, 73 commits à frente. Não houve fetch, troca de branch, reset, rebase, merge, stash, clean nem worktree novo. Não se implementou produto sobre a branch antiga.

Antes de escrever, caminhos foram anunciados e verificados:

| Caminho | Estado antes de Q0 | Operação autorizada | Overlap conhecido |
| --- | --- | --- | --- |
| `docs/IA_QUALIDADE_EVALS_CONTRATO.md` | Inexistente no checkout e árvore da referência | Criar documento exclusivo | Não aparece no conjunto Radar local conhecido |
| `IA_Q0_MATRIZ_CASOS.md` | Inexistente no checkout e árvore da referência | Criar documento exclusivo | Sem vínculo Radar identificado |
| `RELATORIO-IA-Q0-CONTRATO-LOCAL.md` | Inexistente no checkout e árvore da referência | Criar relatório exclusivo | Sem vínculo Radar identificado |
| `PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md` | Existente, untracked da IA-00 | Acrescentar registro Q0 preservando histórico | Atualização explícita do usuário |

Não existe evidência de conflito no caminho novo em `docs/`; o diff de objetos da branch Radar conhecida contém PROJECT, schema, migration R6.1 e seu teste, nenhum destes destinos. Por isso foi usado o caminho principal solicitado. A lista de alterações não commitadas da outra máquina continua indisponível; não se certifica ausência global de concorrência. Nenhum arquivo compartilhado foi necessário para escrita. Se aparecer overlap novo, a parte afetada fica HOLD, sem editar a fonte concorrente.

Estado inicial: somente relatório IA-00 e propagação pendente estavam untracked; nenhum arquivo rastreado modificado. O relatório IA-00 foi preservado, com SHA-256 inicial `062AECCDCF8FA6B3D2ACF2C423AD5222EE71E518BC7DB21E44C0083F67A07377` para conferência final. Ponto de rollback de produto permanece o HEAD original; a entrega contém somente documentação local e complemento autorizado de propagação.

## 2. Fontes utilizadas sem repetir auditoria

- [Relatório IA-00](RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md), especialmente arquitetura F3, testes, lacunas, concorrência e gate M1c-F.
- [IA-AMBIENTES](docs/IA-AMBIENTES.md), política vigente de bloqueio Codex/CI/Preview e ensaios reais manuais.
- Objetos Git na referência local: `web/tests/fixtures/atendimento-semantico.ts`, `ia-atendimento-oito-casos.test.ts`, `ia-atendimento-evidencia-temporal.test.ts`, `ia-atendimento-contrato-auditor.test.ts`, trechos de `ia-atendimento-robustez.test.ts` e `web/lib/ia/atendimento/validacao.ts`.
- Runner manual do auditor lido estaticamente para delimitar cobertura; nunca executado/importado como programa.
- Instruções do projeto já lidas na IA-00 e skill de documentação técnica, aplicada somente à organização dos documentos.

O inventário não reconsulta Production, Supabase, providers ou conversas. Informação não apurada continua não apurada. Nenhuma chave, env, dado pessoal ou conversa privada foi usada.

## 3. Entregáveis e conteúdo

- [Contrato formal](docs/IA_QUALIDADE_EVALS_CONTRATO.md): nove etapas do F3, fronteiras F1/F2/F10/F13, taxonomia, hard gates/soft scores, métricas com denominadores, formato de dataset, privacidade, replay versus eval real, família longa, falhas operacionais, mutantes e gates.
- [Matriz de casos](IA_Q0_MATRIZ_CASOS.md): **25 cenários existentes** catalogados individualmente com nome, categoria/slice, expectativa de produto/código histórico, etapa, risco, sinal, falha detectável, cobertura/lacuna e prioridade. **Dez positivos e quinze negativos**, no escopo de candidata.
- **27 slices**: os 26 A–Z solicitados, mais persistência/feedback para cobrir a etapa própria sem misturá-la a provider.
- **36 casos futuros propostos**, somente especificações. Total do catálogo: 61 entradas; isso não é contagem de testes executados. Casos agrupadores/subcasos e controle positivo da família longa ainda serão materializados/versionados no futuro, sem inflar o total atual.
- **12 mutantes semânticos propostos**, somente documentação, sem executar ou modificar fontes temporariamente.
- [Propagação pendente](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md): registro de Q0, evidências, estados e próximo gate. Nenhuma segunda Tabela Mestre criada ou fonte canônica editada.

O contrato separa `quality_outcome`, causas/etapas de falha e `contract_pass`. Isso permite classificar corretamente candidata ruim bloqueada, rejeição indevida e timeout esperado no ensaio de resiliência. Uma resposta inadequada não ganha aprovação por HTTP 200, usage, metadata ou `problemas=[]`.

Scoring propõe dez dimensões: grounding, factualidade, cobertura, temporalidade, entidade, protocolo, segurança, conformidade, utilidade e tom/perfil. Violações obrigatórias não são compensadas por score de estilo. Índice soft/limiares são proposta de contrato a congelar antes do lote futuro; nenhum scorer foi implementado/calibrado.

## 4. Principais lacunas e riscos

1. Os 25 casos têm decisões/gerações conhecidas; não comprovam seleção real, decisão probabilística, persistência ou qualidade atual do modelo.
2. O runner manual pode encerrar no determinístico e nem chamar o auditor. Presença de caso no runner não equivale a cobertura real do julgamento residual.
3. Protocolo inventado, arquivado, duplicado ou cortado, troca/continuidade de entidade, baixa confiança indevida e persistência precisam casos próprios.
4. O caso social existente herda parte de decisão factual; catalogá-lo não certifica o classificador social nem autoriza alterar a fixture agora.
5. A família longa P017–P021 diferencia ausência legítima de pendência, perda da mensagem atual, recusa indevida do decisor, geração inválida e bloqueio correto. É sintética, com controle positivo especificado, sem reconstruir LD-156 nem atribuir sua causa histórica.
6. O replay mede reação a saídas conhecidas, inclusive auditor falso; não mede julgamento probabilístico. Uma detecção adversarial correta não faz o fluxo mutado receber PASS funcional.
7. Contagens por slice se sobrepõem; erros operacionais/não julgados devem ser publicados, sem excluir silenciosamente do relatório para melhorar pass rate.
8. Base local antiga e manifesto remoto Radar incompleto permanecem limitações para futura implementação. Não impedem estes caminhos documentais novos autorizados.
9. Classes HUMAN_REVIEWED_ANONYMIZED e PRODUCTION_FORBIDDEN estão definidas, mas não usadas como origem de conteúdo de Q0. Feedback real não é dataset automático.

## 5. M1c-F, Q1, JEV e próximo gate

**M1c-F: HOLD.** Primeira possibilidade temporal: 19/10/2026 00:00 UTC = 18/10/2026 21:00 America/Sao_Paulo. Ainda exige duas semanas completas UTC, pelo menos 200 chamadas F1 instrumentadas do mesmo C1, conferência de metadados/cobertura e fechamento formal. Volume, hash e amostras atuais não foram apurados; nada é presumido zero.

**Q1: NÃO INICIADO.** Nem runner, dataset, scorer, mutantes ou ensaio de modelo foram implementados/executados. PASS Q0 não abre Q1 automaticamente.

**JEV: PLANEJADO / FRENTE NOVA**, com acesso obtido e nunca utilizado conforme usuário. Fora de Q0; nenhuma integração ou uso como scorer foi desenhado.

Próximo gate: fechamento formal de M1c-F, revisão humana deste contrato/matriz e decisão explícita de escopo Q1, manifesto Radar atualizado sem overlap nos caminhos propostos e base reconciliada para implementar. Modelo real exige ainda autorização operacional humana própria; a proibição de Codex/CI/OpenAI real continua válida e Preview permanece bloqueada.

## 6. Verificação documental

**Validação documental: PASS.** Conferências locais executadas, sem runner de produto:

| Verificação | Resultado |
| --- | --- |
| Links e anchor local | 17 links nos três documentos e propagação, todos resolvidos; anchor da família longa conferido |
| IDs de casos | E001–E025: 25; P001–P036: 36; sem duplicatas de definição |
| Slices e mutantes | S01–S27: 27, todos referenciados; M01–M12: 12; sem duplicatas ou slice desconhecido |
| Nomes da fixture | 25 nomes extraídos por leitura estática de literais/expansão do array Git e encontrados na matriz; nenhum ausente |
| Sinal dos existentes | Dez positivos e quinze negativos catalogados |
| Taxonomia | Todas as 13 categorias exigidas presentes, com resultado/causa/etapa diferenciados |
| Privacidade/secrets | Revisão do conteúdo novo e busca local por padrões de e-mail, telefone, documento pessoal e credencial: zero ocorrências detectadas; nenhuma fonte Production/conversa/export foi lida ou copiada |
| Whitespace | `git diff --check` e checks `--no-index` sobre os quatro documentos de escrita, sem erro; avisos de futura conversão LF/CRLF não são falhas |
| Produto/index | `git diff --exit-code` e diff staged vazios; nenhum arquivo rastreado alterado |
| Base Git | HEAD `366dc0f` e `origin/main` local `0149ad4` preservados |
| Preservação de IA-00 | SHA-256 final igual ao inicial `062AECCDCF8FA6B3D2ACF2C423AD5222EE71E518BC7DB21E44C0083F67A07377` |
| Manifesto de saída | Três Markdown novos de Q0 e complemento de propagação; relatório IA-00 preexistente intacto. Cinco arquivos untracked no total, nenhum outro caminho |

Busca por padrões e revisão documental não são certificação geral de anonimização do repositório. Cobrem o conteúdo criado em Q0; os dados utilizados são especificações sintéticas/padrões genéricos, sem importação externa. Regressões funcionais foram descritas, não exercitadas, pois não houve código de produto alterado.

Não executados por escopo: testes de produto, TypeScript, lint, build, Vitest/discovery, mutantes, browser/smoke, provider real, WhatsApp, banco/SQL remoto e benchmark. Isso não é bloqueio de Q0 documental, nem validação funcional do produto. Não há smoke de interface exigido por mudança funcional, pois nenhuma foi feita.

## 7. Critérios de entrega

| Critério | Evidência documental |
| --- | --- |
| Contrato e matriz criados | Links em §3 |
| 25 cenários existentes | E001–E025, com expectativas e lacunas, sem edição da fixture |
| Slices e taxonomia | S01–S27; resultados e causas separados no contrato |
| Scoring e métricas | Hard gates, score soft proposto e denominadores explícitos |
| Família longa sintética | P017–P021, sem conversa real/causalidade retroativa |
| Privacidade e replay | Duas fontes permitidas em Q0; sem rede/credencial; eval real separado |
| Gates de Q1 | M1c-F, volume C1, metadados, decisão humana e overlap |
| Zero mudança de produto/Radar/migration/banco/OpenAI/Production | Manifesto restrito, operações locais documentais |
| Validação documental | PASS; evidência e limites em §6 |

**STOP ao entregar Q0. Não iniciar Q1. Sem commit, push, merge, PR ou deploy.**
