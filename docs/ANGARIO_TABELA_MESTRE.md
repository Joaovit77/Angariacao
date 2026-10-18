# ANGARIO — Tabela Mestre canônica
Versão: 1.0 • Consolidação: 16/10/2026 (America/Sao_Paulo) • Responsável: Codex.
Escopo: inventário operacional local das frentes encontradas, com 158 registros de frentes/subfrentes/checkpoints. Esse número não representa 157 projetos independentes.

## 1. Fonte única e leitura inicial
Este arquivo, `docs/ANGARIO_TABELA_MESTRE.md`, é a **única fonte canônica de estado operacional**, versionada no Git. A cópia anterior em `outputs/` é legado/snapshot histórico e não deve receber atualizações operacionais. Futuras atualizações ocorrem somente neste arquivo e em `docs/checkpoints/`, na branch de trabalho adequada.

Migração conservadora autorizada em 16/10/2026: conteúdo importado diretamente do mestre anterior, preservando IDs, estados, referências e histórico; não reconstruído a partir da ponte. Veja o [checkpoint de migração](checkpoints/DOC-01_2026-10-16_1941_MIGRACAO_CHECKPOINT.md).

As referências absolutas a worktrees, memórias e evidências locais foram preservadas como referências históricas. Esses artefatos não são uma segunda fonte operacional e podem não estar acessíveis em ambientes remotos. As referências relativas deste pacote acompanham o Git; ausência de uma evidência externa não autoriza promover status.

Leia também [FONTES_E_CRITERIOS.md](FONTES_E_CRITERIOS.md), o [checkpoint desta consolidação](checkpoints/DOC-01_2026-10-16_CONSOLIDACAO.md) e o [modelo de checkpoint](MODELO_CHECKPOINT.md).

PROJECT.md permanece canônico para arquitetura e regras permanentes. Schema, DEPLOY e documentos de domínio continuam canônicos em seus escopos. Esta tabela organiza estado, evidência e sequência; não substitui contratos executáveis.

Não existe promessa de inventário universal: foram revisadas as fontes acessíveis indicadas no índice, referências locais Git, documentação, memórias/plans do Claude e conversas pertinentes disponíveis. Arquivos anexados não recuperados, sessões não encontradas e implantação remota atual permanecem lacunas. Nenhum Supabase, Vercel, provider pago ou serviço de produção foi consultado diretamente por esta consolidação.

## 2. Estado de retomada
**Frentes de implementação ativas atuais: Radar e IA.** A normalização/modularização de dados permanece **PAUSADA / NÃO ATIVA**, registrada em CON-09; sua preservação documental não autoriza retomada nem altera os gates de Radar ou IA.

**Radar: PASS LOCAL R6.1-C-A-R1-R2-R3 — OBSERVER CERTIFIED por prova controlada. STOP para revisão; A continua não certificada.**
- 2026-10-16 19:24:20 BRT: observador final SHA256 ba58167654592b3db33eed82872d1debc16e01a64bc6924257848649b453b2c6 intacto; serialização/equivalência preservadas. 360/360 offline (332 anteriores +28 novos).
- Uma stack nova. Ground truth PostgreSQL preservado antes do cleanup; logging_collector off/stderr via Docker json-file, canário verificado. Longa 12,044 s e 20/20 curtas (10–21 ms), nenhuma conexão válida esperada perdida.
- M1–M10 nativos PASS; erros e registro RAW parcial posterior à desconexão permanecem OBSERVATION_ERROR. CLI 2.119.0 PID 3104/socket único e backend 642 correlacionados por SQL exato/sessão/identidade/endpoint/bordas; porta NAT não presumida igual.
- Overhead real: 2.289 queries completas, média 8,202 ms, p50 7,114 ms, máximo 38,444 ms; CPU aproximada 18,109 s. Budget projetado revalidado 446.171 s <900 com parcelas MEASURED/HISTORICAL/ESTIMATED explícitas; BASE83≤720 s intacta.
- BASE83/A/B não aplicadas; A não certificada; Production 0/0; APIs produto/pagas 0; sem commit/push/merge/PR/Preview/deploy. Cleanup completo, inventário 41/23/13/38 preservado, zero residual; 26 inputs congelados intactos.
- [Relatório](C:/Users/Corretor/Documents/GitHub/Angariacao/.worktrees/radar-r6-1-c-b2-bootstrap-base83/supabase/bootstrap/base83-v1/RELATORIO-R6.1-C-A-R1-R2-R3.md) e [checkpoint](C:/Users/Corretor/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/outputs/checkpoints/R6.1-C-A-R1-R2-R3_2026-10-16_1924_CHECKPOINT.md). Causa histórica específica NÃO RECUPERÁVEL. Manifestos HOLD anteriores e tentativa automática conservadora permanecem preservados.
- Próximo recomendado: R6.1-C-A-R1-R3 (BASE83→certificação→A→certificação A), somente após revisão/autorização. Não iniciar automaticamente A/B/R6.2.

## 3. Como interpretar evidências e status
| Marca | Significado | Limite |
|---|---|---|
| G | Commit/ancestralidade observados no Git local | origin/main é referência local; integração não prova deployment nem smoke |
| P / D | Documento de projeto/domínio consultado | Pode conter estado histórico desatualizado; prevalece prova posterior explícita |
| S | Relatório/artefato específico consultado | PASS vale somente para escopo e ambiente declarados |
| M | Memória local de sessão Claude | Relato preservado, sujeito a atualização e conflito; não é instrução nova |
| R | Conversa ou resumo de sessão recuperado | Declaração atribuída; propostas do assistente não viram decisão humana automaticamente |
| PL | Plano consultado | Escopo/intenção, nunca prova de implementação |

“Produção registrada/documentada” significa que a fonte citada registra publicação. Não significa que esta sessão a verificou remotamente. “Integrado” significa presente na referência local origin/main observada. “A verificar” significa evidência insuficiente, não significa inexistente, cancelado ou falho. Datas de memórias e nomes de arquivos não bastam para certificar atualidade.

A coluna Última evidência registra a mais recente localizada para aquele escopo. Quando a data exata/gate não foi recuperado, isso permanece explícito. IDs de fonte remetem ao índice; hashes/links de commit permitem recuperar código sem depender desta conversa.

## 4. Regra operacional obrigatória — Codex e Claude
**Toda sessão que trabalhar em qualquer frente do Angario deve atualizar este arquivo mestre e salvar relatório/checkpoint persistente da frente antes de STOP, encerramento, handoff ou troca de sessão, inclusive se terminar em HOLD ou falha.**

1. No início: ler este mestre, PROJECT.md, AGENTS.md e o último checkpoint da frente. Conferir branch e estado Git antes de editar; usar branch codex/ e preferir worktree dedicado. Nunca alterar main/master diretamente nem sobrescrever trabalho de outra sessão.
2. Registrar o ponto de partida: ID da frente, evidências, SHA/branch/worktree, ambiente, gate autorizado e bloqueios. Se o contexto estiver incompleto, marcar a verificar e recuperar as fontes antes de promover status.
3. Ao fechar um checkpoint: salvar primeiro o relatório em docs/checkpoints/ID_AAAA-MM-DD_HHMM_CHECKPOINT.md (a partir da raiz do repositório), com horário de Brasília e evidência durável. Usar [MODELO_CHECKPOINT.md](MODELO_CHECKPOINT.md).
4. Atualizar somente as linhas afetadas do mestre: estado, última evidência, próximo gate, bloqueios e dependências. Acrescentar frentes descobertas; não apagar uma frente porque outra virou prioridade.
5. Separar implementação, testes, integração, Preview, aplicação de migration, Production, smoke real e revisão humana. Cada afirmação exige evidência própria. PASS local não é Production; deployment READY não fecha smoke funcional.
6. Registrar explicitamente testes não executados, decisões pendentes, hipóteses, efeitos externos, recursos/fixtures residuais e rollback. Ausência de dado não vira sucesso e estimativa não vira medição.
7. Antes de STOP: reler a versão atual do mestre para preservar atualizações concorrentes, conferir links/IDs e listar os caminhos do mestre e do checkpoint no relatório final. Se outra sessão editou a mesma linha, registrar o conflito sem escolher silenciosamente um status.
8. Se não puder gravar: não afirmar que o contexto foi salvo. Emitir checkpoint de contingência com conteúdo completo e erro, preservar trabalho e indicar que o salvamento permanece pendente.
9. A regra de salvar não autoriza commit, push, merge, deploy, migration remota, mensagens ou chamadas pagas. Respeitar os gates da frente e autorizações da sessão.

Esta regra está salva aqui e nas pontes AGENTS.md/CLAUDE.md da branch de documentação codex/angario-tabela-mestre. **Ainda não foi incorporada à main nem propagada a worktrees antigos.** Até essa incorporação, cada sessão nesses checkouts deve receber este caminho explicitamente. Trata-se de instrução persistente, sem hook ou automação que obrigue um agente a cumpri-la.

## 5. Tabela Mestre

### 5.1 Radar — aquisição e fundação global

| ID | Frente / subfrente | Estado canônico sustentado | Última evidência localizada | Próximo gate | Bloqueios / limites | Dependências |
|---|---|---|---|---|---|---|
| RAD-01 | Central assistida, importação, dedupe e integração com Radar/Avaliação | Implementado e integrado (G); produção descrita (P) | 0a8a098, 84c99ac, 9b5c585; P01 §§2615+ | Preservar revisão humana e limites de custo | Sem prova de completude/recência global | Portais, identidade de anúncio, Auth |
| RAD-02 | R1/R2 — observabilidade e execução automática separada | Produção registrada (M/G) | efc4f01, ea24fcf; M01 | Preservar registros e origem manual/navegador/cron | Nenhum encerramento global de roadmap inferido | Cron e log_eventos |
| RAD-03 | R3/R3-SF — recência OLX e baseline de observação | Histórico de auditoria/shadow; fechamento específico a verificar | bd55009; M02; plano PL01 | Recuperar decisão final de R3 e relação com R6 | Não atribuir recência a aquisição 20/20 | R1; histórico global R6 |
| RAD-04 | R4.1 — consistência, repetição Chaves, fotos e endereço | Correções integradas; shadow não equivale a agrupamento final (G) | 154a46e, dfd2935, c4c20b7, c6eda2f; M02 | Manter contratos; mapear aliases de checkpoints | Não confundir dedupe por anúncio com mesmo imóvel físico | Central, carteira, parsers |
| RAD-05 | R4.2/R4.3/R5 — multiportal, localização/score, coleta e retry | Integrado (G); produção registrada em memórias | 9ff3ebd, 7137602, 1eecaac, b8bcc81, 76726ab, 2898ceb | Preservar evidência de localização e orçamento | Gates históricos individuais a verificar | Firecrawl, cache, adapters |
| RAD-06 | R6.0b / R6.0c-B1 — tipo observado, finalidade e capacidade | Integrado (G) | 1a7ed8b, 8115b9c; P01 | Preservar tipo declarado separado de inferência | Não expandir capacidades por dedução | Contratos por portal |
| RAD-07 | R6.0c-B2 — Locação: 5 portais × casa/apto | Produção registrada: 10/10 (R/G) | R01; 0149ad4 e predecessores, até 13/10 | Fechado; reabrir somente com defeito demonstrado | Escopo Londrina/PR, primeira página | OLX, ZAP, Viva Real, Chaves na Mão, Wimoveis |
| RAD-08 | R6.0c-B2.6-A — Discovery Venda | Discovery concluído registrado (R); habilitação ocorreu depois | R01; relatórios B0/B1/B2 em D01 | Reutilizar evidências preservadas | Discovery não autoriza chamadas pagas novas | Fixtures por portal |
| RAD-09 | R6.0c-B2.6-B0 — ofertas por finalidade | Produção registrada; integrado (R/G) | 6b0f258; migration 20261011203141; D01 | Preservar identidade, finalidade e histórico separados | Não reaplicar migration pela consolidação | Persistência Radar |
| RAD-10 | R6.0c-B2.6-B1/B2 — Venda | Produção registrada: 10/10; aquisição total 20/20 (R/G) | 43b4708 e 62f0968; R01 | Fechado no escopo aprovado | Sem garantia de páginas restantes ou anúncio recente | Persistência por finalidade; adapters |
| RAD-11 | R6.1-A — quatro tabelas globais | SQL aprovado/congelado; sem certificação final (R/G) | 44a4fd4; migration 20261014111445 | Certificar A em stack nova após D2-R1 fechado | Não está em origin/main local; não assumir produção | BASE83 certificada; ACL/RLS/role probes |
| RAD-12 | R6.1-B — invariantes globais | SQL aprovado/congelado; aplicação pendente (R/G) | 0e952d6; migration 20261014130154 | Somente depois de A PASS e revisão humana | Não aplicada na rodada D2-R1 relatada | A certificada; radar_integridade |
| RAD-13 | R6.1-C-R1/B0/B1 — bootstrap histórico | HOLDs históricos documentados; substituídos por contrato BASE83 | R01; S01 e README de BASE83 | Preservar diagnóstico e rastreabilidade | 83 migrations e schema consolidado não recompõem sozinhos a base equivalente | P83/X83 e ledger L2 |
| RAD-14 | R6.1-C-B1-R1 — P83/X83, F22/E7 e ledger L2 | Contrato aprovado registrado (S/R) | S02: P83, X83 (218 exceções), F22 22 exclusões; E7 6 exclusões + pg_net atestado | Consumir contrato congelado sem hardening incidental | Exclusões locais não autorizam correções remotas | Plataforma, privilégios, histórico |
| RAD-15 | R6.1-C-B2 — bootstrap-base83-v1 | PASS B2 existente registrado; artefato congelado (S/R) | S01; baseline SHA256 56714560b35d38b7baf6185732dfa607b736f7f94c67bb19980d02ea5de55f02 | Reprovar igualdade em cada stack nova | PASS de artefato não certifica automaticamente toda stack | Target normativo P83/X83 |
| RAD-16 | pg_net D1/D2/D3/I1/I1-R1 e perfis de plataforma | Relatórios preservados; resultado de cada etapa a verificar | S01: RELATORIO-PGNET-*.md | Ler relatório aplicável antes de alterar perfil/companion | Não confundir estes D2 com janela D2 de certificação A | Pins, guardas, perfil P |
| RAD-17 | A-R1 — aplicação inicial e guarda pg_net | HOLD histórico, diagnóstico fechado registrado (S/R) | S03; history=2, 178 deltas esperados, 0 inesperados; contador 43→47 | Preservar prova positiva sem chamá-la de PASS A | Guarda antiga recusava adição legítima de tabelas | A, pg_net |
| RAD-18 | A-R1-R1 e retomada — correção da guarda | Guarda 36/36; pre-gate 267/267; HOLD D2-B histórico (S) | S03: 16/10, BASE83 history 0→1; fingerprint final não certificado; A/B não aplicadas | Ler avanço D2-R1; não apagar HOLD anterior | Cleanup daquela retomada concluído; recursos anteriores preservados | Janela 900 s; 27 invariantes e delta nominal das 4 tabelas |
| RAD-19 | R6.1-C-A-D2-R1 — otimizar janela de certificação | PASS DOCUMENTADO; revisão humana aprovada antes de RAD-20 | S05/R02: 16/10, 290/290; BASE83_CERTIFIED 162,632 s, delta zero, history=1; evidência histórica preservada | Pré-condição cumprida; acompanhar HOLD da tentativa RAD-20 | A/B não aplicadas naquela prova; orçamento A 224,251 s era estimativa | Meta BASE83 ≤720 s e janela ≤900 s preservadas |
| RAD-20 | R6.1-C-A-R1-R2 — prova final do observador R3 | PASS LOCAL R1-R2-R3; OBSERVER CERTIFIED; serialização PASS; A não certificada | 2026-10-16 19:24:20 BRT; longa/20 curtas/M1–M10/CLI nativos correlacionados; 360/360 offline; [relatório](C:/Users/Corretor/Documents/GitHub/Angariacao/.worktrees/radar-r6-1-c-b2-bootstrap-base83/supabase/bootstrap/base83-v1/RELATORIO-R6.1-C-A-R1-R2-R3.md) | Recomendar R6.1-C-A-R1-R3 após revisão; não iniciar automaticamente | Budget projetado 446.171 s <900; BASE83/A/B não aplicadas; Production 0/0; cleanup completo | 26 inputs intactos; D2-R1 PASS histórico; 900 s e BASE83≤720 s preservados |
| RAD-21 | Certificação B e R6.1-C2–C9 | Suspenso/pendente registrado (R) | R01: RLS, PostgREST, concorrência, idempotência, baseline e mutantes | A PASS → revisão humana → B → demais gates C | Não antecipar aplicação B | History esperado 2→3; cobertura 83+A+B, sem 85 entradas artificiais |
| RAD-22 | R6.2 — dual-write shadow | Bloqueado no roadmap (R) | R01; PL04 | Somente depois do encerramento R6.1 | R6.1 incompleta | Fundação global certificada |
| RAD-23 | R6.3 — scheduler, primeira baseline e global-new | Futuro (R) | R01; PL04 | Baseline confiável antes de sinalizar novidade global | Primeiro snapshot não gera novo | R6.2; universo e varreduras |
| RAD-24 | R6.4 — subscriptions e broker-new | Futuro (R) | R01; PL04 | Separar novo global de novo para corretor | Estado individual não certificado | R6.3 |
| RAD-25 | R6.4-F1 — filtro portal no banco | Futuro (R) | R01 | Filtrar antes de paginação/limit | Filtro client-only não fecha contrato | R6.4; consultas persistentes |
| RAD-26 | R6.5/R6.6 — grouping shadow e grupos no produto | Futuro (R) | R01; PL04 | Shadow saudável antes de expor grupos | Sem fusão destrutiva ou certeza física presumida | Novidade individual; evidência entre portais |
| RAD-27 | R6.7 — retirada do legado | Futuro condicionado (R) | R01 | Comprovar substituição antes de retirar caminho antigo | Não retirar durante R6.1-C | Trilha nova validada; ordem final a confirmar |

### 5.2 Retirados — ciclo de carteira, retomada e relatório

| ID | Frente / subfrente | Estado canônico sustentado | Última evidência localizada | Próximo gate | Bloqueios / limites | Dependências |
|---|---|---|---|---|---|---|
| RET-01 | Fase A — retirado separado de Perdido | Integrado; produção registrada (G/M) | b5299ea; P01; M03 | Preservar status/histórico e distinção carteira/captação | Nenhuma evolução automática inferida | Pipeline, KPIs, marcos |
| RET-02 | B0 — não encerrar retirado por resposta | Produção registrada; smoke real registrado (M/G) | a6ce328; M03 | Preservar guarda e corrida no UPDATE | Não remover trava ao evoluir C4 | Webhook, atribuição |
| RET-03 | B1 — worker fechado por tipo | Produção registrada (M/G) | 75deaeb; M03 | Preservar livre/verificação e recusa de desconhecido | Retomada continua bloqueada para envio | Worker de mensagens |
| RET-04 | B2 — schema de retomada e cancelamento | Produção registrada (M/G) | 4ae9ce4; migration 20261001210000; M03 | Preservar identidade imutável, uma ativa, cancelamentos | Sem envio habilitado por existir schema | RLS, imóvel retirado, status-alvo |
| RET-05 | B3 — atribuição de resposta à retomada | Produção registrada, operacionalmente inerte sem envio (M/G) | e3cf000; M03; P01 | Preservar janela 48h e concorrência de contextos | Nenhuma reativação automática | B5; motor de atribuição; B0 |
| RET-06 | B4 — UI e API de programação | PRODUÇÃO INERTE registrada; não apenas planejado (M/G/P) | 9abf87b; M03; P01; D02 | Checkpoint próprio para torná-la liberável | Flag local-only; Preview/Production desligados; envio barrado por B1 | B2/B3; revisão e gate de ativação |
| RET-07 | B5 — envio de retomada | Não iniciado no último registro (M) | M03; PL02 | Revalidação e smoke controlado conforme gate G1 | B4 não liberado; chamada externa exige escopo próprio | B4; worker; contato seguro |
| RET-08 | B6 — CTA Reativar, marca na Caixa e go-live | Futuro no plano (PL) | PL02 §22 | Validar reativação humana e fechamento após smoke | B5 pendente | Caixa, Central, B4/B5 |
| RET-09 | C1 — data, motivo e observação | Produção registrada (M/G/P) | a0291b3; migration 20261002210000; M04 | Preservar null como desconhecido e escrita especializada | Não fabricar datas históricas; não gravar por upsert genérico | Persistência e reativação |
| RET-10 | C2 — retirada manual e edição | Produção registrada; smoke registrado (M/G) | 600dc85; M04 | Preservar motivo, data Brasília e CAS | Perdido histórico não pode ser reescrito | C1; notas e versionamento |
| RET-11 | C3 — relatório de retirados e CSV | Integrado; produção descrita (G/P) | 5a4d677, P01 §§462+ | Manter filtros/contagens/CSV com mesma base | Não usar relatório como prova de conversão C5 | C1/C2; relatório atual |
| RET-12 | C4 — IA retira captado em vez de marcar Perdido | Planejado; implementação/produção a verificar (M/P) | M04; P01 ainda descreve guarda B0 e fluxo antigo | Reauditar efeito e coordenação com Contatos C3/IV-4C | Não há checkpoint C4 final localizado | Webhook, evidência de captação, histórico append-only |
| RET-13 | C5 — conversão de Perdidos captados e retirados antigos | Planejado; execução a verificar (M) | M04: amostra histórica de 15 Perdidos captados + 5 retirados; não é contagem atual | Revisão humana por item, datas comprovadas, plano de conversão | Nenhuma conversão executada comprovada; dados incertos ficam null | C1–C4; preservar histórico Perdido |

### 5.3 Agenda, Mensagens e WhatsApp

| ID | Frente / subfrente | Estado canônico sustentado | Última evidência localizada | Próximo gate | Bloqueios / limites | Dependências |
|---|---|---|---|---|---|---|
| MSG-01 | Agenda base, visitas e confirmação | Implementado/integrado (P/G) | P01; 21453b9, 794cd5a | Preservar distinção visita provisória/confirmada | Sem nova validação real nesta consolidação | Data operacional, IA controlada |
| MSG-02 | M1 — modelo de disponibilidade | Produção registrada (M/G) | fd54e27; migration 20260917140326; M01 | Preservar tipo, origem, motivo e agenda_id | Não reclassificar mensagens livres legadas sem evidência | Agenda e mensagens_agendadas |
| MSG-03 | M2 — pertinência e evidência temporal | Produção registrada (M/G) | f57feb7; M01 | Preservar cadência e evidência estruturada | Visita classificada só por IA não confirma disponibilidade | Contexto de proprietário, visitas |
| MSG-04 | M3/M4 — worker, consolidação e transição atômica | Produção registrada; integração local 31/31 registrada (M/G) | b33f942; migration 20260921120000; M01 | Preservar reserva, efetivação após envio e resultado incerto | Envio incerto não volta automaticamente à fila | Evolution, RPCs e cron |
| MSG-05 | M5 — explicação na UI/Agenda/Assistente | PRODUÇÃO registrada; backlog da conversa está desatualizado (M/G) | e1c8467; M01 | Preservar motivos legíveis e próxima verificação | Não equivale a M6 encerrado | M3/M4; explicacaoMensagemAgendada |
| MSG-06 | M5.1 — mensagens e Agenda por imóvel no Assistente | Correção integrada (G); confirmação final de smoke a verificar | 29eae27; M01 relata falha do M6 e correção | Recuperar re-smoke das quatro perguntas originais | Integração não prova roteamento final em uso real | Ferramentas e contexto tipado |
| MSG-07 | M6 — smoke real da cadeia | Parcial registrado; FECHAMENTO A VERIFICAR (M) | M01: quatro ramos passaram; Assistente falhou antes de M5.1 | Re-smoke após correção e relatório final | Não declarar frente completa só por M1–M5 integrados | M5.1; contato/dados seguros |
| MSG-08 | Mensagens livres e imóveis indisponíveis | Correção integrada (G/P) | f8ee7be; P01 | Preservar recusa em estado terminal/retirado | Não usar tipo livre para contornar guardas | Cadastro, worker, envio |
| MSG-09 | Jobs: claim/retry e processamento órfão | Correção integrada (G/P) | 0016f49 / 90a0d52; P01 | Observar recuperação e resultados incertos | Padrão geral unificado de jobs é proposta, não entrega comprovada | pg_cron, gateway/PostgREST, logs |
| WA-01 | Envio/recebimento, instância por conta e telefone/JID/LID | Produção histórica registrada; implementado (M/P/G) | M05; 45d684d, 5a93c8d, bab75c5; P01 | Preservar destinatário correto, histórico e isolamento | Não enviar mensagens de teste nesta revisão | Evolution, RLS e identidade de canal |
| WA-02 | Histórico bidirecional, importação e realtime | Integrado (G/P) | 45d684d, 7a8d085, fc867f9; P01 | Preservar dedupe e ausência de lost update | Importação que replica contexto tem contrato próprio | Notas, store, mensagem externa |
| WA-03 | Abordagens, tentativas, ranking e follow-up em lote | Implementado (P/G) | P01 §§1015–1278; 698b10e | Preservar vocabulário e confirmação de desfecho | Silêncio não é derrota; contato não é imóvel | Motor comum, origens, WhatsApp |
| WA-04 | Áudio/transcrição e extração de compromissos | Implementado; instrumentação M1c-E2 registrada (G/P/D) | 4583eca, 57d2a9d; D03 | Observação natural e regressão conforme ambiente | Nenhuma transcrição provocada nesta revisão | Evolution, IA, Agenda |
| AGEN-01 | Google Agenda / OAuth / espelhamento | Implementado/integrado (P/G) | b79d8f0, P01 §§2536+; INTEGRACAO/DEPLOY | Preservar idempotência e semântica do espelho | Validade atual da conexão de cada conta a verificar | OAuth, sessão, agenda |

### 5.4 Contatos, atribuição e fronteiras de efeitos

A frente histórica de normalização/modularização de dados buscava reduzir a concentração de responsabilidades em `imoveis`, separando identidade do contato (`contatos`), canais (`contatos_telefones`), vínculos com imóveis (`imoveis_contatos`) e revisões humanas (`contatos_revisoes`). CON-01 preserva a fundação já registrada; CON-02–CON-08 preservam a evolução de atribuição e efeitos. A continuidade futura está no registro existente CON-09, **PAUSADA / NÃO ATIVA**, sem nova frente duplicada. Antes de qualquer retomada, exige-se nova auditoria do estado atual e análise de conflito/sobreposição com Radar, IA, Pipeline, WhatsApp/Contatos, RLS, triggers e marcos históricos; só depois caberá decisão explícita do usuário sobre escopo e ativação. Este registro não autoriza implementação, alteração de banco, migrations ou Production.

| ID | Frente / subfrente | Estado canônico sustentado | Última evidência localizada | Próximo gate | Bloqueios / limites | Dependências |
|---|---|---|---|---|---|---|
| CON-01 | Fase 0 e 1a-A — FKs compostas e fundação relacional | Produção registrada (M/G/P) | 755c1b9, befbbd8/835f12b; M06; P01 §§1429+ | Preservar pessoa ≠ canal ≠ imóvel | Telefone/nome não provam identidade; sem fusão automática | RLS por user_id |
| CON-02 | 1a-B e 1a-C1/C1.1 — motor e shadow | Integrado; produção histórica registrada (G/M) | f7552dc, 96af4e9, a4d0516; M06 | Preservar precedência e registro | Não usar updated_at como autoridade de assunto | Vínculos e contexto temporal |
| CON-03 | 1a-C2.1a — autoridade parcial | Produção registrada (M/G) | c44d24c; M06 | Preservar fallback explícito e exceção retomada | Motor pendente ainda não é portão ativo | Atribuição, legado, B3 Retirados |
| CON-04 | 1a-C2.1b.1 — dedupe por conta e origem vence eco | Produção registrada; smoke funcional real ainda pendente no registro (M/G) | df63f4f/cbbb013; migration 20260929210000; M06 | Fechar smoke específico sem confundir com consolidação | Garantia depende de manter notas persistidas | Advisory lock, key.id, conta |
| CON-05 | 1a-C2.1b.2 — consolidação na identidade por conta | Produção registrada; smoke funcional PASS registrado (M/G) | 9489fd0; migration 20260930120000; M06 | Preservar cópias exatamente no conjunto consultado | Não reaplicar efeitos por falha de histórico | M3/M4, origem e eco |
| CON-06 | C2.2 — observação antes do portão | PASS de leitura registrado (M) | M06: 07/10, 186 eventos, zero divergente | Consumir registro antes da ativação C3 | Amostra histórica não garante ausência futura de dano | C2.1a/b |
| CON-07 | C3-A1/A2 — avaliador e shadow do portão | Produção registrada; somente observação (M/G/código) | 3288e21, d8746cb; M06; C01 | C3-A3: analisar eventos naturais e decisões pendentes | NÃO suprime efeitos; 0 eventos no último retrato da memória | Webhook, resultados confirmados versus execução sem prova |
| CON-08 | C3-A3/C3-B — observar e ativar portão | Não iniciado no último registro; estado atual a verificar (M) | M06; nenhum PASS posterior localizado | Decisões de produto, amostra e contrato próprio | Não ativar por inferência; coordenar Retirados C4 e IV-4C | C3-A; pendências/terminais/sem contato/falhas |
| CON-09 | Normalização/modularização de dados — continuidade histórica: 1a-D; 1b gestão/fusão/arquivamento; 1c consumidores por contato_id | **PAUSADA / NÃO ATIVA — futura, sem implementação autorizada** | Decisão explícita do usuário em 16/10/2026; [checkpoint documental](checkpoints/CON-09_2026-10-16_1930_CHECKPOINT.md); M06; P01 fronteira 1b/1c; fundação em CON-01 | Nova auditoria do estado atual e análise de conflito/sobreposição antes de qualquer retomada; recuperar escopo de 1a-D e evidências posteriores; submeter escopo e ativação à decisão explícita do usuário | Sem código, banco, migrations ou Production por este registro; não criar fusão silenciosa nem cruzar tenant; Radar e IA seguem como únicas frentes de implementação ativas | Radar, IA, Pipeline, WhatsApp/Contatos, RLS, triggers e marcos históricos; modelo relacional, resolução humana, consumidores M2/M3/M4 |

### 5.5 Vendas comerciais e imóvel de venda no Pipeline

| ID | Frente / subfrente | Estado canônico sustentado | Última evidência localizada | Próximo gate | Bloqueios / limites | Dependências |
|---|---|---|---|---|---|---|
| VEN-01 | Vendas V1-A — domínio puro | Integrado; produção registrada (G/M/P) | faecf96; D04 | Preservar oportunidade separada de imóvel | Ganha não implica imóvel Vendido | Contrato comercial, valores null ≠ zero |
| VEN-02 | V1-B1/B2 — fundação persistente e operações | Produção registrada (M/G/D) | 5e58bde, 25304cd; M19: migrations B1/B2 em 05/10, ledger 79 e deploy READY | Preservar RPCs, atomicidade, CAS, idempotência e snapshots | Ledger comercial não se confunde com locações/repasses | Auth, RLS, eventos e recibos |
| VEN-03 | V1-B3.1/B3.2/B3.3 — interessado, banco e adaptador | Integrado; produção registrada (G/D) | 6774dce, 5e25ff5, c69a18b; D04 | Preservar interessado confirmado/imutável | Mesmo nome não autoriza reuso; ganho não altera carteira | Contatos por conta, executor único |
| VEN-04 | B3.4a e B3.4a-R — UI somente leitura | Integrado; produção corroborada por registro posterior (G/M) | c8a0494 histórico; 05d3156 reconciliado; D05/M07 | Preservar snapshot histórico, RLS e drawer | P01 ainda dizia sem Production: frase histórica superada | Persistência B1–B3.3 |
| VEN-05 | B3.4b-A — catálogo factual de imóveis candidatos | Integrado; produção registrada em prechecks posteriores (G/M/D) | 6fe223f; D05; M07 registra deployment do 6fe223f | Fechar prova real de leitura com duas contas se pendente | Catálogo não prova elegibilidade na gravação | Auth/RLS; finalidade e status atuais |
| VEN-06 | B3.4b-B1 — criar oportunidade sem imóvel | Implementado e integrado (G); PASS local com smoke real pendente (D) | bdf163e→2539370; D06, 09/10 | Exercitar Auth/PostgREST real e confirmar gate final de produção | Não extrapolar PGlite/fixtures para fluxo real; produção específica a verificar | Interessado explícito; RPC atual; idempotency key |
| VEN-07 | B3.4b — vínculo de imóvel e elegibilidade (B/G) | Demais fatias condicionadas; a verificar (R/D) | R03: D1 NULL, D2 indisponibilidade, D3 força da regra | Fechar decisões de seleção e recusa no banco | Regra obrigatória de RPC exige migration própria | IV-4; corrida finalidade/status; cronologia SQL |
| VEN-08 | B3.4c — operações comerciais na UI | Futuro/sem checkpoint final (R/D) | R03; D04 | Contrato próprio para editar/transitar/ganhar/perder | Não confundir RPC existente com UI entregue | B3.4b; confirmação e histórico |
| IV-01 | IV-1 — finalidade, valor_venda e vendido_em inertes | Produção documentada (P/G/D) | 43d863e/cfb5138; migration 20261006200215; D07 | Preservar campos null e checks | Nenhum backfill automático | Modelo de imóvel |
| IV-02 | IV-2B/C — persistência e cadastro/edição | Produção documentada; integrado (P/G) | e614311; D07; P01 §§3299+ | Preservar valores ocultos e finalidade efetiva | Criação exige finalidade; legado não é locação presumida | IV-1; Garimpo promoção; Realtime |
| IV-03 | IV-3A/.2/.4 e IV-3B — valores, ações e filtro de finalidade | PASS IV-2/IV-3A e IV-3B PRODUCTION registrados (R/G) | R04: df76ea2 (IV-2/3A) e eb6705c (IV-3B), 07/10; smoke desktop/mobile, banco preservado | Preservar ações sticky, finalidade separada de valor e filtro | Trechos locais antigos de D07/P01 superados pelos relatórios finais | Pipeline, CSS responsivo |
| IV-04 | IV-4A — impedir locação de finalidade venda | Produção registrada/documentada (M/P/G) | 139cb51; migration 20261008150000; M08/D07 | Preservar guarda no banco e interface | Não proibir locação de locacao_venda/null por extensão indevida | Ledger de locação, repasses |
| IV-05 | IV-4B1 — disponibilidade no worker | Produção registrada; cron natural com lote vazio (M/G) | 3b6fc73; M07, 09/10 | Observar primeiro dado elegível e preservar guarda | Decisão nova ainda não exercida em dado real no registro | Worker, consolidação e finalidade efetiva |
| IV-06 | IV-4B2/B3/B4 — criação/seleção, cancelamento e defesa SQL | Não iniciados no último registro; B4 SQL condicionado (M) | M07 | Fechar decisão de cancelamento e escopo de migration | Não afirmar cadeia completa só por B1 | Agenda/lote/envio; regra de finalidade |
| IV-07 | IV-4C — encerramento automático | Proposto/pendente (M) | M08 | Coordenar C3-A3/B e Retirados C4 | Decisões de efeitos abertas | Webhook, histórico, captação |
| IV-08 | IV-4D/E/F — Sophia, modelos e dupla finalidade após Locado | Proposto/pendente (M/P) | M08; P01 | Definir cada guarda e contrato | Integração externa e semântica pós-Locado não resolvidas por A/B1 | Sophia, WhatsApp/IA; locacao_venda |
| IV-09 | IV-5 — ação humana Vendido | Planejado; não localizado como entregue (P/R) | P01/D07 | Ação própria, marco e data; não derivar de oportunidade ganha | Contrato de desfecho pendente | Guardas e histórico append-only |
| IV-10 | IV-6 — métricas/relatórios de venda | Futuro (P) | P01/D07 | Separar Locados e Vendidos e fórmulas financeiras | Não misturar com KPIs de locação | IV-5; motor compartilhado |
| VEN-09 | Plano antigo V1–V7 de venda+locação | Histórico parcialmente sobreposto; equivalência a verificar (PL) | PL01 §§3.6: V1 modelo, V2 núcleo, V3 Pipeline, V4 metas, V5 textos/IA, V6 mercado, V7 membros | Mapear itens para IV/Vendas/Radar sem contar duas vezes | Plano antigo excluía dupla finalidade; contrato posterior IV aceita locacao_venda | IV, Vendas comercial, mercado e organização futura |

### 5.6 IA, Cérebro, qualidade e JEV

| ID | Frente / subfrente | Estado canônico sustentado | Última evidência localizada | Próximo gate | Bloqueios / limites | Dependências |
|---|---|---|---|---|---|---|
| IA-01 | IA-M1/M1a/M1b — auditoria e centralização | Produção de M1b registrada; integrado (M/G) | d983497; M09 | Preservar executor único e baseline anterior à troca de modelo | Auditoria histórica de modelo não é configuração atual verificada | Permissões e política IA por ambiente |
| IA-02 | M1c-A — metadados de execução | Produção documentada (D/G/M) | daccc40; migration 20260930200000; D03 | Preservar consumo separado de sucesso funcional | Não registrar falha como linha de ia_uso | Executor, logs e custo |
| IA-03 | M1c-B — falha do provedor | Produção documentada (D/G) | fc48f99; D03 | Preservar evento e exceção original | Observação natural de cada fluxo pode estar pendente | log_eventos e execucao_id |
| IA-04 | M1c-C — resposta rejeitada | Produção documentada (D/G) | 91b6335; D03 | Medir rejeição separada de falha | Usage não comprova resposta aceita | Validadores e auditoria |
| IA-05 | M1c-D1/D2 — Responses/Assistente | Produção documentada (D/G) | 23ec825, 630deb4; D03 | Preservar metadados/falhas por chamada e execução | Nenhuma chamada paga nesta revisão | Orquestrador F10 |
| IA-06 | M1c-E1/E2 — embeddings e transcrição | Produção documentada (D/G) | ec296f6, 57d2a9d; D03 | Validação natural oportunística por fluxo | Deploy não implica amostra natural suficiente | F13/F2; ambiente autorizado |
| IA-07 | M1c-F — baseline observacional | OBSERVAÇÃO; não encerrado no último registro (D/M) | 88a4695; D03: T0 em 02/10 | ≥200 F1 instrumentadas E ≥2 semanas completas UTC; congelar baseline final | Volume/janela atuais não consultados; calendário sozinho não fecha | Cohort C1 fixo, consultas Q1–Q8, sem gerar chamadas artificiais |
| IA-08 | Q1 — auditoria de qualidade / Evals | Planejado; sem PASS localizado (R/M/D) | R01, M09, D03 | Definir corpus, evidência e qualidade após gates anteriores | Não trocar modelo a partir de latência/custo apenas | M1c-F; golden conversations |
| IA-09 | Q2/Q3 — qualidade contextual e feedback→Evals | Planejado na conversa; contrato detalhado a verificar (R) | R01 | Recuperar definições e critérios de aceite | Não confundir com INV-Q2/Q3 nem consultas Q2/Q3 do baseline | Q1; feedback supervisionado |
| IA-10 | Atendimento: protocolos, contexto temporal e auditoria | Implementado/integrado (P/G/D) | 9bc7f99, 446ff48, 86a1546, 173bf4e; D08/P01 | Preservar hierarquia de fatos/protocolos e confirmação | Casos semânticos conhecidos não equivalem a qualidade integral | WhatsApp, evidência temporal, auditor determinístico/LLM |
| IA-11 | Assistente: continuidade, contexto tipado e ações confirmadas | Implementado/integrado (P/G/D) | 545995c, 33ad978, a5e4d78, 794cd5a, 4977060; D08 | Preservar fonte real por turno e confirmação de ações | M5.1/M6 ainda exigem seu próprio gate | Agenda, carteira, protocolos, permissões |
| IA-12 | Piloto automático / catálogo de capacidades | Implementado/integrado; governança comum é proposta distinta (P/G/R) | 21f0dff; P01; R05 | Revisar política de cada capacidade antes de ampliar autonomia | Não inferir executor universal novo entregue | Confirmação, idempotência, auditoria |
| IA-13 | Feedback, ensino supervisionado e preferências | Implementado/integrado (P/G) | 3618f65, 11bf8c4, 6d5dded, a731095; P01 | Medir efeito do ensino e preservar isolamento/hierarquia | Edição pontual não vira regra automaticamente | Protocolos, fatos, consentimento explícito |
| IA-14 | Cérebro da IA — explicação de fontes, ações e falhas | Implementado/integrado (P/G) | e13bb45, fc99789, 5da5450; P01 §§2384+ | Manter representação fiel ao fluxo observado | Explicação visual não é portão operacional novo | Logs, capacidades, contexto |
| IA-15 | JEV — decisão/classificação/validação no Cérebro | **HOLD / PAUSADO / NÃO AVANÇAR AGORA**; JEV-GUARD-G2-C-B1 encerrado como OBSERVABILITY_INCONCLUSIVE | [B1 encerrado](C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-JEV-GUARD-G2-C-B1.md); representação semântica independente do oracle suficientemente confiável não demonstrada; checkpoint de pausa no histórico abaixo | Possibilidade futura: revisão independente da elegibilidade e do protocolo de observabilidade — NOT_STARTED; nenhum gate ativo criado | Provider e implementação bloqueados; distinção automática GG0-29 × GG0-04/11/12 não demonstrada; completude UNKNOWN/UNRESOLVED; desempenho NOT_MEASURED | Decisão/coordenação: aguardar fechamento/reavaliação do gate corrente da frente principal de IA; reavaliação prevista em 19/10/2026, sem dependência técnica nova; retomada exige decisão humana explícita e novo gate próprio |
| IA-16 | Política de IA por ambiente e prevenção de consumo | Integrado/documentado (G/D) | f386590, a21beed, 1d2c8ed; D09 | Preservar bloqueios Preview/CI/Codex e ensaios manuais | Credencial não autoriza teste pago | Permissões, executor e orçamento |
| IA-17 | Langfuse, PostHog e Trigger.dev | Ideias futuras na conversa, sem implantação comprovada (R) | R01 | Discovery/decisão própria antes de adoção | Nenhuma conexão, conta, custo ou uso atual verificado | IA/Evals; métricas de produto; jobs |

### 5.7 Garimpo em Campo, Investigador e identidade do imóvel

| ID | Frente / subfrente | Estado canônico sustentado | Última evidência localizada | Próximo gate | Bloqueios / limites | Dependências |
|---|---|---|---|---|---|---|
| GAR-01 | Garimpo C0–C3 — núcleo, schema, grants e fronteira de dados | Integrado; série C1→C13 encerrada registrada (G/P/M) | e1cc6cc, 5152682, b678231, 9be51da, 49ebf77; M10/D10 | Preservar identidade, passagem e fronteira | C0 técnico não é autorização para evolução nova | RLS, Storage e RPCs |
| GAR-02 | Captura mínima, câmera/galeria, exclusão coordenada e rascunho | Integrado (G/P) | f51d09c, c1d2bf8, 6cf90e2, cd3e555; D10 | Preservar recuperação e compensação de falhas | Não inferir OCR/visão pela existência de foto | Fotos, Storage, browser mobile |
| GAR-03 | GPS, ViaCEP, endereço e dedupe/merge de identificados | Integrado (G/P) | 35c3cea, b75d3bc, 2df9bd3, 0886d4e; P01 | Preservar precisão, incerteza e decisão humana | Localização aproximada não comprova endereço | Geografia, identidade, carteira |
| GAR-04 | Classificação por passagem, reuso e revisão temporal | Integrado (G/P) | 1c502a1, 4be5a68; P01 §§3431+ | Preservar revisão/fingerprint e confirmação humana | IA não classifica imóvel inteiro nem apaga confirmado | Claim/lease, catálogo e IA-texto |
| GAR-05 | C9.1/C10/C10.1 — UX, promoção, recuperação e Investigador | Integrado (G/P) | 01d47d9, 6ae91bf, 80f18e0, e6d0b62; D10 | Preservar promoção humana e captura curta | Uma foto/local não vira oportunidade automaticamente | Pipeline, Investigador, mobile |
| GAR-06 | C11/C12 — fechamento, transparência e catálogo visual | Integrado (G/P) | b3acfee, c89eebf; D10 | Preservar leitura de campo e política de localização | Visão computacional não incluída | Fotos, privacidade |
| GAR-07 | C13A/B/C — memória persistente e confirmação | Produção documentada; E2E PASS registrado (P/M/D) | 9958b8b, 9abac46; migration 20260915190000; M10/D10 | Fechado; evoluções são fases novas | Não reaplicar migration; valor_anunciado reservado | Investigador, afirmações append-only, fontes |
| GAR-08 | G1 — logradouro pelo ponto do mapa | Produção registrada; G1 encerrado (M/G) | 5e439cf; M11: 24/09, sugestão por ponto do mapa e smoke real no celular | Preservar geocodificação reversa só do ponto do mapa e aceite humano | Sugestão não altera coordenada nem inventa número/bairro/CEP | Mapa, ViaCEP e sugestão humana |
| GAR-09 | Fase 2 — mapa global/calor, lotes, exclusões abandonadas e não-duplicata | Futuro em documento; implementação a verificar (P) | P01 §3671 | Separar e aprovar cada subfrente | Sem código/checkpoint final localizado | Geografia, cron, recuperação de leases |
| GAR-10 | Fase 3 antiga — investigação persistida | Parcialmente coberta por C13; equivalência de restante a verificar | P01: §3671 ainda futura; §3731 C13 entregue | Mapear sobreposição e requisitos restantes | Não recadastrar a persistência como totalmente futura | C13; evidências/contradições |
| GAR-11 | Fase 4 — visão de fachada | Futuro condicionado (P) | P01 §§3652/3671; P02 | Protocolo próprio e autorização antes de ensaios | Foto não autoriza inferir dono/endereço; protótipo pausado | Dados/imagens e avaliação real |
| GAR-12 | Fase 5 — score de oportunidade | Futuro condicionado (P) | P01 §3671 | Mínimo 200 registros com desfecho antes de fórmula | Volume atual não verificado; não confundir com score de correspondência | Histórico de resultados reais |
| GAR-13 | Fase 6 — inteligência de mercado agregada | Futuro (P) | P01 §3671 | Definir agregados, utilidade e privacidade | Sem entrega comprovada | Qualidade e base longitudinal |
| INV-01 | A1/A2 — latência, orçamento global e resposta parcial | A1 produção registrada; orçamento integrado; gate nominal A2 a verificar | 375a2a9, 9f9585a; M12; PL03 | Recuperar medição/decisão do timeout final | A memória A1 antiga ainda chama A2 de pendente | RapidAPI, deadline e log sem consulta textual |
| INV-02 | B1 — consultas progressivas e planejamento de endereço | Integrado; produção registrada em memória posterior (G/M) | 528f0a5; M13 | Preservar âncoras e geografia conservadora | Texto sem âncora não garante múltiplas pesquisas | Entradas estruturadas |
| INV-03 | B2 — relevância, descartados e código interno fora da busca | Produção registrada; observação natural (M/G) | dd5466d, 715bece; M13 | Observar falsos negativos e descartes | Correspondência não prova veracidade do anúncio | Referência pública ≠ código Angario |
| INV-04 | B3.1 — scoring determinístico dentro da faixa | Produção registrada (M/G) | 2408552; M14 | Preservar faixa/score separados de confiança factual | Não transformar score em verdade da memória | Sinais de correspondência |
| INV-05 | B3-M1/M2/M3 — higiene, desempate e rejeição humana | Integrado/documentado (G/P) | 2ee95d1, 1b27337, 366dc0f; migration 20260924210000 | Preservar confirmada/rejeitada e estados desconhecidos | Hipótese não supera confirmação; rejeitada nunca é vigente | Memória C13 |
| INV-06 | B3.2a e demais B3.2/B3.3 | Contexto confirmado B3.2a integrado; restante a verificar | fd7e68f; P01; M14 | Separar comparação observacional de alteração de score | B3.2a não prova toda a proposta B3.2 concluída | Confirmações compatíveis, memória |
| INV-07 | AB4/AB5 — UX e smoke do plano original | UX integrada; fechamento nominal AB4/AB5 a verificar | 9e14ec9; PL03; P01 | Localizar relatório de smoke e escopo final | Não usar smoke de C13 para provar todo Investigador | A/B, provider e resultados parciais |
| INV-08 | INV-Q1 — Nenhum resultado confirmado | Produção registrada; smoke passivo (M/G) | 5b7bf00; M15, 09/10 | Preservar resultados não confirmados fora do principal | Faixa forte não equivale a verdade factual; backend inalterado | Apresentação da investigação |
| INV-09 | INV-Q0/Q2/Q3/Q4 | Não iniciados no último registro; escopo a verificar (M) | M15 | Recuperar definição de cada Q e ordem aprovada | Não confundir com IA-Q1/Q2/Q3 | Investigador atual; decisões D1/D5 já registradas |
| INV-10 | Dívidas de extrator/endereço/geografia | Pendências históricas a verificar (M) | M13: numeral romano, bairro com número, duas ruas e cidade/UF | Reproduzir por fixture e preservar falso negativo baixo | Não são bugs atuais confirmados nesta revisão | Parser, dados estruturados, relevância |

### 5.8 Avaliação, mercado, operação, produto e infraestrutura

| ID | Frente / subfrente | Estado canônico sustentado | Última evidência localizada | Próximo gate | Bloqueios / limites | Dependências |
|---|---|---|---|---|---|---|
| AVA-01 | Avaliação rápida, valor final e comparáveis | Integrado (G/P) | 8f03f8b, bfc25dd, 05745f1, 62f5322; P01 | Preservar fonte, região e decisão do corretor | Anúncio/comparável não comprova valor realizado | Mercado, geografia e histórico |
| AVA-02 | Fases 5A/5B1/5C/5D — mercado, logs, qualidade e frescor | Integrado/documentado (G/D) | 7c8e1a0, d318468, ea2f48e, bcd6c86; D08 | Preservar sanitização, append-only e indicação de frescor | Status de implantação de cada fonte externa a verificar | Comparáveis híbridos; proveniência |
| AVA-03 | Mercados monitorados multiestado e coleta periódica | Integrado/documentado (G/P) | 778d169, e9da5c5; P01 §§2800+ | Preservar lease/claim, orçamento e finalidade real | Não habilitar mercados/custos novos nesta revisão | Cron, portais, RLS/grants |
| AVA-04 | Integrações Avaliação ↔ Pipeline/Central/Radar/Investigador | Integrado (G/P) | 9b5c585, 4fcf2ef; P01 | Preservar contexto recebido e seleção de comparáveis | Não inferir enriquecimento automático ilimitado | Identidade e qualidade da entrada |
| AVA-05 | Terreno por m², região/cidade e separação terreno/construção | Ideia solicitada; sem implementação comprovada (R) | R06: conversa de 11/10 | Discovery de dados/cobertura e contrato de avaliação | APIs citadas são alternativas não validadas; sem preço/status inventado | Base de terrenos/comparáveis, área e finalidade |
| PAR-01 | Parcerias P1 — discovery | Discovery entregue para revisão; nada implementado no registro (M) | M16: 06/10, base 9abf87b | Resolver 13 decisões e gate de cronologia antes de P2 | Base do percentual, ciclos, Locado/exclusão entre lacunas | Tenant por conta; repasse não contém comissão total |
| PAR-02 | Parcerias P2+ — parceiros e vigência por imóvel | Proposta, não schema existente (M) | M16: parceiros + imoveis_parcerias, RPC/CAS/idempotência | Aprovação do contrato/decisões | Não tratar parceiro interno como outra conta autorizada | P1; Vendas/IV e ordem SQL |
| FIN-01 | Locações, políticas de repasse, previsão e recebimento em lote | Implementado/integrado (G/P) | e710110; P01 §§395+ | Preservar ocorrência separada, snapshot e atomicidade | Zero dados no retrato antigo não prova ausência atual | Finalidade, ledger de locação, IV-4A |
| FIN-02 | Comissão, solicitação de recebimento e documentos | Implementado (P/G) | 08c8dac; P01 | Preservar comissão do corretor distinta da imobiliária | Não inventar base financeira de Parcerias | Cadastro, políticas e valores confirmados |
| CRM-01 | Pipeline, carteira, statusHistory e marcos permanentes | Implementado/integrado (G/P) | c078904, 1a62d66; P01 §§964+ | Preservar transição única, marcos e histórico append-only | Carteira não equivale a captação; retirado não é Perdido | Mutações, persistência antes do store |
| CRM-02 | Pré-cadastro, desdobramento e exclusão transacional | Implementado/integrado (G/P) | c3e687a, 701ecf6; P01 | Preservar FKs, compensações e campos não escritos | Não excluir registros nesta consolidação | Agenda, notas, mensagens, Garimpo |
| CRM-03 | Importação de planilha e PDF CasaSoft | Integrado/documentado (G/P) | 51a9e36, 55825a3; P01 §§346+ | Preservar proveniência, revisão e marca de importado | Origem anúncio de venda não determina finalidade | Cadastro, contatos e datas |
| CRM-04 | Dashboard, Metas, Insights, Relatórios e conquistas | Implementado/integrado (G/P) | P01; BASELINE_ETAPA0; 3f9e1df, 19403f7 | Preservar concordância do motor compartilhado | Métricas de venda ainda dependem IV-6 | Motor de cálculo, datas, coortes |
| CRM-05 | Home / Foco do dia / mapa inteligente | Implementado/integrado (G/P) | 6f2ba15, 3443df2, ebbad42; P01 | Preservar ação de rotina, filtros e leitura territorial | Mapa de calor do Garimpo é evolução futura distinta | Carteira, Agenda, evidência temporal |
| CRM-06 | Cidade C1–C3 / ViaCEP / padrão da operação | Integrado; produção registrada (M/G) | 68b9a7c, 748fa88, db8d004; PL01/M01 | Preservar precedência e edição livre | C4 fuso Google foi removida daquele plano; não registrar como pendente | Geografia multiestado; seis formulários |
| EXT-01 | Integração Sophia — autorização, locação e comissão | Implementado/documentado (G/P/D) | 8722814; P01 §§2418+; D11 | Preservar contrato externo e ownership | Sophia não prova ledger novo de locação; guardas IV-4D pendentes | Mapeamento por conta; idempotência |
| AUTH-01 | AUTH-1 — sessão stale, boot e AUTH-1b servidor | Produção registrada; integrado (M/G) | 08b1ca5, 561b6f5, d8b1c10; M17 | Preservar distinção 401/403/503 e recuperação segura | Não classificar erro de rede como logout definitivo | Supabase Auth, fetch autenticado |
| AUTH-02 | AUTH-1b.2/1c e dívidas de rotas restantes | Pendentes no último registro; escopo final a verificar (M) | M17: outras rotas Bearer, mercadosMonitorados.usuarioAtualId, whatsapp/conexao | Auditoria e contrato por rota | Não presumir cobertura global de AUTH-1b | Auth e isolamento de conta |
| SEC-01 | RLS, grants, service role, testes de segurança e secrets | Regras/controles implementados (G/P/D) | fd22c8a, d318468; AGENTS; P01 | Preservar dono confiável e filtro explícito | Schema histórico e RLS automática não bastam para bootstrap | Migrations, API privilegiada |
| SEC-02 | Dívidas candidatas SD-SEQ/CONFIG/COMPARAVEIS/PUBLIC-RPCS/AUTORLS/DEFAULTS | CANDIDATOS à revisão, não vulnerabilidades confirmadas (S) | S04: 14/10 | Auditoria separada ACL/RLS/fluxos antes de qualquer correção | Nenhum REVOKE remoto autorizado; F22 não deve ser recontado | Contrato P83/X83; consumidores legítimos |
| OPS-01 | Admin, contas, cargo/carteira, teto IA e saúde técnica | Implementado/integrado (G/P) | ae80e72, 8c84418, 21bb33d; P01 §§3813+ | Preservar acesso do operador e logs sem conteúdo | Configurado não significa conectado | Permissões, log_eventos e preços versionados |
| OPS-02 | Notificações e transparência de estados | Implementado/integrado (G/P) | 300635f, 0cdcf4f, 5eb8893; P01 | Preservar linguagem operacional e dados reais | Push mobile é ideia separada, não entrega atual | Realtime, Agenda e Radar |
| OPS-03 | Landing, marca, navegação Angariação e onboarding | Integrado (G/P) | 747e80b, a305f9e, 541bbad, 29ad6f3 | Preservar navegação e responsividade | Não confundir página pública com PWA instalado | Rotas, temas e sessão |
| OPS-04 | UX-ASSIST-1 — suspender Assistente em modal bloqueante | Integrado (G); smoke/gate final de produção a verificar | 007b986; R04 | Preservar foco, Escape e retomada | Flake de base não é regressão comprovada da mudança | Overlay, UI compartilhada |
| UX-01 | Auditoria geral de interface: Kanban, menu, mobile e modal | Achados manuais registrados; resolução integral a verificar (R) | R04: 07/10, filtros/contagem sobrepostos, menu cobre conteúdo, Escape e Assistente | Verificar estado atual por achado antes de corrigir | UX-ASSIST-1 não prova solução de todo relatório; sem aparelhos físicos | Navegação, CSS, acessibilidade e componentes compartilhados |
| LEGAL-01 | Termos/privacidade e aceite versionado | Implementado; STAND BY descrito, ativação atual a verificar (P/G) | c5fca17, 7d74e7d; P01 §§4008+ | Verificar identidade publicável e revisão jurídica registrada | Faltas de identidade no documento; não afirmar adequação jurídica | Dados tratados e fornecedores declarados |
| INF-01 | Migração Next.js, baseline e CI | Migração concluída documentada; CI integrado (P/G) | P01; D12; MIGRATION_NEXT §15 | Preservar paridade e checks proporcionais | Itens históricos resolvidos não viram pendências novas | Motor, dados, UI e deploy |
| INF-02 | Pós-migração: SSR, confirmações, Link e debounce | Ideias adiadas; situação atual de cada item a verificar (D) | D12 §15 | Verificar código atual antes de abrir tarefa | Não implementar toda lista histórica; CI/seed já resolvidos no doc | UX, desempenho e paridade |
| INF-03 | Git/worktrees, deploy, rollback e ledger | Operação documentada; reconciliação histórica registrada (G/P/D) | 67f049c, c3d851b; DEPLOY; G01 | Confirmar refs/branch por sessão e migration isolada | Checkout local codex/main atrasado ≠ origin/main; ledger remoto não reconsultado | CI/Vercel/Supabase e checkpoints próprios |
| INF-04 | Docker recovery e stacks descartáveis | Recuperação histórica registrada; runtime não operado nesta sessão | R01/R02; S03 | Preservar recursos preexistentes e contratos de stack | Não iniciar/parar/remover recursos para consolidar tabela | R6.1-C, pins e inventário |
| INF-05 | ANGARIO-DEV — Supabase remoto separado | DIREÇÃO FUTURA, ESTACIONADA (R) | R01: decisão de 16/10 | Checkpoint seguro R6.1-C → plano próprio → isolamento e seed sintético | Não criar/importar agora; sem dados reais por padrão | BASE83 certificada + incrementais; Next local; Docker excepcional |
| INF-06 | PWA-1 / PWA-2 / push / TWA e Play Store | Ideias discutidas; sem implementação comprovada (R) | R07: conversa de 10/10 | Contrato PWA e smoke mobile depois de checkpoint seguro do Radar | Nenhuma publicação/manifest/service worker comprovados aqui | Sessão, cache conservador, Android, mapa e downloads |
| INF-07 | Multiusuário por imobiliária/membros | Futuro; modelo atual por user_id confirmado documentalmente (P/M) | P01 §28; M18; PL01 V7 | Modelar organização, autoria e migração em gate próprio | Não presumir contas diferentes dentro do mesmo tenant | Auth/RLS, atribuição, Parcerias e relatórios |
| INF-08 | Mapillary/OpenCLIP — identificação visual de fachada | PAUSADO e isolado (P) | P02; nenhuma manipulação nesta sessão | Retomar somente por tarefa explícita e dados novos | Não mover/apagar/integrar protótipo ou índice | Pistas visuais/geográficas; fora do produto atual |
| INF-09 | Padrão comum de jobs, proveniência e contexto entre IAs | Propostas em revisão semanal; não entrega universal comprovada (R) | R05: Revisão do sistema IA | Recortar contrato e verificar peças já existentes antes de generalizar | Não criar nova prioridade obrigatória a partir de recomendação | IA, imports, cron, auditoria e autonomia |
| DOC-01 | Memória operacional canônica e checkpoint antes de STOP | CONSOLIDAÇÃO DOCUMENTAL preservada; fonte canônica migrada para o Git | Esta tabela + FONTES + checkpoints; [migração](checkpoints/DOC-01_2026-10-16_1941_MIGRACAO_CHECKPOINT.md); branch codex/angario-tabela-mestre | Atualizar somente docs/ANGARIO_TABELA_MESTRE.md e docs/checkpoints/; integrar referências na main somente quando autorizado | outputs é legado/snapshot; branch documental ainda não incorporada à main nem a worktrees antigos | Fonte única, atualização concorrente, evidência e relatório |

## 6. Dependências e ordem conhecida
| Trilha | Sequência preservada | Condição |
|---|---|---|
| Radar atual | D2-R1 PASS → revisão humana → A-R1-R2 → A PASS/revisão → B → demais C → R6.1 encerrada → R6.2 | Não aplicar A/B por esta tabela |
| Radar produto | R6.2 → R6.3 baseline/global-new → R6.4 broker-new → agrupamento shadow/exposição | Confirmar gate exato da retirada R6.7; numeração não fixa ordem de execução |
| Ambiente DEV | Checkpoint seguro R6.1-C → plano DEV → BASE83 certificada + incrementais → isolamento/seed → troca do fluxo diário | Sem dados reais por padrão; sem criação agora |
| Retomada de retirados | B0–B3 preservados → B4 inerte → ativação B4/gate G1 → B5 envio → B6 | Nenhum envio habilitado por B4 estar integrado |
| Classificação de saída de carteira | C1/C2/C3 preservados → C4 IA → C5 conversão humana | C4 cruza Contatos C3 e IV-4C; preservar histórico |
| Contatos/efeitos | C2.2 observado → C3-A shadow → C3-A3 amostra/decisões → C3-B ativação | Sequência histórica, sem retomada automática; shadow atual não suprime efeitos; continuidade CON-09 PAUSADA / NÃO ATIVA e sujeita a reauditoria/decisão explícita |
| Vendas | Fundação/RPCs → leitura/candidatos → criação sem imóvel e smoke real → vínculo/elegibilidade → operações UI | Negócio ganho não marca imóvel Vendido |
| Imóvel de venda | IV-1/2/3 preservados → IV-4 guardas por fluxo → IV-5 Vendido → IV-6 métricas | IV-4A e IV-4B1 não fecham IV-4 inteiro |
| IA | Instrumentação preservada → M1c-F baseline final → Q1/Evals e demais mudanças aprovadas | Volume E semanas completos; não trocar modelo automaticamente |
| Parcerias | P1 → 13 decisões/cronologia → P2/implementação | Tenant/percentuais/ciclos ainda sem contrato fechado |

Trilhas paralelas não são autorização de implementação simultânea: revisar overlap, consumidor compartilhado e cronologia de migrations. Prefixos se repetem entre domínios; sempre usar o ID e nome da frente.

## 7. Fatos corrigidos e lacunas que permanecem
| Tema | Registro antigo | Consolidação sustentada |
|---|---|---|
| Retirados B4 | Planejado/em espera em R01 | 9abf87b integrado; M03 registra Production INERTE em 06/10; UI local-only e envio bloqueado |
| Retirados fase C | Omitida da conversa curta | C1/C2 documentados em produção; C3 integrado/descrito; C4/C5 sem fechamento localizado |
| Mensagens M5 | Backlog em R01 | e1c8467 integrado, M01 registra produção; M5.1 integrado; M6 não tem fechamento recuperado |
| Radar D2-R1 | Próximo checkpoint em R01 | PASS final S05 recebido nesta consolidação; certificação A ainda futura |
| Vendas UI | P01 contém frases “sem Production/futuro” | 05d3156/6fe223f/2539370 estão em origin/main local; prechecks posteriores corroboram leitura/candidatos; criação sem imóvel ainda requer prova final de smoke/produção específica |
| IV-3B | D07 ainda indica gate de Preview | R04 registra PASS Production em eb6705c, smoke autenticado e banco preservado em 07/10 |
| IV-4B1 | Futuro em trechos de P01 | 3b6fc73 integrado e produção registrada em M07; decisão nova não exercida em dado real no último retrato |
| Garimpo Fase 3 | Ainda futura em §3671 | C13 em §3731 já entrega parte do escopo; mapear restante antes de criar frente duplicada |
| Venda V1–V7 antigo | Plano excluía dupla finalidade no imóvel | IV posterior aceita locacao_venda; mapear itens antigos sem reintroduzir regra superada |
| Memórias do Claude | Frontmatter/índice podem estar atrasados | Ler atualização posterior no corpo e comparar com Git/relatório; preservar divergência |
| JEV e ferramentas futuras | Declarações na conversa | Sem artefato técnico ou aprovação de produção localizado; não converter sugestão em entrega |

Pendências de verificação: estado remoto atual de deployment/alias/ledger; fechamento de M6 e re-smoke M5.1; smoke real e publicação específica de Vendas B3.4b-B1; C3-A3/B de Contatos; Retirados C4/C5; gates individuais históricos de Radar e Investigador; volume atual do baseline IA; escopo/artefatos JEV; decisões de Parcerias; plano aprovado de PWA/terreno por m²; identidade legal publicável; definição de 1a-D/1b/1c e organização multiusuário.

Anexos de conversas cuja ferramenta informa ausência de conteúdo não foram considerados lidos. Não foi feita busca externa por status do Angario, e não foram abertas contas/serviços para preencher lacunas.

Inconsistência textual preservada em 2026-10-16: a introdução menciona “157 projetos independentes”, mas o inventário contém 158 registros/IDs únicos em oito trilhas. Nenhum registro foi removido ou renumerado.

## 8. Histórico de atualização deste mestre
| Data | Checkpoint | Alteração | Evidência |
|---|---|---|---|
| 16/10/2026 BRT | DOC-01 | Criação do inventário com 158 registros, fontes e regra de checkpoint antes de STOP | checkpoints/DOC-01_2026-10-16_CONSOLIDACAO.md |
| 16/10/2026 BRT | RAD-19 / D2-R1 | Incorporado PASS final recebido durante a consolidação; HOLD anterior preservado | S05, R02 e evidencias/RADAR_D2_R1_manifest.json |
| 2026-10-16 17:26:42 BRT | RAD-20 / R6.1-C-A-R1-R2 | HOLD no observador TCP da BASE83; A/B não aplicadas; cleanup/preservação completos; revisão de D2-R1 registrada | [Relatório](C:/Users/Corretor/Documents/GitHub/Angariacao/.worktrees/radar-r6-1-c-b2-bootstrap-base83/supabase/bootstrap/base83-v1/RELATORIO-R6.1-C-A-R1-R2.md) e [checkpoint](C:/Users/Corretor/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/outputs/checkpoints/R6.1-C-A-R1-R2_2026-10-16_1726_CHECKPOINT.md) |
| 2026-10-16 17:57:03 BRT | RAD-20 / R6.1-C-A-R1-R2-R1 | HOLD diagnóstico TCP; serialização corrigida, 314/314 offline; A não certificada, B não aplicada | [Relatório](C:/Users/Corretor/Documents/GitHub/Angariacao/.worktrees/radar-r6-1-c-b2-bootstrap-base83/supabase/bootstrap/base83-v1/RELATORIO-R6.1-C-A-R1-R2-R1.md) e [checkpoint](C:/Users/Corretor/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/outputs/checkpoints/R6.1-C-A-R1-R2-R1_2026-10-16_1757_CHECKPOINT.md) |

| 2026-10-16 18:29:28 BRT | RAD-20 / R6.1-C-A-R1-R2-R2 | HOLD; longa capturada sem ground truth; 332/332 offline; observer não certificado; cleanup completo; budget 251.464 s preliminar | [Relatório](C:/Users/Corretor/Documents/GitHub/Angariacao/.worktrees/radar-r6-1-c-b2-bootstrap-base83/supabase/bootstrap/base83-v1/RELATORIO-R6.1-C-A-R1-R2-R2.md) e [checkpoint](C:/Users/Corretor/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/outputs/checkpoints/R6.1-C-A-R1-R2-R2_2026-10-16_1829_CHECKPOINT.md) |

| 2026-10-16 19:24:20 BRT | RAD-20 / R6.1-C-A-R1-R2-R3 | PASS do observador por prova nativa longa/20 curtas/mutantes/CLI; 360/360 offline; budget projetado 446.171 s; A/B não aplicadas | [Relatório](C:/Users/Corretor/Documents/GitHub/Angariacao/.worktrees/radar-r6-1-c-b2-bootstrap-base83/supabase/bootstrap/base83-v1/RELATORIO-R6.1-C-A-R1-R2-R3.md) e [checkpoint](C:/Users/Corretor/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/outputs/checkpoints/R6.1-C-A-R1-R2-R3_2026-10-16_1924_CHECKPOINT.md) |

| 2026-10-16 19:30 BRT | CON-09 | Registro existente atualizado para normalização/modularização histórica PAUSADA / NÃO ATIVA; reauditoria e análise de sobreposição obrigatórias antes da retomada; Radar e IA preservadas como frentes ativas | [Checkpoint documental](checkpoints/CON-09_2026-10-16_1930_CHECKPOINT.md) |

| 2026-10-16 19:41 BRT | DOC-01 / migração documental | Fonte canônica transferida de outputs para docs/ANGARIO_TABELA_MESTRE.md no Git; CON-09 e histórico preservados; origem marcada como legado/snapshot | [Checkpoint de migração](checkpoints/DOC-01_2026-10-16_1941_MIGRACAO_CHECKPOINT.md) |

Atualizações futuras devem acrescentar linha sucinta aqui e apontar relatório da frente. Não transformar PROJECT.md em changelog.


| Data | Checkpoint | Alteração | Evidência |
|---|---|---|---|
| 18/10/2026 BRT | IA-15 / JEV-GUARD-G2-C-B1 — encerramento e pausa | OBSERVABILITY_INCONCLUSIVE; HOLD / PAUSADO / NÃO AVANÇAR AGORA. Aguardar fechamento/reavaliação da frente principal de IA, com reavaliação prevista em 19/10/2026; dependência de decisão/coordenação. Próximo gate possível permanece NOT_STARTED, sem autorização de execução. | [B1 encerrado](C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-JEV-GUARD-G2-C-B1.md); decisão explícita do usuário nesta atualização; checkpoint documental abaixo |

### IA-15 — encerramento B1 e pausa operacional

Checkpoint vigente: **JEV-GUARD-G2-C-B1 — SEMANTIC OBSERVABILITY AUDIT DESIGN**. Classificação: **OBSERVABILITY_INCONCLUSIVE**. Decisão: **HOLD**. Estado operacional: **PAUSADO / NÃO AVANÇAR AGORA**. Este registro atualiza exclusivamente IA-15/JEV; não altera o gate ou estado da frente principal de IA.

**Coordenação:** a frente JEV permanece pausada enquanto a frente principal de IA aguarda o fechamento de seu gate corrente. Reavaliação prevista após esse estado ser conhecido em **19/10/2026**. Trata-se de dependência de decisão/coordenação, não dependência técnica. A data não encerra gate automaticamente nem autoriza retomada.

**Fatos do B1 encerrado:**

- Não foi demonstrada representação semântica independente do oracle suficientemente confiável. A distinção operacional automática entre GG0-29 e GG0-04/GG0-11/GG0-12 permanece não demonstrada; completude semântica permanece **UNKNOWN/UNRESOLVED**.
- Revisão humana estruturada foi somente desenhada; validação cega foi somente proposta. Nenhuma das duas foi executada. Desempenho semântico permanece **NOT_MEASURED**.
- H2 e H3 continuam caminhos conceituais, sem solução certificada. H4 mantém **PROBLEM_DISPLACEMENT_RISK**. Opção F — não prosseguir com JEV Guard — permanece legítima.
- Nenhum histórico foi corrigido retroativamente. B0 permanece INCONCLUSIVO / HOLD; conclusões herdadas de G2-B/G2-C-A, corpus, oracle e resultados anteriores permanecem preservados.

**Validação encerrada, em execuções separadas:** 364 testes históricos direcionados PASS; 39 testes documentais B1 PASS; 26/26 mutantes documentais rejeitados, zero sobreviventes. Não constituem uma única suíte conjunta de 403 testes nem evidência de desempenho semântico. Preservação registrada pelo B1: **551 arquivos históricos, 769 arquivos do produto e 17 inventários**. Nenhuma dessas suítes ou mutantes foi reexecutada por esta atualização da Mestre; somente integridade documental foi conferida.

**Efeitos do B1:** JEV = 0 novas chamadas; OpenAI = 0; providers remotos = 0; rede = 0; credenciais = 0; Production = 0. Angario/web/schema/RLS/UI/workers/endpoints/mensagens/Radar/prompts/geração/pipeline/banco permanecem inalterados. Nenhum guard implementado; nenhum extrator implementado; nenhum feature flag; nenhum shadow mode; nenhum G3. Os zeros são os efeitos do gate encerrado; a recuperação da fonte publicada por Git nesta atualização documental não é chamada de provider ou nova execução do B1.

**Próximo gate somente possível:** revisão independente da elegibilidade e do protocolo de observabilidade — **NOT_STARTED**. Nenhum novo ID ou gate ativo criado. Não autoriza revisão humana real, dataset cego, validação cega, provider, JEV, OpenAI ou implementação. Qualquer retomada exige, nesta ordem: (1) fechamento/reavaliação da frente principal de IA; (2) decisão humana explícita sobre retomada; (3) novo gate próprio. Não iniciar agora.

**Referências da evidência encerrada:** [B1 encerrado](C:/Users/ciria/Desktop/sistema-angariação/Angariação/RELATORIO-JEV-GUARD-G2-C-B1.md); [resultados das execuções](C:/Users/ciria/Desktop/sistema-angariação/Angariação/experiments/jev/guard/g2cb1/tests.json); [mutantes documentais](C:/Users/ciria/Desktop/sistema-angariação/Angariação/experiments/jev/guard/g2cb1/mutation-report.json); [preservação B1](C:/Users/ciria/Desktop/sistema-angariação/Angariação/experiments/jev/guard/g2cb1/preservation.json). São evidências locais da sessão de IA/JEV; disponibilidade em outras máquinas não é presumida. As menções anteriores à ausência de artefatos JEV ficam como retrato histórico da consolidação de 16/10/2026, sem substituição ou apagamento.

**Registro IA-15 anterior, preservado como histórico:**

> | IA-15 | JEV — decisão/classificação/validação no Cérebro | EXPERIMENTAL declarado somente na conversa (R) | R01; nenhum código/checkpoint específico localizado | Localizar definição, artefato, ensaio e responsável | Não há prova de aprovação Production; sigla/escopo técnico a verificar | Não tornar dependência obrigatória; regra registrada: não geração de texto |

**Integridade desta atualização:** mesmo conjunto de **158 IDs antes/depois**; zero IDs novos; alteração da entrada vigente IA-15 e APPEND deste checkpoint ao histórico, sem apagar o histórico anterior. Radar/RAD-20, CON-09, Retirados, Mensagens e demais trilhas preservados. A única fonte canônica continua docs/ANGARIO_TABELA_MESTRE.md; nenhuma segunda Tabela Mestre, relatório ou arquivo de checkpoint adicional criado por esta tarefa, conforme seu escopo exclusivo. Rollback: restaurar somente a entrada IA-15 e remover este sufixo, usando como base o commit cd69693baa89897f0b6eeb4ea8082e916c3ab1d9 da branch documental publicada. Sem commit, push, merge ou deploy. **STOP.**
