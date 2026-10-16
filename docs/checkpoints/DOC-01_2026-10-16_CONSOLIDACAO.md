# DOC-01 — Consolidação da memória operacional do Angario

> Checkpoint histórico preservado. O endereço local e as pontes descritos abaixo representam a consolidação original; foram substituídos pela [migração da fonte canônica para o Git](DOC-01_2026-10-16_1941_MIGRACAO_CHECKPOINT.md). Atualize somente docs/ANGARIO_TABELA_MESTRE.md e docs/checkpoints/.
Data: 16/10/2026, America/Sao_Paulo.
Responsável: Codex.
Resultado: CONSOLIDAÇÃO DOCUMENTAL CONCLUÍDA; lacunas de produto explicitamente a verificar.

## Estado entregue
- [Tabela Mestre canônica](../ANGARIO_TABELA_MESTRE.md): 158 registros de frentes, subfrentes e checkpoints, organizados em oito trilhas.
- [Fontes e critérios](../FONTES_E_CRITERIOS.md): evidências locais, relatos, planos, limitações e conflitos.
- [Modelo de checkpoint](../MODELO_CHECKPOINT.md) e pontes [AGENTS](../../AGENTS.md)/[CLAUDE](../../CLAUDE.md).
- Evidências mínimas de Git/fontes e do PASS D2-R1 em ../evidencias/.

## Contexto revisado
Conversa “Consolidar tabela mestre” recuperada, sessões Codex pertinentes, revisão semanal, ideias de PWA/terreno, documentação do projeto/domínios, histórico e worktrees Git, memórias de projeto e planos locais do Claude. Não foram vasculhados projetos pessoais sem relação com Angario.

Foram identificadas, além de Radar/Retirados/Agenda-Mensagens/IA/JEV: Contatos/Atribuição, Vendas comercial, Imóvel de venda/Pipeline, Garimpo, Investigador, Avaliação/Comparáveis/Mercados, Parcerias, Locações/Repasses, WhatsApp, Sophia, Google Agenda, importações, indicadores, Foco/Mapa, cidade padrão, Admin/Permissões, Auth/RLS/Segurança, UX/landing/onboarding, termos/privacidade, Next/CI/deploy, DEV, PWA/Play Store, organização multiusuário e protótipo visual pausado.

## Último checkpoint material incorporado
R6.1-C-A-D2-R1 fechou PASS durante esta consolidação. O relatório final, manifesto e budget foram lidos:
- BASE83_CERTIFIED em 16/10/2026 16:18:25 BRT, 162,632 s, margem 737,368 s.
- history=1, fingerprint normativo 13ab06524c60a5ccc0061b99181cdd9aa8f6e04ef21bedcd5992a8b28cba9ac5, delta zero.
- 290/290 testes registrados; cleanup completo, 691 arquivos e recursos anteriores preservados.
- A/B não aplicadas; zero Production, commit, push ou deploy naquela prova.
- 224,251 s para futura A é orçamento estimado. Próximo: revisão humana antes de R6.1-C-A-R1-R2.
Esses resultados pertencem à sessão do Radar, não a testes executados por esta consolidação.

## Conflitos reconciliados
- B4 Retirados é produção inerte registrada, com UI local-only e envio bloqueado.
- Fase C Retirados foi recuperada; C4/C5 sem fechamento comprovado.
- M5 Mensagens já tem produção registrada; M6 continua sem relatório final localizado.
- IV-3B tem PASS Production registrado em eb6705c; frases antigas locais não prevalecem.
- Vendas leitura/candidatos/criação aparecem no Git local; smoke real final da criação sem imóvel ainda não foi recuperado.
- C3 Contatos é shadow; não suprime efeitos.
- JEV é experimental declarado em conversa; sem artefato/aprovação de produção localizado.
- Planos antigos Garimpo Fase 3/V1–V7 foram mantidos como sobrepostos, sem duplicar entrega ou reintroduzir regra superada.

## Git e isolamento desta documentação
Checkout principal encontrado em codex/main, HEAD 5cb3f03; não editado.
Referência local origin/main observada em 62f096801a4edaa8d7d97bf145fdf9f75c481f6c.
Criado worktree dedicado a partir desse SHA:
C:/Users/Corretor/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/work/angario-documentacao
Branch: codex/angario-tabela-mestre.

Nessa branch foram preparadas somente pontes documentais: ANGARIO_TABELA_MESTRE.md, AGENTS.md, CLAUDE.md e referência no PROJECT.md. A tabela efetiva está no diretório outputs; o arquivo do worktree aponta para ela, sem segunda tabela concorrente. A regra antes de STOP já está persistida no mestre e nas instruções do pacote.

**Não houve merge na main, commit, push, deploy, migration, chamada paga, envio de mensagem, alteração de produto ou operação Docker.** Não foram alterados checkouts de outras sessões, inclusive o worktree Radar.

## Limite de propagação da regra
Pontes preparadas na branch codex/angario-tabela-mestre não são automaticamente lidas por main/worktrees antigos. Até integração documental autorizada, o usuário deve indicar o caminho do mestre ao abrir/retomar essas sessões. Não há hook ou automação; não se promete gravação automática sem uma sessão executar as instruções.

Para retomar, instruir a sessão: “Leia ANGARIO_TABELA_MESTRE.md no caminho canônico, o último checkpoint da frente e as instruções do repositório. Ao terminar, atualize a linha da frente e salve checkpoint antes de STOP.”

## Validação desta entrega
Somente documentação: verificação de contagem/IDs/campos, links locais do pacote e fontes, ausência de marcadores de conflito, preservação das instruções anteriores e git diff --check. Resultado detalhado em [VALIDACAO.json](C:/Users/Corretor/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/outputs/evidencias/VALIDACAO.json).
Suítes de produto, smoke de interface, integrações e produção não executados, pois nenhum comportamento de aplicativo foi modificado.

## Lacunas / próximos gates
Consultar a seção 7 do mestre antes de promover qualquer status. No Radar, aguardar revisão de D2-R1; ANGARIO-DEV/PWA não devem começar por causa desta consolidação. Nas demais frentes, recuperar a evidência faltante antes de declarar PASS/Production.
