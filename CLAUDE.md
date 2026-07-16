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
  `agenda`, `user_config`) com as políticas RLS que escopam cada linha a `auth.uid() = user_id`.
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
  **`app/api/whatsapp/enviar/route.ts`** é a única rota de servidor do projeto (ver abaixo).
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
  `STALE_DAYS_THRESHOLD`, `VERIFICACAO_DISPONIBILIDADE_DIAS`.
- **`datas.ts`** — **único módulo autorizado a usar `new Date`** (regra de ESLint). Datas circulam
  sempre como string ISO `YYYY-MM-DD`, manipuladas por `parseDate`/`daysBetween`/`addDaysISO`/
  `todayISO`/`weekRange`. `new Date` cru interpreta ISO como UTC e desloca o dia.
- **`formatadores.ts`** — `fmtMoney`, `fmtDate`, etc.
- **`tipos.ts`** — `Imovel`, `Meta`, `AgendaItem`, `UserConfig`, `StatusHistoryEntry`.
- **`calculo/motor.ts`** — o motor: `dateEnteredStatus`, `currentStatusSince`, `isStale`,
  `foiAngariado`, `metricsForRange`, coortes mensais, tempo médio, etc.
- **`calculo/filtros.ts`** — filtro/ordenação do Pipeline (parte pura).
- **`calculo/dashboard.ts` · `insights.ts` · `relatorios.ts` · `agenda.ts`** — as métricas de cada
  view, extraídas da montagem de HTML antiga sem alterar nenhuma fórmula.
- **`persistencia/mapeadores.ts`** — `toDb*`/`fromDb*` que traduzem entre o camelCase do app e o
  snake_case do Supabase. Definem o contrato de dados.
- **`persistencia/supabase.ts`** — cliente singleton do browser. **`persistencia/carregarEstado.ts`**
  — o `loadState()`: busca as 4 tabelas em paralelo no login.
- **`store.ts`** — store Zustand espelhando o `STATE` legado (`{ imoveis, metas, agenda, config }`).
- **`mutacoes.ts`** — **todas as escritas no Supabase** num só lugar (criar/editar/excluir imóvel,
  metas, agenda, verificação, config, dados demo). `aplicarMudancaDeStatus()` é o **único** ponto
  que empurra no `statusHistory`.
- **`uiPipeline.ts` / `uiModal.ts`** — estado de UI (filtros/drawer do Pipeline; modal ativo).
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

### Modelo de RLS

Supabase (Postgres + Auth) é o backend dos **dados**: nenhum código de servidor participa da
leitura/escrita, e o isolamento por usuário é 100% das políticas RLS (`auth.uid() = user_id`) em
`supabase-schema.sql`. Ao adicionar uma tabela/coluna user-scoped, ela precisa das próprias
políticas RLS no mesmo padrão + o par `toDb*`/`fromDb*` em `web/lib/persistencia/mapeadores.ts` +
o tipo em `web/lib/tipos.ts`.

### A única rota de servidor: `web/app/api/whatsapp/enviar`

O envio direto de WhatsApp (Evolution API) é a **única** exceção ao "sem servidor", e existe por um
motivo: o token da Evolution não pode chegar ao browser. O fluxo é
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
  Evolution, em `app/api/whatsapp/enviar`); código que chega ao browser, nunca. Na prática: variável
  com `NEXT_PUBLIC_` é pública — se é segredo, não leva o prefixo.

## Ao trabalhar aqui

Depois de qualquer mudança: `npm test`, `npx tsc --noEmit`, `npm run lint` e `npm run build` verdes,
e validar exercitando a UI no browser com o console limpo. Para mudanças de cálculo/KPIs, conferir
que Dashboard, Metas, Insights e Relatórios continuam concordando entre si (divergência entre eles é
sinal de bug) e comparar com o [BASELINE_ETAPA0.md](BASELINE_ETAPA0.md) — que é também um teste
executável (`web/tests/baseline-etapa0.test.ts`).
