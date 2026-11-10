# Relatório — IA-CONTRATOS-OFFLINE-00

Data: 16/10/2026. Responsável: Codex. Continuação de PASS IA-Q0-CONTRATO-LOCAL.

## 1. Decisão e alcance

**PASS IA-CONTRATOS-OFFLINE-00, exclusivamente documental.** Contratos atuais, limites de evidência, cobertura existente, lacunas, privacidade, persistência e prioridades foram separados. Nenhum caso, mutante, suite, SDK ou integração foi executado. Este PASS não valida comportamento funcional, não aprova correção de produto e não fecha M1c-F.

**IA-M1c-F: HOLD. Q1: NÃO INICIADO / BLOQUEADO. JEV: PLANEJADO / FRENTE NOVA, fora do escopo.** Acesso ao JEV obtido, mas nunca utilizado, conforme esclarecimento humano; nenhuma integração foi desenhada.

Antes deste checkpoint, IA-00/Q0 já descreviam a arquitetura, os eventos e os casos de qualidade. Esta etapa acrescenta uma matriz operacional de fronteiras de falha, com indicação do que os testes existentes já verificam e do que exige composição futura. Comportamento de produto, definições Q0 e artefatos anteriores permanecem preservados.

## 2. Base e método

| Item | Evidência / limite |
| --- | --- |
| Base de código/testes lida | `origin/main` local: `0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883` |
| Checkout documental | `codex/b3-2-auditoria`, HEAD `366dc0f1b8c7ec5794d880de6f038b0698e25598`, 73 commits atrás da referência local |
| Atualidade | Sem fetch nesta tarefa; referência remota após o último fetch local de 12/10 não consultada |
| Método | Reuso de IA-00/Q0 e leitura de objetos Git dos módulos/testes pertinentes, sem execução |
| F13 | Somente testes e inventário IA-00; fonte `embeddingsImoveis.ts` e consumidores Radar/comparáveis não abertos nesta etapa |
| Evidência | Teste existente significa assertion localizada, não teste executado hoje. Lacuna significa ausência/insuficiência no recorte inspecionado, não busca exaustiva de todo o projeto |

O [documento de contratos](docs/IA_CONTRATOS_FALHA_PRIVACIDADE.md) contém fontes T01–T15, contratos por fronteira e limites. A [matriz](IA_CONTRATOS_OFFLINE_MATRIZ.md) traz os cenários, expectativas e reaproveitamento. Não implementar sobre este checkout antigo; reconciliar a base em tarefa futura autorizada.

## 3. Quantidades e cobertura existente

| Inventário estático | Quantidade |
| --- | --- |
| Contratos C001–C036 | 36 |
| COBERTO no recorte offline | 20 |
| PARCIAL | 9 |
| NÃO COBERTO no recorte inspecionado | 7 |
| Casos conceituais O001–O012 | 12: três P0, oito P1, um P2 |
| Mutantes conceituais U01–U14 | 14 |
| Grupos de referências de teste T01–T15 | 15; T15 referencia dois arquivos |
| Casos/mutantes/suites executados | Nenhum |

Já existem asserções para categorias de erro/status, request ID inválido, ausência de usage, uso antes de parse/julgamento, correlação sequencial, logging seguro dos registradores, lotes F13, retries F2, Structured Output, limites F3 e rejeição genérica sem duplicação. Reutilizar essas asserções, sem criar uma segunda suíte equivalente.

Provider failure, rejeição da aplicação e feedback negativo humano são fatos distintos. Falha funcional, falha de telemetria, falha de persistência de negócio e falha de qualidade também permanecem separadas. F3 mantém diagnósticos próprios e não duplica `ia-resposta-rejeitada`.

## 4. Lacunas e ordem recomendada

| Prioridade | Casos propostos | Fronteira faltante / recomendação |
| --- | --- | --- |
| P0 — integridade/privacidade crítica | O007, O008, O011 | Composição dinâmica do retry de feedback após envio, confirmação de ação com resposta perdida e isolamento entre duas sessões/tenants. Mocks/asserções estruturais atuais cobrem partes, sem provar integração ou transação real |
| P1 — antes de Q1 | O001–O006, O009, O012 | Logs legados, inicialização do registrador fora do catch, sugestão ativa com error/ID ausente/promise lançando, usage parcial, execuções concorrentes, gravações independentes e falha da segunda geração preservando usos anteriores |
| P2 — posterior | O010 e estudos delimitados | Getters hostis artificiais em metadata de sucesso Chat; semântica de identificadores/modelo; durabilidade/dedupe/retentativas, sem autorizar schema/outbox |

P0 é prioridade de risco e cobertura, **não demonstração de bug, violação RLS ou duplicação ocorrida**. A prioridade operacional desta auditoria não altera as prioridades originais dos casos Q0. O006 exige decisão de contabilização/compatibilidade caso a futura expectativa demande mudança persistente; não há autorização implícita de schema.

## 5. Riscos de privacidade e persistência

Foram confirmados **12 pontos de `error.message` bruto em quatro arquivos** na base: atividades (quatro), configuração (um), sugestão (um) e ações (seis). Não há sanitização nesses pontos específicos. Erros de banco/RPC são conteúdo externo não confiável; inserts/RPC podem carregar texto de negócio. SELECT fixo de configuração não solicita conversa, mas também não torna o diagnóstico externo confiável. **Nenhum vazamento real foi observado.** O001 especifica sentinelas sintéticas; uma eventual correção deverá preservar fallback, retorno parcial, status, tenant e ação.

Eventos estruturados de falha/rejeição e o console de falha do registrador usam campos limitados. Isso não torna todo log seguro: `registro.ts` não sanitiza genericamente o `detalhe` fornecido pelo emissor. Regex/tamanho de request ID e modelo não equivalem a anonimização semântica. Prompt, conversa, áudio, telefone, nome pessoal, segredo, credenciais e raciocínio interno não devem entrar no diagnóstico técnico.

O registro de U/E é assíncrono e independente, sem atomicidade conjunta, outbox ou retry durável nessa camada. Falha de insert deve preservar o resultado funcional, sem fabricar uso ou repetir geração; ausência de linha não comprova consumo zero. A criação do cliente ocorre antes da proteção assíncrona: o contrato de fail-open não cobre estaticamente toda inicialização. Não há ocorrência real demonstrada.

Sugestão ativa com error/ID ausente fecha a entrega; promise lançando pode escapar do tratamento local, sem garantia de envelope/status nessa fronteira. Resposta de insert perdida pode deixar persistência incerta. Feedback falho deve ter retry próprio, sem reenviar mensagem. Resposta perdida na confirmação de ação não prova rollback: preservar a mesma identidade de ação, sem preparar outra automaticamente. Esses contratos precisam de composição futura, não de nova chamada real nesta auditoria.

## 6. M1c, Q0 e gates preservados

| Marco | Cobertura offline neste recorte |
| --- | --- |
| M1c-A | PARCIAL: uso/metadata/insert cobertos; inicialização, usage parcial e persistência composta faltantes |
| M1c-B | COBERTO no contrato unitário principal; composição da segunda geração falhando permanece PARCIAL |
| M1c-C | COBERTO na emissão/correlação; não promete entrega durável |
| M1c-D1 | PARCIAL: rodadas sequenciais cobertas; concorrência/persistência fora de ordem faltantes |
| M1c-D2 | COBERTO no contrato unitário principal de falha/rota segura |
| M1c-E1 | COBERTO pelos testes inspecionados de lotes/metadata/falha parcial; qualidade vetorial NÃO APLICÁVEL |
| M1c-E2 | COBERTO pelos testes inspecionados de tentativas/retry/uso/falha; JSON ilegível é limite conhecido |
| Feedback/ações como novo marco M1c | NÃO APLICÁVEL; contratos próprios e lacunas separados |

Esses rótulos não reclassificam implantação ou fechamento dos marcos. Q0 permanece inalterado. A relação com S22–S27/P022–P034 está na matriz; não há runner, scorer, dataset executável ou avaliação de modelo novo.

**M1c-F permanece HOLD**, sem apuração de C1/volumes nesta tarefa. Primeiro limite temporal: 19/10/2026 00:00 UTC = 18/10/2026 21:00 em Brasília, necessário e não suficiente. Continuam exigidos duas semanas completas UTC, pelo menos 200 chamadas F1 instrumentadas de C1, metadados/cobertura e fechamento formal segundo o contrato anterior. Não interpretar volumes não apurados como zero.

**Q1 não iniciado.** Próximo gate para uma eventual tarefa exclusivamente offline: decisão humana sobre subconjunto O, manifesto isolado, overlap e base reconciliada. Isso não abre Q1. Para Q1, continuam necessários o fechamento formal de M1c-F e revisão humana do contrato/escopo.

## 7. Arquivos, Radar e propagação

Criados somente:

- [docs/IA_CONTRATOS_FALHA_PRIVACIDADE.md](docs/IA_CONTRATOS_FALHA_PRIVACIDADE.md).
- [IA_CONTRATOS_OFFLINE_MATRIZ.md](IA_CONTRATOS_OFFLINE_MATRIZ.md).
- [RELATORIO-IA-CONTRATOS-OFFLINE-00.md](RELATORIO-IA-CONTRATOS-OFFLINE-00.md).

Acrescentado somente o bloco deste checkpoint em [PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md), preservando IA-00/Q0. A Tabela Mestre canônica continua na outra máquina; nenhuma segunda tabela foi criada.

Nenhum arquivo de produto, Radar, PROJECT, schema, migration, BASE83, Docker Radar, ANGARIO-DEV ou protótipo foi alterado. Os três caminhos novos não existiam no checkout nem na árvore de referência antes da escrita. Não há overlap com os caminhos Radar conhecidos em IA-00; manifesto ativo da outra máquina indisponível, portanto ausência total de overlap não comprovada.

**CONFLITO potencial:** eventual correção em registro/executor/sanitizador/infraestrutura compartilhada ou cadeia de embeddings/comparáveis. Registrar e resolver manifesto antes de editar; não executar automaticamente em paralelo.

## 8. Verificação documental e limites

Conferidos IDs/contagens/referências, doze colunas da matriz, destinos dos links locais, privacidade evidente e whitespace. `git diff --check` executado; por serem arquivos não rastreados, conferência complementar por arquivo com `git diff --no-index --check` e inspeção de whitespace. Hashes dos quatro documentos anteriores de IA-00/Q0 preservados; zero diff rastreado ou staged; HEAD e referência local preservados. Nenhum arquivo de teste foi alterado/enfraquecido.

Não foram executados testes de produto, TypeScript, lint, build, mocks, mutantes, servidor falso ou smoke funcional. Isso é limite deliberado do checkpoint documental, não aprovação de fluxo crítico. Não há smoke real pendente para aceitar esta documentação; qualquer futura alteração funcional exige regressão e smoke proporcionais em escopo próprio. Os fluxos reais não foram exercitados.

Zero OpenAI/API paga, Production, banco remoto, credencial lida, mensagem enviada, ação externa, commit, push, PR, merge ou deploy. Nenhum ajuste visual foi feito. Riscos remanescentes são os documentados; PASS encerra somente esta auditoria.

**STOP.**
