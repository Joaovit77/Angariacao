# Vendas B3.4b-B1 — relatório para revisão local

**PASS B3.4b-B1 LOCAL**, limitado à implementação e às provas sintéticas/locais descritas abaixo.
Sem commit, push, Preview, publicação, escrita remota ou migration. Data: 09/10/2026.

**Validação automatizada concluída, mas o fluxo real não foi exercitado. Aguardando smoke manual.**
A cadeia completa com Auth/PostgREST de Supabase precisa ser exercitada em ambiente local seguro
antes de merge. Docker estava instalado, mas o daemon não estava disponível; nenhuma infraestrutura
foi instalada ou iniciada para contornar essa limitação.

1. **Refs/base.** `git fetch origin --prune` executado. `origin/main` e HEAD inicial:
   `3b6fc733ebca3e5d43bc6fbb18cf96d1cee1b987`, igual ao gate. Sem delta inesperado de Vendas.
   Precheck somente leitura: deployment `dpl_CKqD4HNRjMYFXVwqb3n5iTeeq9Mv`, READY;
   ledger 82, última migration `20261008150000`; zero oportunidades observado. Nenhuma escrita remota.

2. **Branch/worktree.** `codex/vendas-b34b-b1-criacao`, no worktree dedicado
   `C:\Users\Corretor\.codex\worktrees\vendas-b34b-b1-criacao\Angariacao`.
   Worktrees e alterações preexistentes preservados; sem reset, stash ou reaproveitamento de B3.4b-A.
   Base mantida como ponto de rollback; nenhum commit criado.

3. **Delta e comportamento anterior.** Vendas mostrava lista/drawer somente para leitura.
   Agora oferece criação sem imóvel. Produção do delta: alteração localizada em `VendasView.tsx`,
   três novos arquivos de formulário/estilo e uma leitura de candidatos. Demais arquivos são testes,
   fixture, harness sintético e este relatório. As três expectativas anteriores que proibiam qualquer
   criação foram ajustadas por autorização nominal B1, mantendo as outras proibições.

4. **Arquitetura.** `ModalCriarOportunidadeVenda` → `executarComandoVenda("criar", comando)` →
   RPC existente `vendas_criar_oportunidade`. Sem API Route, segundo executor, INSERT direto na UI
   ou mudança nos adaptadores/RPC/decodificadores publicados. Nenhuma dependência adicionada.

5. **Ação/modal.** Botão “Nova oportunidade”; blocos Interessado, Dados comerciais e Resumo.
   Cancelar, backdrop e Escape fecham antes de submissão. Depois do início, pedidos sem confirmação
   bloqueiam fechamento/edição e oferecem somente repetição da mesma intenção.

6. **Interessado existente.** Escolha explícita por id; busca por nome sem acento ou trecho do
   telefone. Nomes iguais permanecem candidatos distintos; nome ausente usa “Contato sem nome”. Contatos próprios arquivados e sem
   telefone continuam disponíveis. Fundidos/anonimizados não são listados. Não há escolha automática.

7. **Leitura de contatos.** `vendasContatosLeitura.ts`: `auth.getUser()`, filtro `user_id` nas duas
   tabelas e SELECT mínimo. Contatos: id, user_id, nome e marcas de arquivamento/fusão/anonimização.
   Telefones ativos: id, user_id, contato_id, telefone. Retorno à UI: id, nome, telefones e arquivado.
   Sem email, notas, documentos, service role ou mutação. Páginas de 500, ordenadas por id;
   falhas/malformação não devolvem resultado parcial. Busca humana local sobre as páginas lidas.

8. **RLS/ownership.** Políticas existentes preservadas. Resposta com linha de outro usuário é
   recusada pelo leitor. Testes usam também RLS real das tabelas em PGlite e confirmam recusa do
   RPC para contato estrangeiro/inexistente. A conta é reconferida antes de enviar/repetir;
   o backend continua autoridade de ownership, independentemente da seleção na UI.

9. **Novo interessado.** Nome aparado obrigatório, 1–200 pontos de código. Telefone opcional;
   branco vira explicitamente `null`. Validação usa `classificarIdentificacaoCriarVenda`, e o
   executor existente normaliza o canal. Email não é aceito. Contato nasce dentro do comando,
   nunca em cadastro separado. Colisão/revisão exigem decisão humana, sem fusão/renomeação/reuso.

10. **Atomicidade.** Integração: comando produzido pelo formulário → adaptador real → SQL
    versionado executado em PGlite. Falhas injetadas na gravação de telefone, oportunidade, evento
    e recibo preservam todas as contagens anteriores, sem contato órfão. Nenhum SQL de negócio
    foi reimplementado. O banco descartável carrega também as projeções reais de Contatos;
    uma sentinela rejeita qualquer UPDATE em imóvel. Auth é simulado e o transporte SQL local
    substitui PostgREST; não é prova da stack Supabase completa nem de corrida entre conexões.

11. **Origem.** UI envia somente origem comercial opcional da oportunidade. O backend atribui
    `contato.origem = vendas`. As duas origens permanecem distintas.

12. **Valores.** Campos opcionais, ausência `null`, zero preservado, decimal com vírgula ou ponto.
    Negativo, NaN, infinito e separador de milhares são recusados com orientação humana.
    Nenhum preço de imóvel é consultado ou copiado para o comando.

13. **Etapa.** Resumo mostra Nova. Etapa inicial `nova`, versão 1, definidas pelo executor;
    nenhuma etapa é enviada e não existe seletor de etapa no formulário.

14. **Idempotência.** UUID criado na intenção válida. Ref impede submissões concorrentes,
    inclusive Enter repetido. Retry usa exatamente a mesma chave/payload. Provas em UI e SQL:
    mesma chave/pedido repete recibo; payload diferente conflita; resposta perdida após commit
    termina com uma oportunidade, um evento e um recibo.

15. **Estado incerto.** Timeout, resposta inválida, dado persistido inválido e conflito de chave
    mantêm pedido imutável. `sessionStorage` da aba guarda somente o comando necessário, separado
    pela conta, antes da rede. Reabertura restaura o mesmo pedido; conteúdo recuperado é validado
    por shape fechado. Falha de armazenamento no retry não perde a intenção. Não há reset automático
    em caso de corrupção/conflito persistente: é preciso esclarecer o resultado anterior.

16. **Erros.** Os 19 códigos solicitados possuem mensagens humanas, sem SQL, ids internos ou
    PII estrangeira. Colisão manda selecionar explicitamente contato existente; revisão não
    cadastra outra pessoa. Conflito transitório e sessão expirada permitem repetir mesma intenção.

17. **Sucesso/releitura.** Id retornado seleciona a oportunidade e dispara leitura da lista.
    Filtros permanecem intactos; seleção usa os itens completos, permitindo abrir mesmo quando
    o filtro atual oculta a nova oportunidade. Confirmação oferece “Abrir oportunidade criada”,
    inclusive para repetir uma leitura que tenha falhado depois do sucesso.

18. **Drawer/histórico.** Componentes e leitura B3.4a-R preservados. Histórico mostra o evento
    persistido pelo backend; nenhum evento é montado ou gravado como estado de produto no cliente.
    A fixture sintética fabrica resposta apenas no teste/harness.

19. **Sem imóvel.** `imovelTratado` omitido do comando. Sem import do seletor/catalogo B3.4b-A.
    Sentinelas verificam campos fechados no payload, nenhuma escrita direta nem acesso a módulos
    de locação, repasse, Sophia, Agenda, mensagens, C3 ou IA. Triggers reais de projeção + sentinela
    de UPDATE em `imoveis` passaram no banco descartável com imóvel/vínculo preexistentes.

20. **Acessibilidade.** Labels, fieldsets/legends, botões nativos, dialog/aria-modal, descrição,
    foco inicial no fechar, ciclo Tab/Shift+Tab, foco no campo inválido/alerta, Escape condicionado
    ao estado e retorno ao botão de abertura. Rolagem do fundo bloqueada enquanto modal aberto.

21. **Mobile.** Navegador em **390×844**, claro e escuro: `scrollWidth = innerWidth = 390`;
    modal dentro do viewport, corpo com rolagem interna e rodapé acessível. Criação com telefone,
    colisão, erro e retry após commit exercitados. Evidências salvas fora do delta Git.

22. **Desktop.** Navegador em **1366×900**, claro e escuro:
    `scrollWidth = innerWidth = 1366`. Criação existente/zero, novo sem telefone/origem,
    drawer/evento e foco exercitados. Console sem avisos/erros no harness ao finalizar.
    Ajustes visuais: cabeçalho com ação, campos em duas colunas no desktop/uma no mobile,
    resumo, rodapé fixo no modal e estilos isolados com tokens do painel. Nenhum ajuste visual alheio.

23. **Testes existentes.** Vendas V1-A, B1, B2, B3.1, B3.2, B3.3, B3.4a-R, B3.4b-A e Auth/nav
    relacionados passaram. Lista, filtros, drawer, histórico e demais proibições continuam cobertos.
    Não foram removidos testes nem alteradas regras anteriores para ganho/perda/etapa/imóvel.

24. **Testes novos.** Cinco suítes, **56 testes**: formulário (18), contatos (5), interface (20),
    integração local (10) e fronteira (3). Incluem limites Unicode, null/zero/decimal, isolamento,
    paginação >1000, modo/seleção/busca, estados da leitura, teclado/foco, submissão duplicada,
    recuperação após remount, falha de armazenamento, troca de conta, colisões e rollback.

25. **Mutantes.** M1 cadastro separado/INSERT, M2 troca de chave no envio/retry, M3 telefone `""`,
    M4 tenant estrangeiro aceito, M5 zero→null, M6 criação automática após colisão,
    M7 etapa no comando e M8 imóvel no comando: **8/8 mortos por asserção**, não por erro de compilação.
    Runner restaura cada fonte e o conjunto completo em `finally`. M1–M8 restaurados.

26. **Regressão.** Conjunto dirigido final: **29 arquivos, 838 testes aprovados**.
    Depois, os 10 testes de integração foram novamente aprovados com as projeções reais de
    Contatos e o imóvel sentinela. Full suite não executada, conforme checkpoint local;
    segue obrigatória no gate futuro de commit/Preview. Nenhuma API paga ou suíte real de OpenAI.

27. **TypeScript.** `tsc --noEmit --incremental false` aprovado. Build também executou sua etapa
    TypeScript com sucesso.

28. **Lint.** ESLint de todos os arquivos TS/TSX/MJS alterados/adicionados aprovado sem avisos.

29. **Diff-check.** `git diff --check` aprovado; novos arquivos também verificados sem erros
    de whitespace. Fronteira final de arquivos e invariantes do no-touch conferidas.

30. **Build.** `next build --webpack` aprovado, incluindo compilação, TypeScript, geração das
    68 páginas e coleta de traces. Nenhum deploy disparado.

31. **Smoke.** Harness `web/tests/harness/vendas-b34b-b1` monta `VendasView` e adaptadores reais
    sobre cliente sintético, somente `127.0.0.1:3426`. Cenários: existente, novo sem telefone,
    novo com telefone, colisão, erro, timeout após commit/retry, foco/Escape e quatro combinações
    de viewport/tema. Servidor de smoke encerrado ao terminar. Limite: Auth/PostgREST reais
    ainda não foram exercitados; roteiro abaixo. Screenshots locais:
    `vendas-b1-desktop-claro.jpg`, `vendas-b1-desktop-escuro.jpg`,
    `vendas-b1-mobile-claro.jpg`, `vendas-b1-mobile-escuro.jpg`, no diretório de evidências da sessão.

32. **Schema/migration.** Zero mudança em migrations, schema, RPCs ou executor SQL de produto.
    As instruções SQL dos testes somente carregam fontes já versionadas e injetam falhas no banco
    descartável. Nenhuma alteração de política, dado ou serviço remoto.

33. **No-touch.** PROJECT.md, Investigador, IV-4B*, Pipeline, Sophia, Radar, Retirados, Agenda,
    IA e C3 preservados. Sem B2/G/C, ganho/perda/arquivamento, Vendido ou IV-5. Sem alteração de
    package.json/lockfile, RHF ou Zod. Checkout original e worktrees existentes preservados.

34. **Riscos e próximos limites.** A leitura reúne os candidatos/telefones necessários na memória
    da UI; bases muito grandes podem requerer busca paginada no servidor em outra fatia. Comando
    incerto com interessado novo mantém nome/telefone no armazenamento da aba até confirmação;
    sucesso/falha definitiva remove o pedido quando o navegador permite. Fechar definitivamente
    a aba elimina essa recuperação; operação anterior deve ser conferida antes de outra intenção.
    Corrupção/conflito persistente precisa de conferência humana, sem botão para gerar outra chave.
    PGlite não substitui Auth/PostgREST, triggers externas ou concorrência real entre conexões.
    Nenhum fluxo real de WhatsApp/IA foi exercitado, pois não faz parte desta criação e permanece
    proibido gerar efeitos externos para validação. **Aguardando smoke manual antes de merge.**

## Reproduzir provas locais

No diretório `web` deste worktree, com as dependências existentes:

```powershell
node node_modules/vitest/vitest.mjs run tests/vendas-v1 tests/auth.test.ts tests/auth-servidor.test.ts tests/auth-recuperacao-sessao.test.ts tests/auth-logout-local.test.ts tests/boot-rotas-neutras-auth.test.ts tests/boot-auth-fallbacks.test.ts tests/nav-angariacao.test.ts --no-file-parallelism --maxWorkers=1 --maxConcurrency=1
node tests/harness/vendas-b34b-b1/mutantes.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/next/dist/bin/next build --webpack
node node_modules/vite/bin/vite.js --config tests/harness/vendas-b34b-b1/vite.config.ts
```

O runner de mutantes deve rodar sozinho, com harness fechado e sem edição simultânea nas fontes.
Não carregar `.env.local` nos testes nem acionar `tests-real-openai`.

## Roteiro de smoke manual futuro — somente Supabase local seguro

1. Com a stack local já preparada e os contratos existentes disponíveis, autenticar conta A.
   Confirmar que a seleção não lista contatos da conta B; incluir próprio arquivado e sem telefone.
2. Criar com contato existente, sem imóvel, com valor 0 e receita ausente. Conferir Nova/v1,
   um evento de criação, um recibo e zero alteração nos imóveis/vínculos existentes.
3. Criar novo sem telefone e novo com telefone brasileiro válido. Conferir origem do contato
   `vendas`, origem comercial independente, um contato por intenção e telefone somente quando informado.
4. Repetir telefone conhecido/em revisão. Confirmar mensagem humana, escolha explícita e nenhum
   contato/oportunidade parcial. Confirmar recusa do RPC para id estrangeiro, inexistente,
   fundido ou anonimizado, mesmo adulterando a requisição local de teste.
5. Simular perda da resposta depois do commit no transporte local. Repetir o mesmo pedido e
   conferir exatamente um contato/oportunidade/evento/recibo. Reabrir/recarregar a aba e repetir;
   nunca usar nova chave para resolver o pedido anterior. Testar troca de conta.
6. Manter filtro que oculta a etapa Nova; criar e abrir pelo id retornado. Conferir histórico após
   releitura, inclusive recuperação de falha de leitura posterior ao sucesso.
7. Repetir teclado/foco e quatro combinações: 390×844/1366×900, claro/escuro.
   Confirmar rolagem interna, ausência de overflow global e bloqueio de edição/fechamento incerto.
8. Registrar evidência de Auth/PostgREST/concorrência segura antes de merge; rodar full suite no
   futuro gate. Este checkpoint permanece parado para revisão, sem commit/push/Preview.
