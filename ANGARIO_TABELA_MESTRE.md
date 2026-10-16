# ANGARIO — ponte para a Tabela Mestre versionada

A **única fonte canônica de estado operacional** é [docs/ANGARIO_TABELA_MESTRE.md](docs/ANGARIO_TABELA_MESTRE.md), versionada neste repositório. Este arquivo é somente uma ponte.

Leia o mestre, seu [índice de fontes](docs/FONTES_E_CRITERIOS.md) e o último checkpoint da frente. Salve novos checkpoints em docs/checkpoints/, conforme o [modelo](docs/MODELO_CHECKPOINT.md), e atualize o mestre antes de STOP, inclusive em HOLD ou falha.

A antiga versão em outputs/ é legado/snapshot histórico. Futuras atualizações devem ocorrer somente na fonte versionada, sem manter uma segunda tabela concorrente. A migração está registrada no [checkpoint documental](docs/checkpoints/DOC-01_2026-10-16_1941_MIGRACAO_CHECKPOINT.md).

PROJECT.md permanece canônico para arquitetura; documentos de domínio mantêm seus escopos. Esta regra não autoriza merge, deploy, migrations, chamadas pagas ou mensagens.

A migração está na branch codex/angario-tabela-mestre; não foi incorporada à main nem propagada a worktrees antigos.
