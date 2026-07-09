# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Painel de Angariações" — a single-tenant-per-login CRM/dashboard for real-estate agents to track property acquisition (angariação) for rental listings, from first contact through to a signed lease. UI and all code comments/strings are in Brazilian Portuguese.

## Stack and structure

Pure static site, no build step, no package manager, no bundler:

- [index.html](index.html) — single HTML shell (login screen + app shell with empty `#main-content`); loads Chart.js, Leaflet, and Supabase JS via CDN `<script>` tags, then `supabase-config.js`, `style.css`, `app.js`.
- [app.js](app.js) — the entire application (~2900 lines): state, data mapping, calculations, view rendering, modals, auth. Everything is global functions and a global `STATE` object — there are no modules/imports/build tooling.
- [style.css](style.css) — all styling, driven by CSS custom properties defined at the top under `:root`.
- [supabase-config.js](supabase-config.js) — holds `SUPABASE_URL` / `SUPABASE_ANON_KEY` and creates the global `supabaseClient`. The anon key is meant to be public; per-row access is enforced entirely by Postgres RLS policies, not app logic.
- [supabase-schema.sql](supabase-schema.sql) — full DB schema (`imoveis`, `metas`, `agenda`, `user_config` tables) with RLS policies scoping every row to `auth.uid() = user_id`. Idempotent — safe to re-run in the Supabase SQL editor.
- [DEPLOY.md](DEPLOY.md) — end-user deployment walkthrough (Supabase project setup + Vercel static deploy). No CI/build config exists; Vercel serves the files as-is.

## Running / testing locally

There is no build, lint, or test command — this is hand-written vanilla JS/CSS/HTML served statically. To work on it locally, serve the directory with any static file server (e.g. `npx serve .` or the VS Code Live Server extension) and open it in a browser; a real Supabase project (see `supabase-config.js` + `supabase-schema.sql`) is required for auth and data to work, since there is no offline/mock mode.

Verify changes by exercising the UI in a browser directly — check browser devtools console for JS errors, since there is no test suite or type checker.

## Architecture

### `app.js` is organized into clearly numbered sections (see the header comment for the full list); use it as your map rather than scanning the whole file:

1. **Constants & global state** — `STATUS_FLOW` (the funnel: Novo contato → Visita agendada → ... → Locado), `STATUS_TERMINAL_NEGATIVE` (Sem resposta/Perdido/Cancelado — lateral exits, not part of the funnel), and the single global `STATE = { imoveis, metas, agenda, config }`.
2. **Persistence** — `toDbImovel`/`fromDbImovel` and `toDbAgenda`/`fromDbAgenda` map between the app's camelCase objects and Supabase's snake_case columns. `loadState()` fetches all four tables in parallel on login. There is no per-mutation reconciliation with the server: writes are optimistic — the calling function updates `STATE` locally and calls `refresh()`/`renderCurrentView()` directly after the Supabase call succeeds.
3. **Utilities** — date helpers (all dates are ISO `YYYY-MM-DD` strings, parsed via `parseDate`/`daysBetween`/`addDaysISO`), formatters (`fmtMoney`, `fmtDate`), `toast()` for notifications, `escapeHtml()` (used everywhere views build strings — any new HTML-string-building code must escape user data through this).
4. **Calculation engine** — the single source of truth for all derived metrics, shared by Dashboard/Metas/Insights/Relatórios so they never disagree. Key concept: **`statusHistory`** (an array of `{status, date}` on each imóvel) drives everything — `dateEnteredStatus()`, `currentStatusSince()`, `isStale()` (≥`STALE_DAYS_THRESHOLD` days without a status change), and `foiAngariado()` (an imóvel only counts as "angariado" once its history actually records entering the "Angariado" status — just creating the record or making first contact does not count).
5. **Views** — each view is a pair: a `viewX()` function returning an HTML string assigned to `#main-content`, and (where the view needs post-render JS wiring, e.g. Chart.js/Leaflet instances or event listeners) an `afterRenderX()` called right after. `renderCurrentView()` is the router — it destroys prior Chart.js instances and the Leaflet map before switching views to avoid leaks. Views: Dashboard, Pipeline (Kanban or Lista — a toggle, both reading from the same filtered set via `filteredImoveisEnhanced()`), Metas (monthly goals), Agenda (tasks/reminders, including auto-generated "verificar disponibilidade" reminders `VERIFICACAO_DISPONIBILIDADE_DIAS` after acquisition), Insights, Mapa (Leaflet map of imóveis with lat/lng), Relatórios (printable weekly/monthly reports), Roadmap (static "Integrações & IA" info page).
6. **Modals** — `openImovelModal(id?)` (create/edit imóvel; includes CEP lookup via ViaCEP-style API and geocoding via Nominatim for the mini-map), `openMetaModal()`, `openAgendaModal(id?)`. Generic open/close via `openModal()`/`closeModal()` toggling `#modal-overlay`; `closeModal()` also resets all the `editingXId`/mini-map module-level state, so any new modal type must add its own reset there.
7. **Auth & boot** — Supabase Auth (email/password + password recovery flow) drives everything via `supabaseClient.auth.onAuthStateChange`; `handleAuthenticated()`/`handleUnauthenticated()` toggle between `#auth-screen` and `#app-shell` and trigger `loadState()` + first render. No client-side router/URL state — `currentView` is just an in-memory string, navigation resets on reload.

### Status-history invariant

Whenever code changes an imóvel's `status`, it must push `{status, date: todayISO()}` onto `statusHistory` (only if the last entry isn't already that status — see `saveImovel()` around line 1620) rather than mutating status in place. Nearly all metrics (conversion time, stale detection, monthly cohorts) are derived from this history, not from `status` alone.

### Row-level security model

There is no server-side app code — Supabase (Postgres + Auth) is the entire backend, and per-user data isolation is enforced purely by the RLS policies in [supabase-schema.sql](supabase-schema.sql) (`auth.uid() = user_id` on every table). When adding a new table or column that should be user-scoped, it must get its own RLS policies following the same pattern, plus a corresponding `toDb*`/`fromDb*` mapper pair in `app.js`.

---

## Domínio do negócio (contexto)

O sistema é a ferramenta de trabalho de um agente de imóveis para **angariação (captação) de imóveis para locação** — o processo de trazer um imóvel novo para a carteira, do primeiro contato com o proprietário até o imóvel estar disponível/locado. Termos que aparecem no código e o que significam no negócio:

- **Angariação / angariar** — captar um imóvel para a carteira. Um imóvel só é considerado *angariado* quando o `statusHistory` registra a entrada no status "Angariado" (via `foiAngariado()`). Criar o registro ou fazer o primeiro contato **não** conta como angariado — essa distinção é intencional e sustenta os KPIs.
- **Funil (`STATUS_FLOW`)** — a sequência positiva de progresso (Novo contato → ... → Locado). Avançar no funil é o que a operação quer maximizar.
- **Saídas laterais (`STATUS_TERMINAL_NEGATIVE`)** — Sem resposta / Perdido / Cancelado. Não fazem parte do funil; são perdas. Não trate essas como etapas do funil em cálculos de conversão.
- **Stale** — imóvel parado há ≥ `STALE_DAYS_THRESHOLD` dias sem mudança de status. É o principal sinal de "precisa de ação" no pipeline e na agenda.
- **Verificar disponibilidade** — lembrete auto-gerado `VERIFICACAO_DISPONIBILIDADE_DIAS` dias após a angariação, para confirmar com o proprietário se o imóvel segue disponível.

### Semântica de status: cuidado ao tirar conclusões

A verdade sobre o progresso de um imóvel **mora no `statusHistory`, não no campo `status` atual nem na simples existência do registro.** Antes de escrever qualquer lógica que classifique, conte ou reporte imóveis por status:

- Confirme o significado do status em `STATUS_FLOW` / `STATUS_TERMINAL_NEGATIVE` — não assuma pelo nome.
- Não confunda "registro existe" ou "status atual = X" com "passou por X" — use os helpers do motor de cálculo (`foiAngariado()`, `dateEnteredStatus()`, etc.), que leem o histórico.
- Métricas de conversão e coortes derivam do histórico. Contar direto pelo `status` atual gera números errados.

## Convenções e regras (o que sempre / nunca fazer)

Regras que o Claude Code deve seguir ao alterar este repositório:

- **Manter o site estático puro.** Nada de build step, bundler, framework, npm/package.json ou etapa de compilação. Bibliotecas novas entram por `<script>` via CDN em `index.html`, do mesmo jeito que Chart.js, Leaflet e Supabase JS. Se uma mudança "pediria" um framework, proponha a alternativa em vanilla JS antes.
- **Tudo em português do Brasil** — strings de UI, comentários, mensagens de `toast()`, labels. Manter o padrão existente.
- **Invariante do `statusHistory`** — ao mudar `status`, sempre empurrar `{status, date: todayISO()}` no `statusHistory` (só se a última entrada já não for esse status). Nunca mutar `status` sem registrar no histórico.
- **Sempre escapar dados do usuário** com `escapeHtml()` em qualquer código que monte HTML como string. É a defesa de XSS do app.
- **Datas sempre como string ISO `YYYY-MM-DD`**, manipuladas pelos helpers (`parseDate`/`daysBetween`/`addDaysISO`). Não introduzir `Date` cru nem outros formatos.
- **Escritas otimistas exigem tratamento de erro.** Como não há reconciliação por mutação com o servidor, toda chamada ao Supabase que altera dados precisa tratar a falha — reverter o `STATE` local (ou re-buscar) e avisar com `toast()`. Nunca deixar a UI dessincronizada do banco por assumir que o write deu certo.
- **Novo dado user-scoped = RLS + mapper.** Toda tabela/coluna nova por usuário precisa da política RLS `auth.uid() = user_id` em `supabase-schema.sql` (mantendo o SQL idempotente) e do par `toDb*`/`fromDb*` correspondente em `app.js`.
- **Novo modal precisa registrar seu reset** em `closeModal()`, junto com os `editingXId`/mini-map existentes.
- **Ao adicionar/alterar views**, seguir o padrão `viewX()` + `afterRenderX()` e garantir que `renderCurrentView()` destrua instâncias de Chart.js/Leaflet antes de trocar de view, para evitar vazamento de memória.
- **Sem segredo no cliente além da anon key.** A `SUPABASE_ANON_KEY` é pública de propósito; o isolamento é responsabilidade da RLS. Não colocar chaves de serviço/privadas no front.

## Ao trabalhar aqui

Não existe suíte de testes nem type checker. Depois de qualquer mudança, valide exercitando a UI no browser e conferindo o console do devtools por erros de JS. Para mudanças que tocam cálculo/KPIs, confira se Dashboard, Metas, Insights e Relatórios continuam concordando entre si (todos consomem o mesmo motor de cálculo — divergência entre eles é sinal de bug).