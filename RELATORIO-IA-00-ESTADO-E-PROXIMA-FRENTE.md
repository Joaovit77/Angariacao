# IA-00 — Estado da IA e próxima frente

Data: 16/10/2026, America/Sao_Paulo. Responsável: Codex.

**Decisão recomendada: preparar o contrato local de Qualidade/Evals; manter IA-M1c-F em HOLD e não iniciar Q1, implementação, benchmark ou troca de modelo.** O primeiro checkpoint proposto é documental, com casos sintéticos, critérios e fronteiras de arquivos. Ele não fecha o baseline nem altera o roadmap existente.

## 1. Escopo e grau da evidência

Auditoria estática de arquivos, objetos Git e documentos locais. Nenhuma API externa, banco remoto, Production, OpenAI, WhatsApp, Docker, ANGARIO-DEV ou serviço do Radar foi acessado. Não houve fetch nesta sessão, instalação, execução de suíte, commit, push, PR, merge ou deploy. Somente este relatório e a propagação pendente foram criados.

Três planos distintos precisam continuar separados:

- **Checkout aberto:** `366dc0f`, de 24/09/2026; não contém a instrumentação M1c mais recente.
- **Referência local mais recente examinada:** `origin/main` em `0149ad4`, obtida por fetch anterior, em 12/10/2026. Código referido como “atual” neste relatório significa esse SHA, sem afirmar que continua sendo a ponta remota em 16/10.
- **Production:** apenas registros históricos locais. Os deploys documentados são evidência de publicação naquela data; não equivalem a consulta ou certificação do ambiente hoje.

As afirmações negativas significam “não localizado no universo inspecionado”, não “nunca existiu em outra máquina, conversa ou branch não disponível”. Estado não apurado nunca é zero.

## 2. Git, isolamento e rollback

| Item | Resultado |
| --- | --- |
| Repositório | `C:/Users/ciria/Desktop/sistema-angariação/Angariação` |
| Branch aberta | `codex/b3-2-auditoria` |
| HEAD | `366dc0f1b8c7ec5794d880de6f038b0698e25598` |
| Data de HEAD | 24/09/2026 19:41:35 UTC |
| `origin/main` local | `0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883` |
| Data desse commit | 11/10/2026 12:44:28 -0300 |
| Última atualização local de `origin/main` | Reflog: 12/10/2026 11:11:15 -0300, fetch anterior à auditoria |
| Divergência `HEAD...origin/main` | 0 commits exclusivos de HEAD; 73 exclusivos de `origin/main` |
| Diferença de árvores | 398 arquivos; inclui outros domínios, não só IA |
| Estado inicial | Sem modificados, staged ou untracked não ignorados |
| Estado esperado de saída | Apenas os dois Markdown solicitados, untracked |
| Worktrees registradas | 26; uma está marcada como prunable, sem remoção nesta sessão |
| Ponto preservado de rollback | HEAD, index, branches e produto permanecem intactos; os dois novos relatórios são a única mudança |

Worktree local de referência já existente, sem edição nesta auditoria:
`C:/Users/ciria/.codex/worktrees/ia-m1c-f-snapshot-2026-10-12/Angariação`, branch `codex/ia-m1c-f-snapshot-2026-10-12`, HEAD `0149ad4` segundo o registro de worktrees.

Inventário das 26 entradas, conforme `git worktree list --porcelain`:

| Branch | HEAD curto | Localização resumida |
| --- | --- | --- |
| `codex/b3-2-auditoria` | `366dc0f` | Checkout aberto |
| `astra/ia-atendimento-evidencia-temporal` | `b6bdaf1` | `.codex/visualizations/2026/09/05/.../Angariacao-ia-temporal` |
| `codex/proteger-openai-testes-reais` | `a21beed` | `.codex/visualizations/2026/09/06/.../Angariacao-openai-guard` |
| `codex/ensinar-ia-supervisionado` | `6d5dded` | `.codex/visualizations/2026/09/06/.../Angariacao-ensinar-ia` |
| `codex/fix-ensinar-ia-pos-feedback` | `a731095` | `.codex/visualizations/2026/09/06/.../Angariacao-fix-ensinar-ia` |
| `codex/cerebro-ia-observabilidade-atual` | `5da5450` | `.codex/visualizations/2026/09/07/.../Angariacao-cerebro` |
| `codex/fase-7b-analise-aprofundada` | `1d2c8ed` | `.codex/visualizations/2026/09/07/.../Angariacao-fase7b` |
| `codex/c1-cidade-padrao` | `68b9a7c` | `.codex/visualizations/2026/09/20/.../Angariacao-c1` |
| `codex/c3-cidade-padrao-config` | `db8d004` | `.codex/visualizations/2026/09/20/.../Angariacao-c3-config` |
| `codex/ia-m1c-f-snapshot-2026-10-12` | `0149ad4` | `.codex/worktrees/ia-m1c-f-snapshot-2026-10-12/Angariação` |
| `main` | `faecf96` | `.codex/worktrees/r4-2c-wimoveis-diagnostico/Angariação` |
| `codex/radar-r6-1-schema-global` | `a162724` | `.codex/worktrees/radar-r6-1-schema-global/Angariação` |
| `codex/retirados-b4-ui-retomada` | `36dbe27` | `.codex/worktrees/retirados-b4-ui-retomada/Angariação` |
| `codex/retirados-b5-a-discovery` | `0149ad4` | `.codex/worktrees/retirados-b5-a-discovery/Angariação` |
| `codex/retirados-b5-b1-contrato` | `0149ad4` | `.codex/worktrees/retirados-b5-b1-contrato/Angariação` |
| `codex/retirados-b5-b2-implementacao` | `0149ad4` | `.codex/worktrees/retirados-b5-b2-implementacao/Angariação` |
| `codex/retirados-c3-relatorio` | `5a4d677` | `.codex/worktrees/retirados-c3-relatorio/Angariação` |
| `codex/vendas-v1-b1-estrutura` | `5e58bde` | `.codex/worktrees/vendas-v1-a-dominio/Angariação` |
| `astra/ia-atendimento-robustez-sugestoes` | `9322c94` | `AppData/Local/Temp/angario-ia-atendimento-robustez`; prunable |
| `codex/1a-c2-1b-1-integracao` | `cfb3a83` | `.claude/worktrees/c2-1b-1-clean-integration-9fb2ff` |
| `claude/elastic-tu-58fd5e` | `e39b261` | `.claude/worktrees/elastic-tu-58fd5e` |
| `codex/auth-1c-1-boot` | `d8b1c10` | `.claude/worktrees/interesting-jackson-e6e4b0` |
| `codex/auth-1-stale-session` | `08b1ca5` | `Desktop/sistema-angariação/Angariação-auth-1` |
| `codex/r4-2i-localizacao-ui-scoring` | `b8bcc81` | `Desktop/sistema-angariação/Angariação-r4-2i` |
| `codex/r5-retry-backoff` | `2898ceb` | `Desktop/sistema-angariação/Angariação-r5` |
| `codex/r4-2b-fundacao-multiportal` | `9ff3ebd` | `Desktop/sistema-angariação/Angariação-roadmap-pos-r4-3` |

O inventário não afirma que todas as worktrees estão limpas. Não houve inspeção indiscriminada das suas alterações ou credenciais.

## 3. Documentação, fontes e Tabela Mestre

Lidas as instruções de raiz [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), [PROJECT.md](PROJECT.md), e as instruções específicas [web/AGENTS.md](web/AGENTS.md) e [web/CLAUDE.md](web/CLAUDE.md). O PROJECT do checkout foi lido e suas diferenças com `origin/main` examinadas; trechos de arquitetura de IA da referência também foram conferidos.

Documentos específicos lidos: [IA-AMBIENTES](docs/IA-AMBIENTES.md), [incidente OpenAI](docs/INCIDENTE_OPENAI_2026-09-05.md), [diagnóstico de atendimento](DIAGNOSTICO_IA_ATENDIMENTO.md), [relatório de atendimento](RELATORIO_IA_ATENDIMENTO.md), [contexto tipado](docs/FASE6_CONTEXTO_TIPADO_ASSISTENTE.md), [sanitização](docs/FASE5B1_SANITIZACAO_LOGS.md), [qualidade histórica dos comparáveis](docs/FASE5C_QUALIDADE_HISTORICA.md), [frescor na Avaliação](docs/FASE5D_FRESCOR_AVALIACAO.md), [protótipos](PROTOTIPOS_LOCAIS.md), e trechos pertinentes de [DEPLOY.md](DEPLOY.md). Schema e migrations foram consultados somente como texto.

Fontes novas em relação ao checkout aberto:

- **E1 — Baseline versionado:** `origin/main:docs/IA_BASELINE.md`, commit introdutor `88a4695`; [cópia local no snapshot](<C:/Users/ciria/.codex/worktrees/ia-m1c-f-snapshot-2026-10-12/Angariação/docs/IA_BASELINE.md>). Contém marcos de Production, T0, consultas Q1–Q8 e gates.
- **E2 — Checkpoint local de 12/10:** [CHECKPOINT.md](<C:/Users/ciria/Documents/Angario-evidencias/IA-M1c-F-2026-10-12/CHECKPOINT.md>) e [RELATORIO-PARCIAL.md](<C:/Users/ciria/Documents/Angario-evidencias/IA-M1c-F-2026-10-12/RELATORIO-PARCIAL.md>). Acesso histórico a Production ocorreu naquela tarefa, não nesta.
- **E3 — Código e testes:** objetos Git em `0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883`. Caminhos de produto a seguir, salvo indicação contrária, referem-se a essa árvore. Isso evita citar o executor antigo do checkout como se já tivesse M1c.
- **E4 — Radar local:** branch registrada `codex/radar-r6-1-schema-global`, commit `a162724`; diff de objetos Git contra `origin/main`, sem editar ou operar sua worktree.
- **E5 — Esclarecimento humano de 16/10:** usuário confirmou que conseguiu acesso ao JEV, mas nunca o utilizou; é uma frente totalmente nova.

Não foram localizados diretórios canônicos `plans/`, `checkpoints/` ou `relatórios/` na árvore rastreada examinada. Há relatórios de raiz, documentos em `docs/`, harnesses de teste e evidências externas em Documents. Não confundir `web/app/(painel)/relatorios` com relatórios de engenharia.

**Tabela Mestre:** o caminho informado na outra máquina não existe neste PC. A busca por arquivos `*TABELA*MESTRE*`/`*Tabela*Mestre*` em Desktop, Downloads, Documents, worktrees e visualizações de outubro não localizou cópia; tampouco existe na árvore Git examinada. Não é prova de ausência em todo dispositivo ou pasta sincronizada desconhecida. Nenhuma segunda tabela foi criada e nenhuma fonte canônica foi editada. Saída exclusiva de propagação: [PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md).

## 4. Checkpoints IA confirmados

“Production documental” abaixo significa registro versionado de deployment e data, conferido contra a presença do commit em `origin/main`; não significa validação ao vivo em 16/10.

| Checkpoint | Evidência Git e implementação | Estado confirmado | Production documental, UTC |
| --- | --- | --- | --- |
| IA-M1b, precedente | `d983497`; executor compartilhado; `ia-contrato-requisicao.test.ts` | Centralização presente, sem concluir rollout isolado a partir só do commit | Sem marco próprio certificado nesta auditoria |
| IA-M1c-A | `daccc40`; migration `20260930200000_ia_uso_metadados_execucao.sql`; executor/registro | Metadados anuláveis e correlação em `ia_uso` | 30/09 23:54:28; `dpl_GxPCmf9MG1Wgi2p4e6CFue4wCunC` |
| IA-M1c-B | `fc48f99`; `registrarFalhaDaChamada` | Falha lógica do provedor em evento separado, sem criar uso fictício | 01/10 01:06:07; `dpl_6c8rP4a8jKPVuxTQ5WhtT3bLtbE9` |
| IA-M1c-C | `91b6335`; `ia/rejeicao.ts` | Resposta rejeitada separada de falha; F3 mantém eventos próprios correlacionados | 01/10 15:29:24; `dpl_D3nwvvcJ79JwGuYAKesxYhpHJPzR` |
| IA-M1c-D1 | `23ec825`; `metadados-responses.ts`, orquestrador | F10 Responses instrumentado por rodada, um ID por turno | 01/10 17:54:28; `dpl_9vE8j2Q37avPyYBgAR3xEf3DumW4` |
| IA-M1c-D2 | `630deb4`; orquestrador | Falha do provedor em F10 preserva usos anteriores e exceção original | 01/10 19:47:30; `dpl_7QWfgeEZ85bYnzQRDFozByjkRNbA` |
| IA-M1c-E1 | `ec296f6`; `embeddingsImoveis.ts` | F13 instrumentado por lote, ID compartilhado na execução | 01/10 22:13:57; `dpl_SSsxR2Pb8jqRBmX5JAvY8RqiUvbe` |
| IA-M1c-E2 | `57d2a9d`; `whatsapp/_transcricao.ts` | F2 instrumentado por tentativa, ID compartilhado por áudio | 02/10 00:07:48; `dpl_FY5VsT6gAX5R2fqCJ8pfrZ57Vizw` |
| IA-M1c-F | `88a4695`; E1/E2 | T0/docs presentes; **baseline final não confirmado; HOLD documentado em 12/10** | E2 registra Production em `0149ad4` em 12/10; não registra fechamento de F |

Não atribuir nova migration a C/D1/D2/E1/E2: a extensão de `ia_uso` é a de A; eventos usam `log_eventos` existente.

### Gate ainda aberto de F

- Início válido: 30/09/2026 23:54:28 UTC. Snapshot T0: 02/10/2026 11:00 UTC.
- T0 registrou 35 chamadas F1, 5 `extrair-anuncio`, 3 `abordagem-anuncio`; são números históricos, não volumes de 16/10.
- Fechamento requer simultaneamente **200 chamadas F1 instrumentadas de C1 e duas semanas completas de segunda a domingo UTC**, mais tratamento dos bloqueios de metadados.
- Em 16/10, pelo calendário, apenas a semana 05–11/10 está completa; a semana 12–18/10 está em andamento. O gate temporal ainda não pode passar.
- Primeira possibilidade temporal: **19/10/2026 00:00 UTC = 18/10/2026 21:00 em Brasília**. Atingir a data não comprova volume nem fecha automaticamente.
- E2 registra indisponibilidade do SHA-256 completo do cohort C1 neste PC. Ele não foi procurado por inferência de conta, nem utilizado nesta sessão. Volume, taxas, latências e cobertura atuais continuam **não apurados**.
- F3 teve seu mínimo original de 30 execuções retirado como bloqueador em 02/10, por baixo volume; fica oportunístico/Q1. F10/F13/F2 também não têm mínimo estatístico próprio. Ausência de amostra natural isoladamente não bloqueia; metadados fora do contrato quando houver amostra bloqueiam.
- **Q1–Q8 no baseline são nomes de consultas SQL. Q1/Evals é a frente de qualidade. Não são a mesma coisa.** Nenhuma das consultas foi executada nesta auditoria.

### Incertos ou não promovidos

Estado atual de Production, ponta remota após 12/10, volume C1, baseline final, amostras naturais pós-marco de F2/F10/F13, flag ambiental de feedback e modelos efetivamente servidos hoje não foram confirmados. O último registro local diz Q1 não iniciado e Luna não testada. Não foi encontrado roadmap versionado completo Q2 → Q3 → M1d → Luna; não será inventado.

## 5. Arquitetura comprovada no código

### Atendimento ao proprietário — F3

`CentralMensagensView/RespostasView/Assistente` → cliente `lib/ia.ts` → `POST /api/ia` → ambiente, sessão e permissão → configuração → dispatcher → handler `servidor/ia/handlers/atendimento.ts`.

1. O cliente informa identidade do imóvel/origem; o handler relê imóvel e notas com cliente autenticado sujeito a RLS. Essa leitura usa ID e RLS; não confundir com uma consulta service role sem filtro.
2. `atendimento/contexto.ts` ordena o histórico por data/ID, preserva autoria e descarta mídia sem texto/vazios. Rascunho exige última fala legível do proprietário; fala posterior do corretor deixa de ser pendência. Modo retrospectivo de análise é separado.
3. Contexto: atual + até 12 anteriores + até quatro antigas por seleção lexical/marcos. Histórico completo do banco não significa conversa inteira enviada ao modelo. Conteúdo tem limite de 2.400 caracteres com indicação de cortes. Fallback de abordagem legada só existe sem saída textual persistida.
4. Contexto tipado do imóvel exclui observações livres e texto de anúncio. Protocolos ativos são lidos sob RLS: comerciais inteiros até 4.000 caracteres/item, 24.000 no catálogo, até 40; seleção de até cinco. Condutas ativas entram como restrição; excesso bloqueia em vez de cortar regra silenciosamente.
5. Catálogo de fontes → decisão estruturada por modelo → normalização estrita de IDs, evidências, temporalidade, lacunas, obrigações e resposta social/factual. Resposta social normalizada zera obrigações/protocolos factuais. A decisão ainda pode bloquear antes da geração.
6. Geração declara texto, protocolos, afirmações e obrigações cobertas. Validação determinística verifica referências/grounding, temporalidade declarada, cobertura, perfil e limites. Grounding/referência tem precedência sobre cobertura.
7. Auditoria por modelo é **residual**, com enum atual que inclui `afirmacao-nao-declarada`, contradição, entidade sem fonte, desvio, conduta e intervenção. Ela confronta texto e declarações; não deve ser descrita pelo contrato antigo dos relatórios históricos.
8. Reprovação recuperável permite uma regeneração do zero; segunda candidata repete as travas. Máximo duas gerações/cinco chamadas, sem retries do SDK no atendimento e timeout de 45 s/chamada. Falha de transporte/estrutura não vira resposta supostamente segura.
9. Se feedback estiver ativo, sugestão é persistida antes de retornar; falha de persistência não oferece sucesso. Retorno é rascunho editável, protocolos e eventual `sugestaoId`. Não envia WhatsApp, não altera agenda/status.
10. Eventos de etapa, validação e diagnóstico compartilham `execucao_id`; consumo é separado do resultado funcional. F3 **não** duplica rejeições em `ia-resposta-rejeitada`.

Arquivos principais: `web/lib/ia/atendimento/{contexto,contratos,evidencias,prompts,schema,validacao}.ts`, `web/lib/servidor/ia/handlers/atendimento.ts`, `web/lib/servidor/ia/executor-openai.ts` e `web/app/api/ia/route.ts`.

### Classificação, áudio e efeitos operacionais — F1/F2

Webhook autentica integração e descobre tenant pela instância; histórico/seleção operacional e gates de efeito pertencem ao WhatsApp/contatos. Áudio é transcrito antes da classificação; falha preserva marcador e não autoriza perder a nota. F1 usa configuração `classificacao`, Structured Output e executor comum, recebe até cinco mensagens anteriores com autoria. Desfechos, datas, horário e motivos de perda atravessam guardas determinísticas. Classificação indisponível/inválida devolve `null` e o fluxo deve preservar a mensagem.

IA pode sugerir desfecho; exceções operacionais existentes permitem encerramento seguro e compromisso derivado, sob as regras do webhook. Portanto “IA nunca escreve” seria incorreto para o sistema inteiro, embora o rascunho F3 não execute esses efeitos. A atribuição de imóvel/contato e o portão de efeitos evoluíram entre HEAD e `origin/main`; não assumir o antigo `updated_at` como autoridade universal. Nenhum cutover desse domínio foi proposto.

### Anúncios e painel

Há extrator de anúncio colado, geração de anúncio, abordagem baseada em anúncio, roteiros e análises de abordagens/Dashboard/Mapa/Foco/resumo. Muitos continuam como operações do fluxo legado de `/api/ia`; não existe evidência de um agente autônomo de anúncios com fila própria. Cálculo/KPIs são determinísticos antes da interpretação textual. Extração preenche para revisão, não cadastra nem contata automaticamente. Abordagem pode persistir sugestão para feedback.

### Assistente operacional/leads e continuidade — F10

`/api/assistente` e superfícies página/flutuante compartilham cliente, sessão e orquestrador. “Lead” é contexto operacional de `imoveis`, sem tabela/agente de leads novo comprovado.

- Contexto visual traz tipo/ID, reconsultado no servidor. Seleção tipada por intenção/capacidade carrega imóvel, agenda, pipeline e protocolos pertinentes com `user_id`; fatos atuais vencem memória histórica. Conversas/mensagens ficam sob demanda.
- Continuidade usa ID ou código canônico de resultado singular e entidade visual/card anterior. Não recupera identidade por busca arbitrária em texto nem após resposta meramente quantitativa. Histórico limitado a 12 turnos; referência compacta não substitui leitura atual.
- Responses API: `store: false`, `safety_identifier` derivado de hash, ferramentas sequenciais, até quatro rodadas após a chamada inicial, máximo cinco chamadas lógicas por turno. Metadata e falha instrumentadas fora do executor Chat Completions.
- Políticas fechadas: visita, compromisso, tentativa e mudança restrita para Sem resposta exigem confirmação. Criar/reagendar/concluir follow-up interno pode executar após pedido explícito e entidade inequívoca. Envio externo, exclusão, dado sensível e status arbitrário ficam bloqueados.
- Preparação congela payload; confirmação usa ação/sessão e RPC transacional, com revalidação e idempotência. Modelo não possui acesso genérico ao banco.

### Follow-up determinístico

`calculo/followup.ts`, fila de lote e regras de disponibilidade não dependem de geração probabilística para decidir elegibilidade, cadência, teto e destinatário. Assistente abre a revisão existente, sem enviar. Piloto interno utiliza `agenda`/`assistente_acoes`; resposta recebida pode concluir somente acompanhamentos automáticos elegíveis. Não é um novo motor autônomo de prospecção.

### Análise aprofundada — F11

Orquestrador próprio, somente leitura, de um imóvel explicitamente escolhido. Dossiê transitório, fontes limitadas, Atendimento mediante opt-in, sem coleta externa. Reutiliza motor determinístico da Avaliação e comparáveis persistidos; valida fontes, entidade e valores. Uma chamada, até duas somente em falha transitória/estrutura. Não cria relatório persistido nem ferramentas de escrita.

### Garimpo/classificação — F12 e embeddings — F13

Classificação de passagem usa rota compartilhada `classificacao`, claim, catálogo fechado e evidência textual; não transforma identificado em oportunidade automaticamente. Embedding usa texto estruturado, hash/modelo/dimensão e busca híbrida; não gera a resposta do proprietário. Há dependência real da ingestão Central/Radar e da Avaliação: essa área é excluída da próxima implementação paralela.

### Cérebro/coordenador e observabilidade

O Cérebro é explicação/projeção de execuções, não coordenador autônomo adicional. A rota `/api/ia/atividades` autentica, lê `ia_uso`/`log_eventos` com service role filtrada pelo tenant e entrega projeção sanitizada. Orquestração real existe no Assistente; não foi localizado serviço “Cérebro” separado que governe todos os agentes.

`registro.ts` escreve após a resposta, nunca deve substituir resultado funcional. `ia_uso` indica usage observado; falha do provedor e rejeição são fatos distintos. Logs/contexto registram IDs técnicos, enums, contagens, duração/configuração, sem prompt, conversa completa ou raciocínio. Ausência de insert só é verificável nos logs dentro da retenção; retries internos do SDK não são contados individualmente.

## 6. Providers e modelos — sem chamadas

| Uso | Código/configuração comprovada | Limite da conclusão |
| --- | --- | --- |
| IA textual/Chat Completions | OpenAI SDK; default `gpt-5.4-mini`; operações `medium`, classificação/atendimento `low` | Modelo ativo no banco/ambiente hoje não consultado |
| Assistente/Responses | OpenAI; default `gpt-5.4-mini/low`; override permitido por `OPENAI_ASSISTENTE_MODEL` somente sem versão publicada | Não ler valor de env nem presumir override ativo |
| Centro de IA | Allowlist nano/mini 5.4 e luna/terra/sol 5.6; preset recomendado usa Luna na classificação e Terra nos demais | Preset não é seleção, benchmark, disponibilidade ou deploy |
| Embedding | `text-embedding-3-small`, 512 dimensões, lotes até 100; `OPENAI_EMBEDDING_MODEL` pode substituir alias | Compartilhado com comparáveis/Radar; não alterar |
| Transcrição | `gpt-4o-mini-transcribe-2025-12-15`, HTTP OpenAI, idioma pt; até três tentativas | Fallback é falha/áudio marcador, sem outro provedor |
| OpenRouter/outros provedores LLM | Não encontrados nos imports, configuração, dependências ou busca textual rastreada | Sem evidência de integração |
| JEV | Acesso confirmado pelo usuário, sem uso; nenhum artefato localizado | Frente nova, não provider ativo comprovado |

Fallbacks existentes são de configuração para default, regeneração controlada ou degradação funcional. Não foi localizado fallback automático para outro provider LLM. Evolution, Firecrawl, RapidAPI, Google e Supabase são integrações auxiliares, não prova de um segundo gerador de texto.

E1 registra no T0 pedido `gpt-5.4-mini` e servido `gpt-5.4-mini-2026-03-17`. E2 registra zero versões globais em 12/10; isso é retrato histórico, não verificação atual. Nenhuma chave, token, env ou credencial foi lida/impressa.

## 7. JEV — frente nova

Classificação: **PLANEJADO / FRENTE NOVA**, com **acesso obtido confirmado por declaração do usuário**. Uso, código, modelos, contratos, avaliação, integração e Production: **SEM EVIDÊNCIA local**.

O contexto inicial sugeria decisão/classificação/validação, sem geração principal. Isso continua uma intenção histórica a discutir, não contrato adotado. Não classificar como experimento já executado, não promover a Production e não confundir obtenção de acesso com implementação. A busca por `JEV`/`jev` no código/documentação rastreados e por nomes/histórico relevantes não encontrou artefato. A próxima frente recomendada não depende de JEV.

## 8. Banco, RPCs, triggers e migrations

Tudo abaixo é inventário de arquivos locais; nenhuma conexão ou aplicação ocorreu. “Migration existente” não certifica aplicação remota hoje.

| Estrutura | Responsabilidade e proteção | Evidência/estado |
| --- | --- | --- |
| `ia_permissoes` | Flag por tenant; leitura própria, escrita privilegiada | Migration `20260720135101`; schema existente; estado remoto atual desconhecido |
| `ia_configuracoes` | Versões globais imutáveis; RLS sem grants de cliente; leitura/insert servidor admin | `20260826122613`, índice `20260826122808`; versão ativa atual desconhecida |
| `ia_uso` | Uso/tokens/cache e metadata anulável; servidor; sem backfill fictício | `20260801144319`, `20260801152330`, `20260930200000`; Production documental de M1c-A e catálogo histórico em E2 |
| `log_eventos` | Logs existentes; falha, rejeição e diagnósticos sem nova tabela | `20260801144319`; B/C/D/E reutilizam tabela; retenção externa não verificada |
| `ia_sugestoes`/`ia_feedbacks` | Sugestão imutável; um feedback atual por sugestão; RLS, grants mínimos e FK composta de tenant | `20260829012038`; flag de schema em código `true`; ativação ambiental atual desconhecida |
| `protocolos`, `user_config.perfil_comunicacao` | Verdade comercial/conduta versus estilo; RLS própria | `20260804135732`, `20260825111526`, `20260826152719` |
| `assistente_acoes`, `agenda`, `imoveis` | Payload congelado, confirmação, autonomia restrita, histórico de status | Migrations `20260827194622`, `20260828115824`, `20260828133303`, `20260828133422`; contrato local implementado |
| `comparaveis_mercado`/`observacoes_comparaveis_mercado` | Catálogo, vetores, hash e eventos observados; busca híbrida | `20260822165116`, série V3 `20260824203050/203203/203357`, `20260831134023`; compartilhado com Radar |
| Garimpo: classificações/etiquetas/identidade/memória | Claims, evidência e confirmação humana; promoção humana | Schema e migrations do domínio; memória `20260915190000` e rejeição `20260924210000`; não alterar |

RPCs operacionais encontradas: `preparar_acao_assistente_criar_compromisso`, `preparar_acao_assistente_agendar_visita`, `preparar_acao_assistente_status_sem_resposta`, `operar_acao_assistente_acompanhamento`, `confirmar_acao_assistente`, `cancelar_acao_assistente`, `processar_evento_resposta_acompanhamento`. Confirmar/cancelar autenticam ator/sessão; processamento de resposta é exclusivo service role. Grants, locks, tenant e estado são parte do contrato, não simples escolhas de prompt.

Outros contratos consumidos: `registrar_nota_imovel`/casca WhatsApp para histórico; `registrar_comparavel_mercado` e `buscar_comparaveis_mercado_hibridos`; claims/conclusão da classificação de passagem. Triggers relevantes: proteção de `status_history`, auditoria da Agenda, observação de comparáveis (`trg_observar_comparavel_mercado`/função privada), tipo/estado/snapshot/etiquetas do Garimpo. Não foi localizada tabela/view/RPC dedicada a Q1/Evals ou JEV.

IA-M1c-F e documentação de Evals não precisam de banco novo. Protótipo visual/OpenCLIP é local e pausado, fora do produto; não inspecionado nem integrado. Qualquer migração futura de dados, feedback real ou memória exige outro escopo e gate próprio.

## 9. Testes, fixtures, mutantes e Evals

### Contagem reproduzível por inspeção

Na árvore `origin/main` examinada há **378 arquivos `web/tests/*.test.ts`**; no checkout aberto há 270. Foi selecionado um subconjunto explícito de **62 arquivos diretamente ligados à IA/Assistente**, com **780 declarações estáticas `it`/`test`**. Os 62 arquivos lidos no snapshot foram comparados por hash Git com os objetos de `origin/main`, sem divergências. Essa não é contagem de testes executados: `it.each`, loops e arrays expandem casos; não houve discovery pelo runner nem afirmação de aprovação.

Seleção de nomes: `ia.*`/`ia-*`, `assistente-*`, `feedback-sugestoes-ia`, `ensinar-ia`, `cerebro-ia`, `openai-real-*`, `protocolos`, `perfil-comunicacao`, `piloto-automatico-assistente`, `status-sem-resposta-assistente`, `atividade-ia`, `api-atividades-ia`, `custo-ia`. Dependências adicionais como WhatsApp, autenticação, transcrição, embeddings/comparáveis, Garimpo e análise aprofundada não estão integralmente nessa contagem.

| Conjunto existente | Cobertura observada no código de teste | Lacuna/limite |
| --- | --- | --- |
| `ia-atendimento*.test.ts` | Parsers/schemas, fontes, temporalidade, social/factual, protocolo inventado, perfil, omissão, regeneração, RLS simulada, cortes e conversas longas | Mock não mede acerto probabilístico do decisor/auditor |
| `ia-atendimento-evidencia-temporal`, `oito-casos`, `contrato-auditor` | Grounding/cobertura, precedência, LD-288 controlado, declarações e auditoria residual | Não certifica nova matriz de qualidade nem LD-156 histórico |
| `ia-contrato-requisicao`, `ia-executor`, `ia-metadados-atendimento/analise` | Corpo transportado, configuração, correlação, uso preservado, falha e rejeição | Contrato sintético; não chamada real |
| `ia-falha-provedor`, `ia-resposta-rejeitada`, `ia-uso-metadados` | Categorias fechadas, status/request ID sanitizados, ausência de texto privado, telemetria sem interferência | Falha de persistência remota/retenção não comprovada por mock |
| `ia-metadados-assistente` | Responses, rodadas, metadata, falha e usos anteriores | Amostra natural C1 não apurada |
| `ia-embeddings-f13`, `ia-transcricao-f2` | Lotes/tentativas, ordem, retry, metadata, falhas e privacidade | Qualidade semântica de vetores/transcrição não medida por esses contratos |
| `assistente-*`, `piloto-*`, `status-sem-resposta-*` | Ferramentas, continuidade, contexto tipado, tenant, confirmação, autonomia, limites, UI e logging | Isolamento de banco real/UI real não exercitado nesta auditoria |
| Feedback/Ensinar/Protocolos | Flag, persistência, idempotência, edição após envio, estilo versus regra | Dataset ativo/volume/qualidade atuais desconhecidos |
| `openai-real-isolamento/protecao` | Separação de testes reais, bloqueios Codex/CI/Preview e opt-in local | Inspeção não equivale a execução nesta sessão |

Há integração local simulada com mocks, fixtures e testes estruturais. Algumas outras suítes do projeto utilizam PGlite/SDK e transporte local sintético; não transformar isso em evidência de RLS remoto. Existem hashes de caracterização de payload nos testes F10/F13 e outros contratos; não foi identificado conjunto específico de snapshots de respostas reais anonimizadas para Evals.

### Base de qualidade já existente

`web/tests/fixtures/atendimento-semantico.ts` contém **25 cenários atuais**, contados pela construção estática: nove objetos diretos, oito chamadas `parcial`, duas `temporal` e seis expansões de expressões históricas. O relatório histórico cita 24 e 48 repetições reais; esse número pertence à versão do ensaio daquela tarefa, não ao inventário atual.

Os cenários têm expectativas de produto pré-definidas: resposta integral/parcial, evasiva, omissão, isenção inventada, extrapolação após evento, histórico qualificado, cortesia e domínio diferente. São sintéticos ou trechos genéricos derivados de erro histórico; não dataset integral de conversas reais anonimizadas.

Há três arquivos em `web/tests-real-openai/`: reprodução, comparação e auditor semântico. O auditor itera a matriz em duas repetições, usa barreira determinística antes da chamada e faz chamada real apenas quando necessário. **São manuais e proibidos para Codex/CI. Não foram executados.** Não reaproveitar o runner pago como runner offline.

Não foi localizado framework local completo de Evals de produto com dataset versionado de ponta a ponta, scorer agregado, slices, taxa de falsa aprovação/rejeição, relatório por etapa e replay determinístico sem rede. Existem peças úteis, não uma frente Q1 já fechada.

Mutantes: `web/tests/harness/ux-assist-1/mutantes.mjs` tem cinco mutantes de UI/preferência/bloqueio do Assistente; não avalia raciocínio/qualidade da resposta. Há mutantes do Investigador, Vendas e Radar, fora desta frente. Não foi localizado runner de mutação semântica específico de decisão → geração → validação do atendimento. Nenhum mutante foi executado ou fonte temporariamente alterada.

### Feedback e rejeições não são a mesma medida

- `ia_feedbacks`: avaliação humana aprovado/editado/rejeitado, motivos e comentário; possível sinal futuro, sem consumo atual na geração.
- `ia-resposta-rejeitada`: resposta recusada pelo código, por chamada; não avaliação humana e não “modelo falhou”.
- F3: bloqueios/validação próprios, correlacionados; consultar apenas o evento genérico perderia esse domínio.
- HTTP 200, usage gravado e `{problemas: []}` não demonstram sozinhos qualidade. O relatório histórico mostrou 200 com omissão/extrapolação e revisão posterior; é evidência útil da necessidade de Evals, não medição atual de taxa de erro.

### LD-156 e conversas longas

Foram encontradas referências a LD-156 em PROJECT, webhook, caixa, temperatura, chegada de resposta e testes desses dois últimos domínios. Elas documentam 64–74 mensagens, falta histórica de tentativa e retomada indevida da oferta. **Não foi encontrado fixture/teste/eval específico da sequência “primeira tentativa sem mensagens suficientes, segunda funcionou” de LD-156.**

O seletor atual é determinístico; o decisor por modelo continua probabilístico e pode bloquear. `historico-insuficiente` no handler nasce de imóvel ausente/sem mensagem textual atual; `baixa-confianca`/`contexto-incompleto`/intervenção nascem da decisão. A mensagem amigável atual também difere da frase histórica. Sem evento/código/versão da ocorrência não é possível atribuir a causa ao decisor nem provar regressão.

Lacuna candidata: contexto sintético longo com mensagem atual inequívoca, mídia/vazios, saídas posteriores e múltiplas decisões gravadas. Separar “nenhuma pendência atual”, “seleção perdeu contexto” e “decisão recusou indevidamente”. Não reconstruir conversa privada de memória nem extrair histórico de Production neste checkpoint.

## 10. Segurança — guardas e limites

| Área | Guarda identificada | Limite da auditoria |
| --- | --- | --- |
| Preview/CI/Codex | `openai-real.ts` nega CI/Codex; Vercel não produtiva sempre bloqueada, mesmo com opt-in | Nenhuma requisição foi provocada para testar o bloqueio |
| Local/Production | Opt-in literal só local; Production Vercel autorizável com configurações/permissões | Chaves, variáveis e deployments atuais não inspecionados |
| Secrets/RLS | Chaves no servidor; cliente autenticado para carteira; service role restrita e identidade confiável | Não certifica policies aplicadas no remoto ou todo o projeto |
| Prompt injection | Governança central, JSON como dado não confiável, schemas fechados, ferramentas tipadas | Instrução/prompt e testes não provam resistência universal |
| Protocolo inventado | Catálogo ativo, IDs/títulos e grounding validados; ausências não viram regra | Julgamento texto versus declarações ainda depende do auditor residual |
| Dados pessoais | Contexto selecionado, logs sem conversa/prompt/telefone; feedback armazena texto como dado user-scoped | Feedback não é dado anônimo; precisa revisão antes de virar fixture/export |
| Tracing/Sentry | Correlação por `execucao_id`, request ID saneado e logs existentes | Não encontrados SDK/configuração de Sentry, OpenTelemetry, Langfuse ou LangSmith nos locais de produto pesquisados |
| Embeddings | Ambiente, hash, modelo/dimensão, lotes; fallback estruturado | Não alterar consumidor compartilhado com Radar |
| Áudio | Guarda antes de baixar/transcrever, limites, retry e retorno seguro | Áudio sai para OpenAI em uso autorizado; não presumir anonimato |
| Ações | Política fechada, payload congelado, transação, confirmação/revalidação | Nenhuma ação real exercitada nesta sessão |

Sanitização existe, mas não é uniforme em todo código legado: por exemplo, `api/ia/atividades/route.ts` ainda registra `error.message` do Supabase e `ia/configuracao.ts` também. O relatório de sanitização já explicita limites em outros caminhos legados. É lacuna de auditoria/contrato, não vazamento de segredo comprovado nesta sessão. Não alterar esses pontos sem escopo e regressão próprios.

## 11. Divergências documentais e incertezas

1. Checkout limpo, porém anterior a M1c; código auditado em `origin/main` não deve ser implementado sobre a base antiga sem reconciliação futura autorizada.
2. PROJECT descreve a trava de feedback como `false`; `feedback-config.ts` define `IA_FEEDBACK_SCHEMA_READY = true`, desde `2d1b917`. DEPLOY contém o procedimento histórico de ativação. Flag ambiental e operação real continuam desconhecidas. Não alterar a documentação canônica neste checkpoint.
3. Relatórios antigos descrevem auditor com enums/etapas anteriores; código atual tem afirmações, grounding/temporalidade/cobertura determinísticos e auditor residual. Resultados históricos não certificam esse contrato inteiro.
4. O relato de 24 casos semânticos evoluiu para 25 no código atual. Não somar históricos de suítes/rodadas como testes atuais.
5. Roteiros antigos mencionam smoke com geração em Preview; prevalece IA-AMBIENTES, que bloqueia qualquer IA real em Preview. Esses roteiros não autorizam exceção.
6. M1c-F permanece HOLD no último registro local. Não há evidência nova de fechamento nem amostra natural nesta auditoria.
7. Não foi possível ler o status da worktree Radar por `git -C`: o ambiente recusou acesso ao diretório. O diff de objetos da branch foi legível. O conjunto não commitado da outra máquina não está disponível. Isso não impede planejamento isolado, mas impede certificar ausência total de overlap remoto.
8. JEV: acesso sem uso é fato humano novo; não é experimento nem implantação comprovada.

## 12. Matriz de overlap com Radar

Nenhum arquivo do Radar foi editado. E4 mostra quatro arquivos no commit local `a162724`: `PROJECT.md`, `supabase-schema.sql`, migration R6.1 e seu teste. Isso confirma interseção de caminhos para documentação/schema compartilhados; não comprova conflito textual ou representa todos os arquivos ativos R1/R2/R3 da outra máquina.

| Arquivo/módulo | Frente IA | Radar toca? | Risco/classificação | Ação |
| --- | --- | --- | --- | --- |
| Os dois relatórios IA-00 de raiz | Evidência e planejamento | Nenhum vínculo encontrado | **SEM CONFLITO identificado** | Criar somente estes arquivos |
| `PROJECT.md` | Arquitetura/índice IA | Sim, comprovado em E4 | **CONFLITO REAL de caminho** | Não editar em paralelo |
| `supabase-schema.sql` | IA/feedback/ações | Sim, comprovado em E4 | **CONFLITO REAL de caminho** | Não editar nem recomendar alteração paralela |
| `supabase/migrations/*` | Histórico IA | R6.1 usa pasta/ledger | **CONFLITO POTENCIAL**, arquivos ativos proibidos | Nenhuma migration nova ou aplicação |
| BASE83, bootstrap, migrations A/B, observer, harness Radar, Docker, ANGARIO-DEV | Nenhum necessário | Frente ativa declarada pelo usuário | **CONFLITO REAL de escopo reservado** | Exclusão total; nenhuma execução/edição |
| `servidor/comparaveisMercado.ts`, `finalizacaoCentralAngariacao.ts`, `embeddingsImoveis.ts`, `calculo/comparaveisMercado.ts` | F13/Avaliação | Ingestão Central/Radar consome essa cadeia | **CONFLITO POTENCIAL** | Não editar; somente contratos sintéticos isolados em frente futura |
| Executor IA, registro, erro externo | Infra IA | Uso compartilhado/transitivo de embeddings/logs | **CONFLITO POTENCIAL** | Não refatorar nesta próxima frente |
| `web/package.json`, lockfile, `vitest.config.ts` | Comandos/testes | Infra comum | **CONFLITO POTENCIAL** | Evitar alteração/dependência nova |
| `web/lib/ia/atendimento/*`, fixtures/testes existentes | F3/qualidade | Sem import de Radar identificado no domínio puro | **SEM CONFLITO identificado**, manifesto remoto pendente | Ler/reutilizar; não editar produto no primeiro checkpoint |
| Novos documentos/dataset/runner offline de Evals em namespace próprio | Qualidade futura | Não existentes no conjunto conhecido | **SEM CONFLITO identificado**, condicionado a conferir manifesto | Propor paths exclusivos e revisão antes de criar código |
| `docs/IA_BASELINE.md` | F/T0 | Não aparece em E4 | **SEM CONFLITO identificado** de arquivo | Não mudar definições/gate; só referenciar |

Qualquer nova evidência de interseção com R6.1-C-A-R1-R2-R3 obriga reportar conflito e excluir o arquivo da implementação paralela. Ausência de alterações locais não significa que a outra máquina não o esteja editando.

## 13. Três candidatos — sem implementação

Os nomes abaixo são **propostas de checkpoint**, não fases históricas descobertas.

| Critério | 1. Qualidade/Evals: contrato offline | 2. Retomada de M1c-F por evidência agregada | 3. Contratos offline de falha/privacidade |
| --- | --- | --- | --- |
| Objetivo | Definir casos, expectativas, métricas e replay sem rede | Recuperar identidade do cohort e preparar consolidação do baseline | Verificar lacunas de metadata/falha com respostas sintéticas hostis |
| Estado atual | 25 casos e muitas regressões; sem framework Q1 consolidado | HOLD local em 12/10; gate temporal ainda não satisfeito em 16/10 | Contratos F10/F13/F2 existentes; limites conhecidos de corpo/usage/logging |
| Benefício | Separa qualidade, segurança, falso bloqueio e falha operacional | Destrava decisão legítima sobre abertura de Q1 | Detecta regressão de telemetria sem acessar providers |
| Arquivos possíveis | Novo `docs/IA_QUALIDADE_EVALS_CONTRATO.md`; depois namespace novo de fixtures/testes offline. Ler domínio F3 e fixtures existentes | E1/E2 somente leitura; relatório novo de snapshot, preferencialmente evidências fora do Git | Novos testes isolados; importar código existente sem editá-lo; relatório de lacunas |
| Banco envolvido? | Não no preparo/ensaio sintético | Dados agregados históricos de `ia_uso`/`log_eventos`, só em etapa posterior expressamente autorizada | Não; mocks de persistência |
| Migration? | Não | Não | Não |
| OpenAI real? | Não | Não gerar chamadas; observar só evidência existente | Não |
| Production? | Não | Não no checkpoint local; apuração real posterior depende de operador/escopo autorizado | Não |
| Conflito Radar | Baixo, isolando paths e mantendo fontes compartilhadas intactas | Baixo por arquivo, mas acesso operacional precisa isolamento | Baixo para testes novos; alto se tentar corrigir consumidores compartilhados |
| Tamanho estimado | Pequeno: 1 checkpoint documental; implementação offline posterior média, 1–3 dias de trabalho | Pequeno em documentação; prazo operacional depende de C1, calendário e volume | Pequeno/médio: 1–2 dias após escolher lacuna real |
| Dependências | Base Git reconciliada no futuro; manifesto de overlap; não promover a Q1 antes de F | C1 completo pelo operador e gates de E1; evidência agregada autorizada | Inventário de contratos/consumidores; nenhuma mudança funcional no primeiro gate |
| Primeiro checkpoint | **IA-Q0-CONTRATO-LOCAL**: contrato, matriz, fronteiras e critérios, sem código | **IA-M1c-F-PREPARACAO-LOCAL**: checklist de dados/gates, sem consulta remota | **IA-CONTRATOS-OFFLINE-00**: escolher lacunas sem duplicar cobertura existente |

Estimativas são de esforço, sem promessa de prazo corrido. Nenhum desses checkpoints foi iniciado por esta auditoria.

## 14. Recomendação e próximo gate seguro

Escolha: **candidato 1, Qualidade/Evals — IA-Q0-CONTRATO-LOCAL**, preparação anterior a Q1. Há casos e contratos reais a aproveitar, sinais históricos de falsa aprovação e lacuna identificável de LD-156. Não exige migration, Radar, Production, API paga ou mudança de comportamento.

Entregável sugerido para a próxima solicitação: documento exclusivo com escopo, lista de arquivos, matriz de casos e expectativas independentes da implementação, incluindo:

1. Respostas válidas integrais/parciais e sociais devem continuar permitidas; taxas, entidades, protocolo e temporalidade inventados continuam bloqueados.
2. Falsos positivos e falsos negativos separados; métricas por etapa (contexto, decisão, geração, determinístico, auditoria), não apenas HTTP/usage.
3. Conversa longa/LD-156 sintético, continuidade de entidade, dados atuais versus histórico, protocolos duplicados/arquivados/ausentes, cortes e falha de provider.
4. Transporte e persistência injetados/falsos; nenhuma leitura de `.env.local`, conta real, serviço ou runner pago. Saídas gravadas apenas sintéticas ou fornecidas com revisão de privacidade.
5. Replay offline mede reação do sistema a saídas conhecidas; não mede a qualidade probabilística de um modelo real. Essa diferença deve constar de cada relatório.
6. Não exportar feedback/conversas reais nesta etapa e não alterar prompts, modelos, configuração, segurança, ações ou código compartilhado.

**Gate para abrir Q1 real:** fechamento documentado de M1c-F pelo contrato vigente (C1, volume, calendário e metadados), nova decisão de escopo e ausência de overlap com o manifesto Radar atualizado. A preparação documental local pode anteceder esse gate; implementação/eval de modelo não fica autorizada por este relatório. O C1 não precisa aparecer em arquivo público nem na propagação.

**Gate de concorrência:** obter a lista atual de arquivos da frente Radar e conferir qualquer lista proposta. Para caminhos já em conflito real, não recomendar trabalho simultâneo. Não há autorização para integrar base antiga, atualizar remote ou mudar worktree nesta auditoria.

## 15. Validação desta entrega e limites

- Comportamento anterior: checkout limpo e antigo; nenhuma funcionalidade alterada.
- Alteração realizada: apenas relatório e propagação pendente. Sem ajustes visuais incidentais, sem PROJECT/schema/produto modificados.
- Áreas impactadas: documentação local de auditoria; produto e integrações não receberam mudanças.
- Verificação realizada: inspeção estática, histórico/diff, existência de referências, contagens declaradas e `git diff --check`; estado final limitado aos dois arquivos novos.
- Regressões: contratos e testes existentes inventariados; **não exercitados** nesta sessão. Não declarar preservação funcional comprovada por execução.
- Não executados por escopo explícito: npm test, TypeScript, lint, build, Vitest/discovery, mutantes, browser/smoke, SQL/CLI remoto, OpenAI real, WhatsApp ou APIs externas.
- Validação manual necessária para IA-00: revisão dos fatos, da base temporal e do manifesto Radar; consolidação posterior da propagação na fonte canônica. Não há smoke de produto exigido por uma alteração funcional, pois nenhuma ocorreu.
- Antes de implementação futura em fluxo crítico: preparar regressão proporcional e smoke humano em ambiente permitido/dados seguros; Preview só valida bloqueio e fluxos sem IA real. Não enviar mensagem nem executar ação externa para testar sem autorização específica.
- Riscos conhecidos: referência remota possivelmente mais nova, C1 indisponível, baseline aberto, documentação histórica divergente e lista ativa da outra máquina não disponível. Nenhum deles foi mascarado como aprovação de Production.

**STOP IA-00. Não iniciar implementação.**
