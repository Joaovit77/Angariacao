# JEV-GUARD-G1 — execução isolada

Executor exclusivo do benchmark sintético congelado em [G0](../g0/README.md). A autorização humana deste checkpoint limita a 36 chamadas `jev-1.14.0`, uma por caso em ordem, somente VALIDATION, concorrência 1 e teto de US$ 0,12. Uma única autorização persistente e um lock de execução impedem repetição ou retomada automática.

O módulo puro de análise usa diretamente o scorer e o contrato de pares do G0. O núcleo aceita transporte injetado apenas para testes offline; somente o runner explícito lê a linha `Angario_teste` e usa HTTP. Nenhum teste importa o runner ou carrega credenciais. As 401 regressões históricas devem passar antes dos testes novos e novamente com eles, sob a barreira de rede S2-G-A.

Antes de cada HTTP: preservação de 228 arquivos históricos e 769 do produto, preço vigente, contexto, orçamento com reserva máxima e gravação atômica de stage e ledger em IN_PROGRESS. O recibo exige fsync do arquivo, rename atômico e leitura de confirmação. O fsync de diretório pode ser indisponível no Windows e fica explicitado no recibo. Credencial, raw, campos adicionais retornados e mensagens livres de exceção nunca integram os artefatos. Projeções de probabilities reutilizam S2-D; parser, wrapper e Guard G0 permanecem congelados.

INVALID_PROBABILITIES classificado pode continuar, sem resultado semântico. Erro operacional, modelo divergente, usage desconhecido, falha de privacidade ou estrutura desconhecida interrompem o run sem retry. Erros de qualidade são observações e não mudam os pedidos ou o oráculo. APPROVE não gera efeitos. Nenhuma alteração em web, schema, RLS, prompts de produção, integrações ou dados reais está autorizada.

Os artefatos reais ficam em namespace novo de `experiments/jev/results/jev-guard-g1-*`; fixtures ficam em `guard-g1-offline-*` e não constituem resultado do modelo. p50/p95 usam interpolação linear sobre `(n−1)×p`, limitada a esta amostra HTTP. Billing direto permanece BILLED_UNKNOWN. Não há integração, shadow real ou próxima execução automática.
