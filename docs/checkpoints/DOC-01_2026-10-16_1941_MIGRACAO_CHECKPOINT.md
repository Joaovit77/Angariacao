# Checkpoint — DOC-01 — Migração da fonte canônica para o Git
Data de início: 2026-10-16 19:41 America/Sao_Paulo.
Agente/sessão: Codex; migração, commit e push autorizados expressamente pelo usuário.
Decisão: MIGRAÇÃO DOCUMENTAL; não altera estados ou gates de produto.

## 1. Ponto de partida
- Branch: codex/angario-tabela-mestre; worktree documental; HEAD anterior: 62f096801a4edaa8d7d97bf145fdf9f75c481f6c.
- git status inicial: AGENTS.md, CLAUDE.md e PROJECT.md modificados; ANGARIO_TABELA_MESTRE.md não rastreado, somente ponte. Nenhum arquivo de código, configuração ou migration alterado.
- Origem efetiva: C:/Users/Corretor/Documents/Codex/2026-10-16/referenced-chatgpt-conversation-this-is-an/outputs/ANGARIO_TABELA_MESTRE.md. Conteúdo lido diretamente dessa origem; não reconstruído pela ponte.
- SHA256 original do mestre: 65e3c7707a861ad8de06270cef659b965560220100e2f5a391b6a91ec62ee1cb.
- SHA256 original do checkpoint CON-09: f3cdf84831dbc6e146c763a7f5cd582163dd80715b37795a41c4c931b12a0515.
- [Consolidação histórica](DOC-01_2026-10-16_CONSOLIDACAO.md) e [checkpoint CON-09](CON-09_2026-10-16_1930_CHECKPOINT.md) preservados.

## 2. Resultado factual
- Única fonte canônica: [docs/ANGARIO_TABELA_MESTRE.md](../ANGARIO_TABELA_MESTRE.md). Novos checkpoints somente em docs/checkpoints/ no repositório.
- Mestre importado integralmente; somente declarações de localização, instruções de caminho, linha DOC-01 e histórico desta migração atualizados. IDs, estados e gates de produto preservados, inclusive CON-09 PAUSADA / NÃO ATIVA e Radar/IA como frentes ativas.
- Checkpoint CON-09 copiado sem reescrita. Migrou também o índice FONTES_E_CRITERIOS.md, o MODELO_CHECKPOINT.md e o checkpoint DOC-01 da consolidação, necessários aos links relativos do mestre e do CON-09.
- Referências do repositório ajustadas somente em AGENTS.md, CLAUDE.md, PROJECT.md e na ponte ANGARIO_TABELA_MESTRE.md.
- No índice de fontes, evidências não importadas mantêm referências ao pacote histórico local; o checkpoint da consolidação recebeu aviso de migração e ajustes de links, sem reescrever seu relato original.
- Origem outputs/ mantida como LEGADO / SNAPSHOT HISTÓRICO, NÃO CANÔNICO. Seu mestre e AGENTS.md/CLAUDE.md passam a apontar para a única fonte no Git. Não manter atualizações operacionais paralelas.
- Arquivos de implementação, migrations, configuração e documentos próprios de Radar/IA não alterados. Nenhum outro checkout modificado.

## 3. Validação e limites
- PASS antes do commit: 158 IDs únicos; 157 linhas de produto idênticas à origem (exceção exclusivamente documental DOC-01); presença e conteúdo de CON-09; checkpoint CON-09 com SHA256 original; 90 links relativos válidos; fonte única; git diff --check e git status conferidos.
- Validar o conjunto staged usando lista explícita de dez arquivos Markdown. Não incluir caches, credenciais, dados, scripts, código ou configurações.
- Testes de produto, integração, smoke e APIs pagas não executados: migração exclusivamente documental. Nenhum fluxo de produto alterado.
- Limite remoto: referências históricas absolutas a worktrees, memórias e evidências locais continuam preservadas; sua disponibilidade não é garantida em outros ambientes. O mestre e o checkpoint CON-09 ficam acessíveis no Git sem depender desses caminhos locais.
- Sem acesso ao banco, migrations, merge, deploy, promoção para Production, mensagens ou operação Docker. Efeito externo autorizado: push somente da branch documental para origin.

## 4. Próximo gate, rollback e encerramento
- Após validação, commit documental e push para origin/codex/angario-tabela-mestre; confirmar SHA remoto e git status final. O SHA definitivo é o do commit que contém este checkpoint e será informado no relatório final.
- Próximo gate documental: revisão da branch e eventual integração somente quando explicitamente autorizada. A migração não propaga a regra para branches/worktrees antigos.
- CON-09 segue PAUSADA / NÃO ATIVA: nova auditoria e análise de conflito/sobreposição antes de qualquer retomada; decisão explícita do usuário antes de implementar.
- Rollback: commit anterior 62f096801a4edaa8d7d97bf145fdf9f75c481f6c é o ponto de recuperação Git; o snapshot legado preserva o conteúdo da origem, com aviso de descontinuação. Qualquer retorno da fonte canônica exige decisão explícita e atualização de todas as pontes para evitar duas fontes.
- Mestre relido antes da migração; nenhuma edição concorrente identificada na origem. Somente DOC-01 e referências de localização alterados; estados de produto preservados.
