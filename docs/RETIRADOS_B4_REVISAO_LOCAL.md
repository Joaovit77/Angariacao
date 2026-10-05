# Retirados B4 — revisão local

Data: 04/10/2026. Decisão: **HOLD — aguardando smoke manual com Supabase local**.

Implementação pronta para revisão local, sem commit, push, Preview, Production, migration ou envio
real. Validação automatizada concluída, mas o fluxo real não foi exercitado.

## Base e isolamento

- `git fetch origin --prune` executado; `origin/main` confirmado em
  `5a4d67737f8573f13f8496a1a1887b310f150df3`.
- Branch: `codex/retirados-b4-ui-retomada`.
- Worktree: `C:\Users\ciria\.codex\worktrees\retirados-b4-ui-retomada\Angariação`.
- Checkout original e branch Radar não foram alterados.
- Rollback: a base permanece intacta e todas as mudanças B4 estão sem commit nesta worktree.

## Comportamento anterior e mapa do fluxo

1. B2 já reconhecia `retomada-retirado` em `mensagens_agendadas`, com uma ativa por imóvel,
   identidade imutável, imóvel retirado do mesmo dono e em status-alvo, data futura, sem Agenda
   nem consolidação. A aplicação ainda não tinha caller específico para criar retomada.
2. `ModalMensagemAgendada` criava/editava livre e verificação diretamente pelo cliente Supabase.
   Seu tipo TypeScript também admitia retomada, embora a trava de imóvel inativo fosse só da livre.
   A lista cancelava genericamente mensagens agendadas.
3. O trigger de destinatário deriva o contato do imóvel. A edição B4 preserva a fotografia
   persistida de nome/telefone, sem editar contato ou proprietário.
4. Reativar ou sair do status-alvo cancela a retomada agendada pelo contrato B2. Os triggers B2
   continuam sendo autoridade; B4 não implementa outro cancelamento automático.
5. B3 lê apenas retomada enviada para atribuir resposta; precedência, janela, evidência e efeitos
   não foram modificados.
6. B1 bloqueia retomada no worker antes de instância, revalidação, consolidação, histórico e envio.
   Nenhum worker, webhook ou executor foi alterado ou acionado contra dados reais.

## Arquitetura e interface B4

O `ModalImovel` oferece **Programar retomada** somente quando o imóvel carregado está retirado e
o servidor declara a capacidade local disponível. A mesma entrada carrega a programação ativa
existente. `ModalRetomada` usa o overlay já existente, sem nova página de produto.

O destinatário fica somente leitura. O padrão é seis meses às 09h de Brasília; atalhos 3/6/12
apenas preenchem data/hora, com limite no último dia do mês de destino. O texto é editável e
determinístico, sem IA. A decisão F1 aprovada em 05/10/2026 preenche somente novas programações,
após ler o contexto persistido, com:

> Olá, {primeiro_nome}! Tudo bem? Estou retomando nosso contato sobre o imóvel {referencia_imovel}. Gostaria de saber se ele continua fora de disponibilidade ou se podemos conversar novamente sobre a possibilidade de anunciá-lo conosco.

Sem primeiro nome válido, a saudação é exatamente "Olá! Tudo bem?". A referência usa apenas o
logradouro e número do campo endereço, com preposição natural ("da Rua Tijuca, 112", por exemplo),
ou exatamente "em questão" quando o endereço é insuficiente. Não acrescenta bairro, cidade,
código ou telefone. Não há IA, aleatoriedade, timestamp ou data relativa. O texto permanece
editável; programações existentes carregam sempre a mensagem persistida, inclusive vazia, sem
recalcular, migrar ou substituí-la pelo default. O aviso explica que programar não reativa e que o envio permanece bloqueado.
O formulário mantém os tokens e a responsividade existentes. O campo readonly recebeu `type=text`
para herdar a aparência padrão, correção visual localizada observada no smoke.

Imóveis legados não precisam de data, motivo ou observação de retirada. B4 não preenche esses
campos nem modifica `retirado`, `status`, `statusHistory` ou qualquer dado C1.

### Identidade, tipos e resolver

- `TipoMensagemComum = Exclude<TipoMensagemAgendada, "retomada-retirado">`, acompanhado de guarda
  em tempo de execução.
- `retomadaImovelId` seleciona explicitamente a operação própria. Vínculos comuns/Agenda
  concorrentes, categoria incompatível ou imóvel diferente da linha persistida são recusados.
- Uma edição persistida da gestão de mensagens pode abrir a lógica B4 pela identidade válida
  já gravada. Não existe conversão de mensagem comum por texto, telefone ou inferência.
- A lista não oferece cancelamento genérico para retomadas: encaminha para a programação própria.

### Flag e segurança do ambiente

`RETOMADA_B4_LOCAL=0` é o padrão documentado em `web/.env.example`. A flag vive no servidor,
sem variável pública de ativação. Para ligar, exige todos os requisitos:

- `RETOMADA_B4_LOCAL=1`;
- `NODE_ENV=development`;
- ausência das chaves `VERCEL`, `VERCEL_ENV` e `CI`; presença bloqueia inclusive valores vazios, `0`, `false` e whitespace (correção F2 de 05/10/2026);
- `NEXT_PUBLIC_SUPABASE_URL` HTTP em `localhost` ou `127.0.0.1`, com porta explícita.

A restrição ao banco em loopback é deliberada nesta rodada: uma flag local ligada não pode escrever
acidentalmente no banco de Production. Preview, Production e CI recusam mesmo com opt-in.
`GET /api/retomadas?capacidade=1` informa a disponibilidade; leitura contextual e `POST` validam
o gate no servidor antes de autenticação/consulta. Esconder a ação não é a proteção final.

### Criação, edição e concorrência

`/api/retomadas` autentica por Bearer e `auth.getUser()`, com anon key e RLS, sem service role.
O dono nunca vem do corpo. As consultas filtram explicitamente por `user_id`.

A criação insere uma única linha B2 `agendada`, com imóvel e destinatário derivados do cadastro.
O índice único B2 protege inclusive criações concorrentes. A edição atualiza a linha existente,
somente texto/data ou cancelamento manual autorizado, condicionada a id, dono, tipo, imóvel,
estado `agendada` e `updated_at` carregado. Não muda categoria nem alvo.

Se a atualização retornar zero linhas, o resultado é `conflito-edicao`, sem toast de sucesso,
fechamento da janela ou criação substituta. `processando` e estados terminais não são editáveis.
Após reativação, a leitura pelo id mostra o cancelamento existente e impede editar; a entrada do
imóvel ativo desaparece. Nenhuma escrita B4 atualiza o store do imóvel.

### Erros esperados

Mapa fechado em `ERROS_RETOMADA`: `feature-desabilitada`, `imovel-inexistente`,
`imovel-nao-retirado`, `estado-incompativel`, `retomada-inexistente`, `retomada-conflitante`,
`destinatario-ausente`, `data-invalida`, `texto-ausente`, `conflito-edicao`, `sessao-invalida`
e `falha-operacao`. Erros desconhecidos falham; detalhes brutos do banco não chegam à UI B4.

## Arquivos alterados — lista exata

1. `PROJECT.md`
2. `docs/RETIRADOS_B4_REVISAO_LOCAL.md`
3. `web/.env.example`
4. `web/app/api/retomadas/route.ts`
5. `web/components/mensagens/MensagensAgendadasView.tsx`
6. `web/components/modais/ModalImovel.tsx`
7. `web/components/modais/ModalMensagemAgendada.tsx`
8. `web/components/modais/ModalOverlay.tsx`
9. `web/components/modais/ModalRetomada.tsx`
10. `web/lib/calculo/retomada.ts`
11. `web/lib/datas.ts`
12. `web/lib/mensagensAgendadas.ts`
13. `web/lib/retomadaCliente.ts`
14. `web/lib/retomadaConfig.ts`
15. `web/lib/servidor/retomada.ts`
16. `web/lib/uiModal.ts`
17. `web/tests/retirados-b2-schema.test.ts`
18. `web/tests/retirados-b4-api.test.ts`
19. `web/tests/retirados-b4-dominio.test.ts`
20. `web/tests/retirados-b4-interface.test.ts`

A expectativa de B2 de ausência absoluta de caller foi substituída pelo novo requisito explícito
B4: somente as fronteiras aprovadas podem reconhecer/criar o tipo. As assertivas de schema,
invariantes, identidade, isolamento e cancelamento B2 não foram enfraquecidas.

## Validação e limites

Os testes B4 cobrem guarda, resolver, identidades concorrentes, legado, elegibilidade, data/hora,
fim de mês, atalhos, flag, autenticação, criação, edição, duplicata, estados não editáveis,
reativação simulada, zero linhas, erros fechados, cancelamento, reabertura, lista e mensagem comum.
Banco e rede são simulados; nenhuma credencial real foi carregada nos testes.

**Resultado final da suíte completa com `--maxWorkers=2`: 5.696 passaram / 5 falharam, de 5.701.**
As cinco falhas são exatamente as CRLF reproduzidas na base. Os **35 testes novos B4 passaram**;
nenhuma regressão nova apareceu nessa execução. O bloqueio B1 continua coberto pelos testes
existentes `cron-mensagens-tipos.test.ts`, que usam emissores/instância/histórico simulados.

- Regressões focadas: 13 arquivos / 291 testes passaram com `--maxWorkers=2`, sem alterar timeouts.
- Revisão final do resolver (identidade vazia/categoria contraditória) e B1/B2/B3: 6 arquivos /
  123 testes passaram. O ajuste posterior ao ensaio completo foi coberto por essa execução.
- Rodada adicional de B4, datas e gestão de mensagens: 5 arquivos / 68 testes passaram, antes do
  teste estrutural adicional de ausência de emissores.
- TypeScript: aprovado. ESLint: sem erros; aviso preexistente `_choices` em
  `tests/ia-contrato-requisicao.test.ts`.
- Build: aprovado após substituir a ligação de dependências por uma cópia local. A falha inicial
  foi do Turbopack por uma ligação fora da raiz, sem alteração de configuração do produto.
- A suíte completa e a comparação da base reproduziram cinco falhas CRLF em
  `mensagens-agendadas.test.ts`. Rodadas sob carga também mostraram instabilidades em testes de
  localização, união e promoção; os testes focados passam com menos processos e as instabilidades
  de localização/união também ocorreram na base. Nenhum desses módulos/testes foi alterado.
- A cópia temporária da base apresentou ainda uma falha de resolução de React ao coletar um teste
  do Garimpo por suas dependências ligadas externamente; não apareceu na worktree B4 com cópia local.
- `git diff --check`: aprovado.

O smoke no Chrome usou os componentes reais, CSS real e fixtures em memória, em desktop e
390×844: abertura, padrão, atalho, readonly, criação, edição com id/versão, conflito sem sucesso,
imóvel ativo, destinatário inválido e flag OFF. Console sem erros. O harness é temporário e
ignorado, sem nova página versionada ou conexão ao banco.

O build de Production foi iniciado somente em localhost: capacidade B4 `false`; `POST` respondeu
`403 feature-desabilitada` antes de banco/autenticação. Nenhum Preview foi realizado.

**Não exercitado:** aplicação autenticada ↔ PostgreSQL/PostgREST local com triggers/RLS reais.
Não havia Docker nem configuração explícita de Supabase local na sessão. Também não houve smoke
de envio/recebimento WhatsApp ou de IA real, pois o B4 não os habilita e a rodada proíbe esses efeitos.

## Smoke manual necessário antes de liberar PASS LOCAL

1. Preparar um Supabase **local** já com o baseline e migrations B2 existentes, sem criar migration
   B4, sem dados/secrets de Production e sem instância Evolution, worker, cron ou webhook ativos.
2. Configurar somente URL/anon key locais; ligar `RETOMADA_B4_LOCAL=1` em desenvolvimento.
3. Entrar com usuário fixture; criar um imóvel retirado no status-alvo com destinatário seguro e
   os três metadados da retirada nulos. Abrir seu cadastro e conferir a ação.
4. Conferir +6 meses às 09h de Brasília, atalhos, edição de data/texto, readonly, aviso e data passada.
5. Programar e reler: exatamente uma linha B2, sem Agenda/consolidação; imóvel e histórico intactos.
6. Reabrir e editar: mesmo id, texto/data novos e nenhuma duplicata. Tentar criar outra ativa
   concorrentemente: uma deve ser recusada pelo índice B2.
7. Abrir em duas janelas; salvar na primeira e tentar salvar/cancelar pela segunda com a versão
   antiga: conflito, janela aberta e nenhum sucesso falso. Reabrir para atualizar a versão.
8. Reativar somente o imóvel fixture local pelo fluxo existente; confirmar cancelamento B2 com
   `imovel-reativado`, ausência da ação no cadastro e estado correto após recarregar.
9. Testar imóvel não retirado, fora do status-alvo e sem telefone elegível: salvamento bloqueado.
10. Cancelar uma programação ainda agendada: mesma linha, motivo/origem `usuario`, sem reativar.
11. Com outro usuário fixture, tentar consultar/editar a linha: RLS/isolation deve recusar.
12. Desligar a flag: ação ausente, abertura direta bloqueada e operação API recusada. Manter
    Preview/Production desligados, independentemente do opt-in.
13. Confirmar nas requisições locais que só houve operações B4, nenhuma chamada de envio,
    execução de programação, worker ou webhook. Rodar os ensaios locais B2/B3 conforme suas
    configurações somente contra o ambiente local preparado.

## Riscos e dívidas externas

- B5 continua necessário para qualquer envio. Se alguém acionar manualmente o worker contra uma
  linha vencida, B1 a marca como erro/bloqueada; isso não garante que a programação fique agendada.
  Esta rodada não acionou o worker e não alterou essa semântica.
- Falso sucesso em zero linhas de fluxos comuns legados continua como dívida fora do B4.
- As falhas CRLF e instabilidades sob carga da suíte não foram corrigidas nem mascaradas.
- Sem smoke PostgreSQL local, ainda não é possível certificar a integração real, concorrência
  transacional e RLS do novo caller. **HOLD — aguardando smoke manual.**

Confirmações de escopo: zero WhatsApp real, zero IA/OpenAI, zero migration/schema/política,
zero alterações no B3/Radar/R6.1/Firecrawl/cron/worker, zero commit/push/deploy.
