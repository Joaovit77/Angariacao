# CLAUDE.md

Este arquivo orienta o Claude Code (claude.ai/code) ao trabalhar neste repositório.

## O que é

"Painel de Angariações" — um CRM/dashboard single-tenant-por-login para corretores de imóveis
acompanharem a **angariação (captação) de imóveis para locação**, do primeiro contato com o
proprietário até o imóvel locado. Toda a UI, strings, comentários e mensagens são em **português
do Brasil**.

> **Migração concluída (2026-07).** O app era um site estático puro (`index.html` + `app.js` +
> `style.css`) e foi migrado para **Next.js (App Router) + TypeScript**, hoje na pasta
> [`web/`](web/). O app antigo foi removido. O histórico completo da migração — decisões, achados e
> pós-mortem — está em [MIGRATION_NEXT.md](MIGRATION_NEXT.md); a lista de correções que ficaram
> para depois da paridade está na **§15** daquele documento e continua valendo.

## Stack e estrutura

O que fica na **raiz** do repositório:

- [supabase-schema.sql](supabase-schema.sql) — schema completo do banco (tabelas `imoveis`, `metas`,
  `agenda`, `abordagens`, `user_config`) com as políticas RLS que escopam cada linha a
  `auth.uid() = user_id`.
  Idempotente — pode ser re-rodado no SQL editor do Supabase. **É a fonte de verdade do schema.**
- [DEPLOY.md](DEPLOY.md) — passo a passo de deploy (Supabase + Vercel com Root Directory `web`),
  runbook de cutover e rollback.
- [MIGRATION_NEXT.md](MIGRATION_NEXT.md) / [BASELINE_ETAPA0.md](BASELINE_ETAPA0.md) — guia da
  migração e o baseline numérico de paridade (contrato de aceitação das views).
- [scripts/seed-teste.mjs](scripts/seed-teste.mjs) — semeia a conta de teste no Supabase
  (idempotente; credenciais via `SEED_EMAIL`/`SEED_PASSWORD`). Ver §15 do MIGRATION_NEXT para um
  bug conhecido do re-seed em `user_config`.

O aplicativo vive em **[`web/`](web/)** — Next 16 (App Router, Turbopack), TypeScript, sem Tailwind:

- **`web/app/`** — App Router. `layout.tsx` (raiz: monta `SessaoProvider` + `Toasts`, importa o CSS
  do Leaflet e o `style.css`), `page.tsx` (tela de acesso e queda do link de recuperação de senha),
  e o grupo **`(painel)/`** com o shell autenticado (`layout.tsx`) e uma rota por view
  (`dashboard`, `pipeline`, `metas`, `agenda`, `insights`, `mapa`, `relatorios`, `roadmap`).
  **`app/api/whatsapp/enviar/route.ts`** e **`app/api/ia/route.ts`** são as duas rotas de servidor
  do projeto — ambas existem só porque guardam um segredo (ver abaixo).
- **`web/app/style.css`** — o CSS do app antigo copiado **sem alterações**, dirigido por custom
  properties em `:root`. Não há redesign; classes e tokens são os mesmos.
- **`web/lib/`** — todo o núcleo sem UI (ver "Arquitetura" abaixo). Não importa React/Next.
- **`web/components/`** — os componentes React por view e os modais.
- **`web/tests/`** — Vitest. Testes de caracterização + o baseline como teste executável.

Variáveis de ambiente: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(em `web/.env.local` localmente; nas configs do projeto na Vercel). A anon key é **pública por
design** — o isolamento é 100% RLS. Nenhum outro segredo entra no cliente.

## Rodar / testar localmente

Tudo dentro de `web/`:

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest (testes de caracterização + baseline)
npx tsc --noEmit   # type-check
npm run lint       # ESLint (regras do projeto incluídas)
npm run build      # build de produção
```

Precisa de um projeto Supabase real (schema + `.env.local`) para auth e dados — não há modo
offline/mock. Para dados de teste, use o `seed-teste.mjs` da raiz.

> **Atenção — Next 16 tem breaking changes** vs. versões anteriores. Antes de escrever código de
> app, consultar os docs empacotados em `web/node_modules/next/dist/docs/` (aviso do
> `web/AGENTS.md`). Duas regras do React Compiler que já morderam durante a migração: **não** chamar
> `setState` dentro de `useEffect` (derive o valor) e **não** escrever em `ref.current` durante o
> render (faça no efeito).

## Arquitetura

A regra de ouro herdada do app antigo: **o núcleo de cálculo é a fonte única de verdade** — Dashboard,
Metas, Insights e Relatórios consomem as mesmas funções, então nunca divergem. Esse núcleo vive em
`web/lib/` e **não importa React, Next, Supabase nem o store** — só tipos e helpers de data. É o que
o torna testável puro.

### `web/lib/` — núcleo e dados

- **`constantes.ts`** — `STATUS_FLOW` (funil: Novo contato → … → Locado), `STATUS_TERMINAL_NEGATIVE`
  (Sem resposta / Perdido / Cancelado — saídas laterais, fora do funil), `TIPOS_IMOVEL`,
  `FORMAS_ABORDAGEM`, `ORIGENS_IMOVEL`, `MOTIVOS_PERDA`, `STATUS_COLORS`, `AGENDA_TYPES`,
  `RESULTADOS_TENTATIVA`, `STALE_DAYS_THRESHOLD`, `VERIFICACAO_DISPONIBILIDADE_DIAS`.
- **`datas.ts`** — **único módulo autorizado a usar `new Date`** (regra de ESLint). Datas circulam
  sempre como string ISO `YYYY-MM-DD`, manipuladas por `parseDate`/`daysBetween`/`addDaysISO`/
  `todayISO`/`weekRange`. `new Date` cru interpreta ISO como UTC e desloca o dia.
- **`formatadores.ts`** — `fmtMoney`, `fmtDate`, etc.
- **`tipos.ts`** — `Imovel`, `Meta`, `AgendaItem`, `Abordagem`, `Tentativa`, `UserConfig`,
  `StatusHistoryEntry`.
- **`calculo/motor.ts`** — o motor: `dateEnteredStatus`, `currentStatusSince`, `isStale`,
  `foiAngariado`, `metricsForRange`, coortes mensais, tempo médio, etc.
- **`calculo/filtros.ts`** — filtro/ordenação do Pipeline (parte pura).
- **`calculo/dashboard.ts` · `insights.ts` · `relatorios.ts` · `agenda.ts`** — as métricas de cada
  view, extraídas da montagem de HTML antiga sem alterar nenhuma fórmula.
- **`calculo/canais.ts` · `abordagens.ts`** — features da pós-migração (sem oráculo do app antigo),
  os **dois eixos da captação**: `canais` mede a ORIGEM do imóvel (onde a oportunidade foi achada);
  `abordagens` mede o ROTEIRO usado no contato (o que se diz). Não confundir com a
  `formaAbordagem` do imóvel, que é o CANAL. Ver "Abordagens e tentativas" abaixo.
- **`calculo/followup.ts`** — elegibilidade e texto do follow-up em lote (os freios que impedem
  o disparo em rajada). A fila que executa é `filaFollowUp.ts`. Ver "Follow-up em lote" abaixo.
- **`calculo/duplicidade.ts`** — detecta imóvel já cadastrado. A identidade é
  `endereço + cidade + unidade + bloco`, comparada por chave normalizada (grafia, acento,
  pontuação e abreviação de logradouro não contam). `unidade`/`bloco` fazem parte da identidade
  de propósito: no mesmo prédio o ap 101 e o ap 202 são imóveis **diferentes**. O modal **avisa,
  não bloqueia** — recadastrar às vezes é proposital (um "Perdido" que voltou a atender).
- **`persistencia/mapeadores.ts`** — `toDb*`/`fromDb*` que traduzem entre o camelCase do app e o
  snake_case do Supabase. Definem o contrato de dados.
- **`persistencia/supabase.ts`** — cliente singleton do browser. **`persistencia/carregarEstado.ts`**
  — o `loadState()`: busca as 5 tabelas em paralelo no login. Erro em `user_config` ou `abordagens`
  **não** derruba o carregamento (o app inteiro funciona sem eles); erro nas outras três propaga.
- **`store.ts`** — store Zustand espelhando o `STATE` legado, mais o catálogo de abordagens
  (`{ imoveis, metas, agenda, abordagens, config }`).
- **`mutacoes.ts`** — **todas as escritas no Supabase** num só lugar (criar/editar/excluir imóvel,
  metas, agenda, abordagens, tentativas, verificação, config, dados demo).
  `aplicarMudancaDeStatus()` é o **único** ponto que empurra no `statusHistory`.
- **`uiPipeline.ts` / `uiModal.ts`** — estado de UI (filtros/drawer do Pipeline; modal ativo).
- **`filaFollowUp.ts`** — a fila do follow-up em lote (estado + orquestração dos envios). Como o
  `mutacoes.ts`, é exceção consciente à regra abaixo: orquestra efeitos, não calcula.
- **`toast.ts` / `geo.ts` / `dadosDemo.ts` / `auth/`** — notificações; CEP (ViaCEP) + geocoding
  (Nominatim); seed de exemplo; força de senha e tradução de erros do Supabase Auth.

### `web/components/` — UI

Cada view é `components/<view>/<View>.tsx` renderizado pela rota correspondente. Chart.js e Leaflet
são instanciados em `useEffect` **com cleanup** (`chart.destroy()` / `map.remove()`) — é o que
substitui o destroy que o `renderCurrentView()` fazia no app antigo; sem isso, vazam. Leaflet entra
por `dynamic(..., { ssr: false })`. Os modais vivem em `components/modais/`, orquestrados por
`ModalOverlay` (um modal ativo por vez, via `uiModal.ts`).

### Invariante do `statusHistory`

A verdade sobre o progresso de um imóvel mora no **`statusHistory`** (array de `{status, date}`), não
no campo `status` atual nem na existência do registro. Toda mudança de status passa por
`aplicarMudancaDeStatus()`, que empurra `{status, date: todayISO()}` (só se a última entrada já não
for esse status). Métricas de conversão, coortes e stale derivam do histórico. `foiAngariado()` só
conta um imóvel como angariado quando o histórico registra a entrada em "Angariado" — criar o
registro ou fazer o primeiro contato **não** conta.

### Abordagens e tentativas

Mesma ideia do `statusHistory`, aplicada à captação: a verdade mora no **histórico de tentativas**,
não num campo único do imóvel.

- **Abordagem** é o **roteiro** — o que se diz ao proprietário ("ofereço avaliação gratuita").
  Vive na tabela `abordagens` (catálogo por usuário). **Não confundir** com `imovel.formaAbordagem`,
  que é o **canal** (WhatsApp, ligação, visita). São eixos independentes: o mesmo roteiro roda em
  canais diferentes.
- **Tentativa** é um contato feito. Fica em `imoveis.tentativas` (`jsonb`, como `notas` e
  `status_history`), com `{ abordagemId, canal, resultado, data, observacao }`.

Um imóvel tem **várias** tentativas de propósito. Creditar só uma enviesaria o ranking: os roteiros
de fechamento sempre pareceriam melhores que os de abertura, porque só eles apareceriam nos casos
que deram certo. Por isso `calculo/abordagens.ts` mede três coisas **separadas** — `taxaResposta`
(o proprietário reagiu; recusa conta, porque reagir ≠ aceitar), `taxaAngariacao` (participação, sem
atribuir causa) e `destravou` (foi a última tentativa antes da entrada em "Angariado").

Duas regras ao mexer nisso:

- **Abordagem se arquiva, não se exclui** (`arquivada`). As tentativas apontam para o `id`; apagar
  deixaria o histórico órfão e o ranking perderia a leitura do que já foi feito.
- **Amostra mínima é parte do contrato.** Abaixo de `MIN_TENTATIVAS` a linha é marcada e vai para o
  fim do ranking — com 1 tentativa, "100% de conversão" só significa que aconteceu uma vez.

**Os históricos jsonb somem sem avisar.** `notas`, `tentativas` e `status_history` moram em colunas
jsonb da linha do imóvel, e `salvarImovel` faz **upsert da linha inteira**. Quem montar um `Imovel`
campo a campo (é o que os modais fazem) e esquecer de carregar um desses históricos o **apaga no
banco** — sem erro, sem toast, com o imóvel salvando "com sucesso". Foi um bug real: as tentativas
ficaram de fora do `ModalImovel` e toda edição de imóvel zerava o histórico, corrompendo o ranking
em silêncio. Hoje `salvarImovel` repõe o que vier `undefined`, mas a rede não cobre quem passa `[]`
— esvaziar de verdade é trabalho das mutações próprias de cada histórico, que usam update parcial
da coluna.

### Follow-up em lote

Uma mensagem para cada proprietário parado em "Sem resposta", de uma vez. As partes puras
(elegibilidade, texto, intervalo, resumo) ficam em `calculo/followup.ts`; a execução em
`filaFollowUp.ts`, um store Zustand que roda a fila em background chamando a rota de WhatsApp já
existente uma vez por imóvel. Entrada pelo Pipeline; UI em `ModalFollowUpLote` +
`painel/IndicadorFollowUp`.

O desenho é governado por um risco que **não é de software**: disparar mensagens em rajada pela
mesma instância derruba o número da imobiliária, e o público aqui é o pior possível para o detector
de spam — gente que já não respondeu. Os freios não são preferência de UX:

- **O lote nunca vira rajada.** 10 por rodada, 20 por dia, envio sequencial com intervalo
  **sorteado** entre 30 e 60s (cadência exata de N em N segundos é assinatura de bot). Mexer nesses
  números é mexer na chance de o número ser banido, não em conforto.
- **Os cortes saem das tentativas, não de campo novo.** "Falou há menos de 14 dias" e "já acumulou
  4 tentativas" são lidos do histórico que já existe — mesma leitura do ranking de abordagens.
  Nenhuma coluna, nenhuma migração, nenhuma política RLS a mais.
- **Um seletor só, o de abordagem.** Ela é ao mesmo tempo o texto que sai (o `roteiro`) e o
  `abordagemId` que fica registrado na tentativa. Dois seletores permitiriam divergir "o que eu
  disse" de "o que eu anotei que disse", e o ranking passaria a medir ficção.
- **O texto base é um MOLDE**, com `{nome}`/`{endereco}` — nunca a mensagem já preenchida de um
  proprietário, senão as outras nove sairiam com o nome errado. Sem `{nome}` o modal avisa: as
  mensagens sairiam idênticas, que é a assinatura de spam mais forte que existe.
- **Falha de ambiente encerra a fila** (`falhaEncerraLote`): instância caída ou token recusado vai
  falhar igual nos nove seguintes. Falha do contato da vez (`sem-whatsapp`, número inválido) não
  interrompe — não diz nada sobre o próximo.

A fila mora num store, e não no modal, porque o corretor segue prospectando enquanto as mensagens
saem; o indicador fica montado no layout do painel (fora do `<main>`) para sobreviver à troca de
view. Cada envio bem-sucedido registra a tentativa em modo **silencioso** — dez toasts por cima do
formulário que ele está preenchendo tornariam a feature inutilizável; o resumo é um toast só, no fim.

### Modelo de RLS

Supabase (Postgres + Auth) é o backend dos **dados**: nenhum código de servidor participa da
leitura/escrita, e o isolamento por usuário é 100% das políticas RLS (`auth.uid() = user_id`) em
`supabase-schema.sql`. Ao adicionar uma tabela/coluna user-scoped, ela precisa das próprias
políticas RLS no mesmo padrão + o par `toDb*`/`fromDb*` em `web/lib/persistencia/mapeadores.ts` +
o tipo em `web/lib/tipos.ts`.

### As rotas de servidor: `api/whatsapp/enviar` e `api/ia`

São as **duas** exceções ao "sem servidor", e existem pelo mesmo motivo: guardam um segredo que não
pode chegar ao browser. Toda rota nova aqui precisa justificar-se por esse critério — se não guarda
segredo, é código de cliente.

#### `api/whatsapp/enviar`

O envio direto de WhatsApp (Evolution API) existe por um motivo: o token da Evolution não pode
chegar ao browser. O fluxo é
`ModalWhatsapp` → `lib/envioWhatsapp.ts` (browser) → a rota (servidor) → Evolution.

Três regras ao mexer nela:

- **O destinatário sai do banco, não do browser.** A rota recebe `{ imovelId, mensagem }` e lê o
  telefone com o token de quem chamou (o RLS escopa ao dono). Aceitar o número do cliente
  transformaria a rota num disparador para qualquer número.
- **Toda requisição valida a sessão do Supabase** (`Authorization: Bearer <access_token>`). Sem
  isso, qualquer um na internet manda WhatsApp pela nossa instância.
- **As env vars da Evolution nunca levam `NEXT_PUBLIC_`** (`EVOLUTION_SERVER_URL`,
  `EVOLUTION_INSTANCE`, `EVOLUTION_TOKEN`). Sem elas o app não quebra: o modal cai no `wa.me`.

As partes puras (`numeroEvolution`, `mensagemFalhaEnvio` e o tipo `FalhaEnvio`) ficam em
`lib/calculo/whatsapp.ts`, para cliente e servidor concordarem no mesmo vocabulário de erros.

**O número: quem valida é o WhatsApp, não uma regex.** `numeroEvolution` só confere o *formato*
(DDI 55 + DDD + 8–9 dígitos); antes de enviar, a rota chama `/chat/whatsappNumbers` e usa o **jid
canônico** que volta. Isso resolve duas coisas que regex nenhuma resolve:

- **O nono dígito.** O WhatsApp guarda muitos celulares brasileiros *sem* o 9 — em Londrina,
  `5543998024316` e `554398024316` são a mesma conta, e o jid canônico é o sem o 9. Uma versão
  antiga deste código exigia "9 dígitos começando em 9" e **recusava números reais que funcionam**.
  Não reintroduza essa regra.
- **O telefone estrangeiro.** `telefoneWhatsapp()` prefixa `55` em qualquer número de 10–11 dígitos,
  então `+1 415 555 2671` vira `5514155552671` — que passa por qualquer teste de forma. Só a
  consulta revela que não existe, evitando mandar mensagem para um estranho.

#### `api/ia` — sugestão de roteiros e leitura do ranking (OpenAI)

Duas funções, ambas escrevendo **texto**: sugerir roteiros de abordagem e interpretar o ranking.
O fluxo espelha o do WhatsApp — `lib/ia.ts` (browser) → a rota (servidor) → OpenAI —, e as
partes puras (prompts, esquema, `FalhaIa`) ficam em `lib/calculo/ia.ts`.

A chave (`OPENAI_API_KEY`, **sem** `NEXT_PUBLIC_`) é cobrada por token consumido. Sem ela o app
não quebra: os botões respondem "não configurado" e o resto segue igual.

O provedor está isolado na rota: `lib/calculo/ia.ts` (prompts, esquema, vocabulário de erro) não
importa SDK nenhum, e `lib/ia.ts` só fala com `/api/ia`. Trocar de provedor de novo mexe em um
arquivo. O modelo é a constante `MODELO` no topo da rota.

Três regras ao mexer nela:

- **O prompt é montado no servidor, nunca recebido do browser.** O cliente manda no máximo um
  contexto curto e tipado, que `lib/calculo/ia.ts` trunca (`MAX_CONTEXTO`). Aceitar texto livre
  transformaria a rota num proxy de LLM aberto, pago na nossa conta — é o análogo exato do
  "o destinatário sai do banco".
- **Os números da análise saem do banco.** A rota relê os imóveis com o token de quem chamou e roda
  o **mesmo** cálculo puro da tela (`calculo/abordagens.ts`). Se o browser mandasse o ranking pronto,
  a análise sairia bem escrita em cima de números forjados — e ninguém notaria.
- **A IA não calcula métrica.** Ela recebe os números prontos e só interpreta. Trocar isso por "pede
  pra IA analisar os dados crus" devolveria número inventado com cara de relatório.

## Convenções e regras (o que sempre / nunca fazer)

- **Tudo em pt-BR** — strings de UI, comentários, toasts, labels, mensagens de validação.
- **Invariante do `statusHistory`** — nunca mutar `status` sem passar por `aplicarMudancaDeStatus()`.
- **Datas só via `lib/datas.ts`** — proibido `new Date(` fora dele (regra de ESLint ativa).
- **Sem `dangerouslySetInnerHTML`** (regra do checklist; o escape do JSX é a defesa de XSS).
  Para HTML fora do React — ex.: popup do Leaflet — montar com nós do DOM e `textContent`.
- **Escritas primeiro no Supabase, depois no estado local.** O app chama o Supabase e só atualiza
  o store se a escrita deu certo; em falha, mostra `toast` de erro e o estado não muda. (Isto **não**
  é o otimismo com rollback que versões antigas da doc descreviam — ver achado A1 na §15 do
  MIGRATION_NEXT.) Toda mutação passa por `web/lib/mutacoes.ts`.
- **Novo dado user-scoped = RLS + mapper + tipo** (ver "Modelo de RLS").
- **Núcleo sem dependências** — `web/lib/` (fora de `persistencia/` e `mutacoes.ts`) não importa
  React/Next/Supabase/store. É o que mantém as 4 views concordando e permite testar puro.
- **Chart.js / Leaflet** — instanciar em `useEffect` com cleanup; testar navegação repetida (sem
  `canvas` órfão nem `.leaflet-container` sobrando).
- **Novo modal** — encapsular o próprio estado e registrar no `ModalOverlay`/`uiModal.ts`; garantir
  que reabrir não herde estado do uso anterior.
- **Bibliotecas novas via npm** em `web/`, fixando a mesma major das existentes quando fizer sentido
  (Chart.js 4, Leaflet 1.9, Supabase JS 2, Zustand 5).
- **Sem segredo no cliente além da anon key.** Segredo mora em API Route (é o caso das env vars da
  Evolution em `app/api/whatsapp/enviar` e da `OPENAI_API_KEY` em `app/api/ia`); código que chega
  ao browser, nunca. Na prática: variável com `NEXT_PUBLIC_` é pública — se é segredo, não leva o
  prefixo.

## Ao trabalhar aqui

Depois de qualquer mudança: `npm test`, `npx tsc --noEmit`, `npm run lint` e `npm run build` verdes,
e validar exercitando a UI no browser com o console limpo. Para mudanças de cálculo/KPIs, conferir
que Dashboard, Metas, Insights e Relatórios continuam concordando entre si (divergência entre eles é
sinal de bug) e comparar com o [BASELINE_ETAPA0.md](BASELINE_ETAPA0.md) — que é também um teste
executável (`web/tests/baseline-etapa0.test.ts`).
