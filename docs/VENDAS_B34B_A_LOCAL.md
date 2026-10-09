# B3.4b-A — leitura e apresentação de imóveis candidatos

Checkpoint exclusivamente local de 08/10/2026. Implementação preparada para revisão.
**PASS B3.4b-A LOCAL.**

Validação automatizada concluída, mas o fluxo real não foi exercitado.
O componente foi exercitado em navegador real com fixtures sintéticas; a nova leitura não foi
executada com sessões reais de contas seguras. A consulta administrativa da configuração RLS
não substitui essa prova. Conforme a orientação explícita do checkpoint de commit/Preview,
essa limitação de integração não bloqueia o fechamento local. A integração real do novo adaptador
permanece pendente para B3.4b-B; a prova positiva entre tenants também permanece pendente.

## Relatório dos 36 itens

| Nº | Item | Resultado/evidência |
| --- | --- | --- |
| 1 | Refs | Fetch/prune realizado. `origin/main` e HEAD da nova branch: `05d31567621655b95dab13605782ad7a542cc8c2`. Production: `dpl_2aPCrgD2N5wfZtFecsBc2DPy9D2m`, `main`, mesmo SHA, `READY`; também era o deployment Production mais recente listado. Ledger remoto 82; latest `20261008150000`. |
| 2 | Branch/worktree | `codex/vendas-b34b-a-candidatos`, criado de `origin/main`, em `C:/Users/Corretor/Documents/GitHub/Angariacao/.worktrees/vendas-b34b-a-candidatos`. Limpo antes da implementação. Worktrees preexistentes preservados, sem reset/stash. |
| 3 | Contrato recuperado | B3.4a-R é leitura de oportunidades/snapshots; B3.4b-B criará com interessado; B3.4c fará operações posteriores. B3.4b-A adiciona somente catálogo factual e apresentação. As frases antigas de estado nos documentos existentes não foram usadas como evidência de Production; prevalecem o checkpoint fornecido e o pre-check remoto. |
| 4 | Arquitetura da leitura | Adaptador separado para o imóvel vivo da carteira. Auth → SELECT paginado → decodificação → resultado tipado. Não consome nem filtra as referências históricas de oportunidades. |
| 5 | Campos | `id,codigo,referencia_crm,endereco,bairro,cidade,estado,unidade,bloco,finalidade,status,retirado,valor_venda`. Referência CRM, localização e unidade/bloco diferenciam visualmente imóveis. Nenhum telefone, proprietário, nota, conversa, aluguel ou histórico é solicitado. |
| 6 | Finalidade | Reutiliza rótulos de `constantes.ts`: Locação, Venda, Locação e venda, Não informado. Sem inferência. |
| 7 | Status | Texto real do imóvel preservado. Nenhuma transformação em etapa de oportunidade ou elegibilidade. |
| 8 | Retirado | Selo textual Retirado, independente do status original. Não esconde, reativa nem altera o imóvel. |
| 9 | Ambos + Locado | Permanece no catálogo e mostra Locação e venda / Locado / preço de venda. Testes explícitos de adaptador, componente e transporte SDK; mutante A morto. |
| 10 | NULL | Incluído no catálogo; ausência legada de finalidade também vira desconhecido. Mostra Não informado; não vira Locação. Mutante B morto. |
| 11 | Locação | Permanece representável e selecionável apenas em memória. Não apresenta aluguel como preço de venda e não declara rejeição pelo banco. |
| 12 | Venda | Apresenta seu preço quando informado. Venda + Locado continua visível com essa situação real, sem corrigir ou ocultar o registro. |
| 13 | Valores | `valor_venda` exclusivamente; zero e null distintos. Reutiliza `fmtValorImovel`: R$ 0 para zero e centavos para 450000.55. Não inventa preço para NULL/Locação. Mutante D morto. |
| 14 | Adaptador | `listarImoveisCandidatosVenda`, resultado discriminado e interface mínima sem métodos mutantes. SELECT por páginas de 500 com ordem estável por id; falha posterior não devolve catálogo parcial. Recusa ids duplicados, tipos inválidos, finalidade desconhecida e valores inválidos. |
| 15 | RLS/ownership | Singleton público do browser. Conta obtida por `auth.getUser()`, sem user_id recebido; `eq(user_id, id do Auth)` em todas as páginas, além da RLS atual. Sem service role/RPC/servidor novo. Banco remoto confirmou RLS ativa e policy `select_own_imoveis`, predicado `auth.uid() = user_id`. Testes de contrato e SDK sintético; prova real entre contas pendente. Mutante F morto. |
| 16 | Componente | `SeletorImovelVenda` recebe estado/dados e callbacks. Sem callback de seleção, serve como consulta; com callback, usa rádio controlado pelo estado em memória do chamador. Não faz rede ou persistência. |
| 17 | Busca | Local por código, endereço, bairro e referência CRM, tolerando maiúsculas/acentos. Sem serviço de busca ou filtro de finalidade/status. |
| 18 | UI | Carregando, erro com retry opcional, carteira vazia, busca vazia, contagem e seleção atual. Grupos de rádio independentes por instância. Rótulos explícitos, CSS exclusivo com tokens existentes; layout dos dados adapta a duas colunas no mobile. |
| 19 | Read-only | Nenhum comando, RPC, interessado, contato ou vínculo. Os testes usam sentinelas de escrita; o transporte SDK sintético confirma apenas GET de Auth e PostgREST. |
| 20 | B3.4a-R | Página, rota, menu, lista, filtros, drawer, histórico e CSS existentes intactos. Nenhum botão Criar, modal ou montagem do seletor na superfície atual. Testes anteriores mantidos. |
| 21 | B1–B3.3 | Nenhuma mudança nos executores, comandos, resolução, contatos, idempotência, recibos, eventos ou policies. O teste de fronteira B3.3 amplia somente a lista nominal para o import de tipos do seletor e acrescenta restrições específicas. |
| 22 | IV-4A | Migration, schema, finalidadeOperacional, PipelineView, ModalLocacaoLote, locações e repasses intactos. Reutiliza somente constantes e formatador de exibição, sem alterar helpers. Pequena regressão IV-4A e persistência IV-2B executada. |
| 23 | Schema/migrations | Zero artefatos SQL novos ou alterados. Zero migrations, alteração de policies, dados ou serviços. PROJECT.md preservado. |
| 24 | Testes de leitura | 39 casos: todas as finalidades, NULL/ausente, Retirado, Locado/ambos/venda, Perdido, null/zero/decimal, vazio, projeção, Auth/escopo, erros, inválidos, paginação e falha parcial. Inclui SDK real sem sessão e SDK real com transporte HTTP sintético, sem rede externa. |
| 25 | Testes de componente | 9 testes com RTL/jsdom: rótulos, status real, retirada, valores, busca, loading, vazios, quatro códigos de erro/retry, seleção em memória e múltiplas instâncias. |
| 26 | Fronteira | 18 testes: allowlist de imports por AST, veto a escrita/RPC/interessado/locações/repasses/imports dinâmicos, Auth/escopo, preservação B3.4a-R, CSS isolado e separação do smoke manual. Expectativas anteriores de segurança permanecem; somente listas nominais atualizadas. |
| 27 | Mutantes | A–F executados e mortos por asserções de comportamento/fronteira. Fontes restauradas em finally. Detalhes abaixo. |
| 28 | Regressão | Rodada final: 28 arquivos e 850 testes passaram (32,17 s). Vendas V1-A/B1/B2/B3.1/B3.2/B3.3/B3.4a-R/B3.4b-A, nav, auth/boot e IV-2B/IV-4A. Uma rodada concorrente apresentou timeouts de processos de fuso; os 142 testes do domínio passaram isoladamente e o conjunto final passou sem mudar timeout ou asserções. |
| 29 | TypeScript | `npx tsc --noEmit --incremental false` passou, incluindo harness e smoke manual. |
| 30 | Lint | ESLint dos arquivos TypeScript/TSX/MJS novos e dos dois testes alterados passou. |
| 31 | Diff-check | `git diff --check` passou; arquivos novos também conferidos. |
| 32 | Build | `npx next build --webpack` passou, 68 páginas geradas. Sem nova rota de produto ou harness no build. |
| 33 | Smoke sintético | Navegador: 390×844 e 1366×900, claro/escuro; sete candidatos, incluindo A–F e Venda + Locado. Busca por São João sem acento, seleção de Ambos locado/Retirado, loading, erro/retry, vazios. Sem erros/avisos no console nem overflow horizontal global. |
| 34 | Arquivos | Lista completa abaixo. Delta de produto em três arquivos novos de Vendas; restante são testes, fixtures, harness, configuração manual e este relatório. |
| 35 | Riscos/limitações | Integração real de Auth/PostgREST e isolamento entre duas sessões não exercitados nesta rodada. Paginação não é snapshot transacional; mudança concorrente de carteira exige nova leitura. Catálogo não garante elegibilidade/disponibilidade nem reserva o imóvel. Suíte completa e integrações históricas com escrita não executadas. |
| 36 | Decisões necessárias | Nenhuma D4/D5. D1 (NULL), D2 (Perdido/Retirado) e D3 (orientação vs regra de banco) permanecem abertas para gravação. Nenhuma impede a leitura factual. |

## Comportamento anterior e delta

Antes, Vendas tinha somente oportunidades e seus snapshots históricos. Não havia catálogo de imóveis
atuais nem bloco independente de seleção. Agora há infraestrutura separada para consultar e apresentar
a própria carteira, sem alterar a página publicada ou dar início à criação B3.4b-B.

Os únicos ajustes visuais são do bloco novo e do harness sintético: identificação, metadados textuais,
retirada, seleção perceptível, rolagem interna, uso dos tokens de tema e adaptação ao mobile.
Não houve ajuste incidental nas telas existentes.

Referências de API consultadas: [SELECT](https://supabase.com/docs/reference/javascript/select)
e [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), além da documentação
Next empacotada e do SDK instalado. O contrato de regressão permanece o do repositório.

## Evidência real e sintética

**Real, somente leitura:** fetch Git, deployment/última Production via Vercel, ledger/última
migration, catálogo de RLS e contagem agregada de zero oportunidades. Nenhum imóvel, contato,
oportunidade ou massa foi criado. Nenhum dado pessoal entrou nas fixtures ou neste relatório.

**Sintética:** casos positivos de finalidade, Locado, Retirado, Perdido e valores; clientes falsos,
transporte HTTP do SDK e harness em navegador. Não há alegação de cobertura positiva desses estados
na carteira de Production. Os testes de banco dirigidos usam PGlite local, sem serviços externos.

## Mutantes temporários

| Mutante | Alteração introduzida | Resultado da última execução |
| --- | --- | --- |
| A | Remove Ambos + Locado do resultado | 3 asserções falharam; morto |
| B | NULL/ausente vira locacao | 2 asserções falharam; morto |
| C | Remove a marca textual Retirado | 1 asserção falhou; morto |
| D | Zero vira Não informado por truthiness | 1 asserção falhou; morto |
| E | Componente importa/chama comando mutante | 1 asserção de fronteira falhou; morto; nenhum comando real executado |
| F | Remove o filtro adicional da conta autenticada | 4 asserções falharam, incluindo transporte SDK; morto |

Runner: [mutantes.mjs](../web/tests/harness/vendas-b34b-a/mutantes.mjs).
Restaura cada fonte imediatamente e todas novamente no finally final. Não roda API real.

## Comandos de validação automática

Executados dentro de `web/` do worktree:

```powershell
npx vitest run tests/vendas-v1 tests/nav-angariacao.test.ts tests/auth.test.ts tests/auth-servidor.test.ts tests/auth-recuperacao-sessao.test.ts tests/auth-logout-local.test.ts tests/boot-rotas-neutras-auth.test.ts tests/boot-auth-fallbacks.test.ts tests/imovel-venda-iv2b-persistencia.test.ts tests/imovel-venda-iv4a-interface.test.ts tests/imovel-venda-iv4a-schema.test.ts tests/imovel-venda-iv4a-banco.test.ts --maxWorkers=2
npx vitest run tests/vendas-v1-a-dominio.test.ts --maxWorkers=1
node tests/harness/vendas-b34b-a/mutantes.mjs
npx tsc --noEmit --incremental false
npx next build --webpack
git diff --check
```

ESLint foi executado com a lista explícita dos arquivos TS/TSX/MJS do delta. Não foram alteradas
asserções nem timeouts para acomodar a implementação. Bloqueios de Git/cache/SWC no sandbox Windows
foram resolvidos com execução autorizada fora do sandbox. Duas correções locais de tipagem do harness
e dos testes SDK foram feitas antes dos checks finais.

A suíte completa permanece para o gate de commit/Preview, conforme o escopo deste checkpoint.
Ensaios OpenAI, APIs pagas e suites históricas que criam fixtures em Supabase não foram executados.

## Roteiro manual opcional de integração

O ensaio preparado está em
[leitura-manual.test.ts](../web/integration/vendas-v1-b3-4b-a-leitura-manual.test.ts), com
[configuração própria](../web/vitest.vendas-v1-b3-4b-a-leitura-manual.config.ts).
Fica fora de `npm test`, não carrega `.env.local` e bloqueia qualquer método diferente de GET.
Não autentica por senha, cria sessões, renova tokens ou prepara massa.

1. Usar duas sessões já existentes, válidas e de contas seguras diferentes no mesmo projeto.
   A conta A deve ter ao menos um imóvel já existente. Não criar massa em Production.
2. Fornecer deliberadamente ao processo as variáveis abaixo, sem gravá-las no repositório/relatório.

| Variável | Finalidade |
| --- | --- |
| `VENDAS_IMOVEIS_SMOKE_READONLY=1` | Opt-in humano para leitura |
| `VENDAS_IMOVEIS_SMOKE_URL` | URL pública do projeto seguro |
| `VENDAS_IMOVEIS_SMOKE_ANON` | Chave pública anon/publishable; credencial privilegiada é recusada |
| `VENDAS_IMOVEIS_SMOKE_TOKEN_A` | Access token de sessão existente da conta A |
| `VENDAS_IMOVEIS_SMOKE_TOKEN_B` | Access token de sessão existente da conta B |

3. Dentro de `web/` deste worktree, executar manualmente:

```powershell
npx vitest run --config vitest.vendas-v1-b3-4b-a-leitura-manual.config.ts
```

4. Confirmar leitura positiva pelo adaptador e ownership dos ids de A; confirmar que clientes
   A e B, chamados diretamente com o filtro da outra conta, recebem zero linhas sob RLS.
5. Registrar apenas resultado/contagens, sem tokens ou dados pessoais. Se não houver segunda
   conta segura ou sessões válidas já acessíveis, registrar a limitação; isso não bloqueia
   este checkpoint. Não pedir tokens pelo chat, criar conta/massa ou copiar credenciais
   privilegiadas para obter essa prova.

O smoke visual sintético pode ser repetido com:

```powershell
node node_modules/vite/bin/vite.js --config tests/harness/vendas-b34b-a/vite.config.ts
```

Abrir `http://127.0.0.1:3414/`, conferir claro/escuro, 390px/1366px, busca/seleção e estados
Carregando/Erro/Vazio. Em ambiente com isolamento de rede do sandbox, o servidor deve ser iniciado
no mesmo ambiente local acessível ao navegador. O ensaio realizado usou porta 3415 por esse motivo.

## Arquivos do delta

Novos:

- [vendasImoveisLeitura.ts](../web/lib/persistencia/vendasImoveisLeitura.ts)
- [SeletorImovelVenda.tsx](../web/components/vendas/SeletorImovelVenda.tsx)
- [seletorImovelVenda.css](../web/components/vendas/seletorImovelVenda.css)
- [leitura.test.ts](../web/tests/vendas-v1-b3-4b-a-leitura.test.ts)
- [componente.test.ts](../web/tests/vendas-v1-b3-4b-a-componente.test.ts)
- [fronteira.test.ts](../web/tests/vendas-v1-b3-4b-a-fronteira.test.ts)
- [fixture/cliente falso](../web/tests/fixtures/vendasB34bA.ts)
- [catálogo sintético](../web/tests/fixtures/vendasB34bACatalogo.ts)
- [harness/index.html](../web/tests/harness/vendas-b34b-a/index.html)
- [harness/main.tsx](../web/tests/harness/vendas-b34b-a/main.tsx)
- [harness/harness.css](../web/tests/harness/vendas-b34b-a/harness.css)
- [harness/vite.config.ts](../web/tests/harness/vendas-b34b-a/vite.config.ts)
- [harness/mutantes.mjs](../web/tests/harness/vendas-b34b-a/mutantes.mjs)
- [smoke manual](../web/integration/vendas-v1-b3-4b-a-leitura-manual.test.ts)
- [config do smoke manual](../web/vitest.vendas-v1-b3-4b-a-leitura-manual.config.ts)
- Este relatório.

Alterados somente para fronteiras nominais específicas, com restrições adicionais:

- [B3.3 persistência](../web/tests/vendas-v1-b3-3-persistencia.test.ts)
- [B3.4a leitura](../web/tests/vendas-v1-b3-4a-leitura.test.ts)

Base de rollback do checkpoint local: `05d31567621655b95dab13605782ad7a542cc8c2`.
No checkpoint local de 08/10 não houve commit, push, Preview, merge, deploy, mudança de main
ou escrita em Production. B3.4b-B/G, B3.4c, IV-4B+, IV-5 e C3 ficaram fora do delta.

## Fechamento para commit/Preview — 09/10/2026

O usuário confirmou PASS LOCAL e autorizou um commit e push somente desta branch, com Preview.
A ausência de Auth/PostgREST real e de duas sessões seguras é limitação de integração, sem HOLD
automático neste checkpoint. Nenhum token foi solicitado ou copiado; nenhuma conta ou massa foi criada.

Nenhum byte funcional mudou desde o PASS LOCAL. A única edição no fechamento foi este relatório.
Mutantes A–F e smoke sintético de 390px/1366px, claro/escuro, reutilizados por identidade das fontes,
fixtures e harness. Hashes de blob Git dos três arquivos de produto:

| Arquivo | Blob |
| --- | --- |
| Adaptador | `1c49e2991c8c2778c7e85b6b8436a3a43c3969e3` |
| Seletor | `a64630bba8f615c2f3ec7b09c4d4c89b59106c13` |
| CSS | `77d4630cfd7fed7984096c1039abb0470bac0fb9` |

| Check reexecutado | Resultado |
| --- | --- |
| Suíte completa serial | 362 arquivos: 361 PASS, 1 FAIL, 0 SKIP. 6.701 testes: 6.696 PASS, 5 FAIL, 0 SKIP; 478,62 s. Apenas as cinco falhas CRLF conhecidas em mensagens-agendadas, sem falha adicional. Teste/schema/migrations desse baseline intactos. |
| Dirigidos seriais | 28 arquivos, 850 PASS, 0 FAIL, 0 SKIP; 42,33 s. Mesmo conjunto de Vendas/nav/auth/IV-2B/IV-4A descrito acima. |
| TypeScript | `npx tsc --noEmit --incremental false`: PASS. |
| ESLint | Lista explícita dos 14 arquivos TS/TSX/MJS novos/alterados: PASS. |
| Build | `npx next build --webpack`: PASS, 68 páginas. Sem montagem do seletor, rota temporária ou harness no produto. |

Ambas as execuções Vitest usaram `--no-file-parallelism --maxWorkers=1 --maxConcurrency=1`.
Nenhum timeout ou teste foi alterado para acomodar resultados.

Evidência real passiva adicional: sessão segura já existente abriu `/vendas` em Production, com
menu, filtros, vazio e ausência de Criar preservados; busca/etapa/arquivadas exercitadas e restauradas.
Pipeline abriu sem operação de locação. Console sem erros/avisos. Isso valida B3.4a-R publicado,
não o seletor novo. Banco reconfirmou ledger 82, latest `20261008150000`, zero oportunidades e
RLS `select_own_imoveis` ativa. Nenhuma escrita no banco.

O novo adaptador não foi exercitado com Auth/PostgREST real. Essa integração permanece pendente
para B3.4b-B. A prova positiva entre tenants também não foi fabricada. D1–D3 continuam abertas
para gravação; nenhuma decisão nova foi necessária para esta leitura.

Os metadados finais de commit, push, Preview e refs são registrados no relatório da sessão de
fechamento. Main/Production não são destinos autorizados deste checkpoint.
