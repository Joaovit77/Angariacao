# MIGRATION_NEXT.md — Guia Oficial da Migração para Next.js (App Router)

> **Status:** planejamento — a migração ainda NÃO foi iniciada.
> Este documento é a fonte de verdade da migração. Qualquer desvio do plano deve ser registrado aqui antes de ser executado.

---

## 1. Objetivo da migração

Migrar o "Painel de Angariações" — hoje um site estático puro (`index.html` + `app.js` com ~3.170 linhas + `style.css` + `supabase-config.js`) — para **Next.js com App Router**, preservando **100% do comportamento atual**, das regras de negócio e da experiência do usuário.

Motivações:

- **Modularização** — quebrar o `app.js` monolítico (estado global + views + modais + auth em um único arquivo) em módulos com responsabilidade única, testáveis isoladamente.
- **Componentização** — substituir a montagem de HTML por concatenação de strings (com `escapeHtml()` manual) por JSX, onde o escape de dados do usuário é automático, eliminando a classe inteira de bugs de XSS por esquecimento.
- **Roteamento real** — hoje `currentView` é uma string em memória e a navegação se perde no reload; o App Router dá URLs por view, deep-linking e histórico do navegador.
- **Base para evolução** — TypeScript, testes automatizados e a página "Roadmap (Integrações & IA)" pedem uma fundação que o site estático não oferece (ex.: API Routes para integrações server-side sem expor segredos).

O que a migração **não** é: não é um redesign, não é uma reescrita das regras de negócio, não é uma troca de backend. Supabase (Postgres + Auth + RLS) continua sendo o backend inteiro.

> **Nota sobre o CLAUDE.md:** a regra "Manter o site estático puro" do CLAUDE.md é explicitamente substituída por esta migração, autorizada pelo dono do projeto. Ao final da migração (e somente ao final), o CLAUDE.md deve ser reescrito para refletir a nova arquitetura. Todas as demais regras do CLAUDE.md (statusHistory, datas ISO, escritas otimistas com rollback, RLS, pt-BR, etc.) permanecem válidas e obrigatórias.

---

## 2. Escopo

### Dentro do escopo

| Área | Hoje | Depois |
|---|---|---|
| Shell da aplicação | `index.html` único | Layouts do App Router (`app/layout.tsx`, grupo autenticado) |
| Views (Dashboard, Pipeline, Metas, Agenda, Insights, Mapa, Relatórios, Roadmap) | funções `viewX()` retornando string HTML + `afterRenderX()` | Uma rota/página por view, componentes React |
| Modais (Imóvel, Meta, Agenda) | `openImovelModal()` etc. + reset manual em `closeModal()` | Componentes de modal com estado próprio |
| Estado global (`STATE`) | objeto global mutável | Camada de estado client-side (ver §4) |
| Motor de cálculo (seção 4 do `app.js`) | funções globais | Módulo puro portado **verbatim** (ver §7) |
| Persistência (mapeadores `toDb*`/`fromDb*`, `loadState()`) | funções globais | Módulo de dados; mapeadores portados verbatim |
| Auth (Supabase email/senha + recuperação) | `onAuthStateChange` alternando telas | `@supabase/supabase-js` no client + proteção de rotas |
| Estilos | `style.css` com custom properties em `:root` | Mesmo CSS, importado globalmente (sem redesign) |
| Bibliotecas CDN (Chart.js, Leaflet, Supabase JS) | `<script>` no `index.html` | Dependências npm com as **mesmas versões major** |
| Deploy | Vercel estático | Vercel (Next.js nativo); `DEPLOY.md` atualizado ao final |

### Fora do escopo (não fazer durante a migração)

- Qualquer mudança de schema no Supabase (`supabase-schema.sql` não é tocado).
- Qualquer mudança nas políticas RLS.
- Redesign visual, mudança de layout, novos componentes de UI que não existam hoje.
- Novas features, novos campos, novos status, novas métricas.
- SSR/Server Components para dados do usuário (ver §4 — o app permanece client-side sobre a anon key + RLS).
- Internacionalização — tudo continua em português do Brasil.
- Correção de bugs de comportamento descobertos no caminho: **registrar** o bug, reproduzi-lo no código antigo e no novo, e corrigir em commit separado *após* a paridade ser atingida (um bug reproduzido nos dois é paridade; "corrigir de passagem" esconde regressões).

---

## 3. O que NÃO pode ser alterado durante a migração

Estas são as invariantes do sistema. Violação de qualquer uma delas é regressão, mesmo que "o código novo pareça melhor".

1. **Invariante do `statusHistory`.** Toda mudança de `status` de um imóvel empurra `{status, date: todayISO()}` no `statusHistory` (apenas se a última entrada já não for esse status). Nunca mutar `status` sem registrar histórico. Todas as métricas derivam do histórico, não do status atual.
2. **Semântica de "angariado".** Um imóvel só conta como angariado quando `foiAngariado()` (leitura do histórico) confirma a entrada no status "Angariado". Criar o registro ou fazer primeiro contato **não** conta.
3. **Funil vs. saídas laterais.** `STATUS_FLOW` (Novo contato → … → Locado) é o funil; `STATUS_TERMINAL_NEGATIVE` (Sem resposta / Perdido / Cancelado) são perdas, nunca etapas de conversão. As constantes e sua ordem não mudam.
4. **Motor de cálculo como fonte única.** Dashboard, Metas, Insights e Relatórios consomem o mesmo motor e devem continuar concordando entre si. O motor é portado byte a byte na lógica (ver §7); nenhuma "simplificação" ou "correção" de fórmula durante a migração.
5. **Datas como string ISO `YYYY-MM-DD`**, manipuladas por `parseDate`/`daysBetween`/`addDaysISO`. Nada de `Date` cru, timezone, `dayjs`/`date-fns` ou outros formatos.
6. **Escritas otimistas com tratamento de erro.** Toda mutação: atualiza estado local → chama Supabase → em falha, reverte o estado (ou re-busca) e avisa via toast. Nunca deixar a UI dessincronizada do banco.
7. **Modelo de segurança.** Isolamento por usuário é 100% RLS (`auth.uid() = user_id`). A anon key continua pública; nenhuma service key ou segredo entra no código do cliente. Nenhuma lógica de autorização é movida para o app.
8. **Constantes de negócio** — `STATUS_FLOW`, `STATUS_TERMINAL_NEGATIVE`, `TIPOS_IMOVEL`, `FORMAS_ABORDAGEM`, `ORIGENS_IMOVEL`, `MOTIVOS_PERDA`, `STATUS_COLORS`, `AGENDA_TYPES`, `STALE_DAYS_THRESHOLD`, `VERIFICACAO_DISPONIBILIDADE_DIAS` — valores e ordem idênticos.
9. **Comportamentos automáticos** — lembretes auto-gerados de "verificar disponibilidade" N dias após a angariação; detecção de stale (≥ `STALE_DAYS_THRESHOLD` dias sem mudança de status); geocoding via Nominatim e busca de CEP no modal de imóvel.
10. **Idioma** — toda string de UI, toast, label e comentário em pt-BR.
11. **Schema e contrato de dados** — colunas snake_case do Supabase e o shape camelCase dos objetos do app (os mapeadores `toDb*`/`fromDb*` definem esse contrato; portá-los sem alterar nenhum nome de campo).
12. **Aparência e fluxos de UX** — mesmas telas, mesmos textos, mesmos passos. O usuário não deve perceber a migração (exceto pela URL agora refletir a view).

---

## 4. O que pode ser modernizado

Modernizações **permitidas** (fazem parte do objetivo):

- **TypeScript** — todo código novo em `.ts`/`.tsx`. Tipar `Imovel`, `Meta`, `AgendaItem`, `UserConfig`, `StatusHistoryEntry` a partir dos mapeadores existentes. Os tipos documentam o contrato; não o alteram.
- **JSX no lugar de HTML-string** — o escape automático do React substitui a disciplina manual de `escapeHtml()`. Atenção: qualquer uso de `dangerouslySetInnerHTML` é proibido salvo justificativa registrada neste documento.
- **Módulos ES** — cada seção do `app.js` vira um ou mais módulos (`lib/calculo/`, `lib/persistencia/`, `lib/datas.ts`, componentes por view).
- **Roteamento por URL** — `/dashboard`, `/pipeline`, `/metas`, `/agenda`, `/insights`, `/mapa`, `/relatorios`, `/roadmap`. Reload preserva a view (melhoria de UX aceitável e desejada).
- **Estado** — substituir o `STATE` global mutável por um store client-side simples. Recomendação: **Zustand** (mínimo de cerimônia, modelo mental próximo do `STATE` atual) ou Context + `useReducer`. **Não** adotar React Query/SWR nesta migração — o modelo atual é "carrega tudo no login, escreve otimista"; replicá-lo fielmente é mais seguro que introduzir cache/invalidation novos.
- **Dependências via npm** — `chart.js`, `leaflet`, `@supabase/supabase-js` com as mesmas versões major hoje servidas por CDN (verificar as versões exatas no `index.html` no momento da Etapa 1). Wrappers React (ex.: `react-chartjs-2`, `react-leaflet`) são **opcionais** — só adotar se reduzirem código sem mudar comportamento; caso contrário, instanciar as libs imperativamente em `useEffect` (espelhando o padrão `afterRenderX()` atual, incluindo o destroy no cleanup).
- **Variáveis de ambiente** — `SUPABASE_URL`/`SUPABASE_ANON_KEY` saem de `supabase-config.js` e viram `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (continuam públicas por design).
- **Ferramentas de qualidade** — ESLint (config do Next), Prettier, `tsc --noEmit` no CI, e a suíte de testes descrita em §9. Hoje não existe nada disso; passa a existir.
- **Arquitetura client-first mantida** — as páginas de dados são Client Components (`"use client"`). Server Components/SSR ficam restritos a casca estática (layout, tela de login). Isso é uma decisão deliberada: o modelo de segurança é RLS + anon key no browser, e mover fetch de dados para o servidor mudaria o modelo de auth (cookies/refresh no server) sem nenhum ganho para um app single-user-per-login — risco alto, benefício nulo. Reavaliar apenas **depois** da migração concluída.

Modernizações **proibidas nesta migração** (anotar como ideias futuras, não executar): mudar biblioteca de gráficos ou mapas, adotar UI kit (shadcn, MUI…), CSS-in-JS/Tailwind (o `style.css` migra como está), React Query, GraphQL, mudanças de schema, PWA/offline.

---

## 5. Estratégia de migração incremental

### Princípio: "Strangler" por camadas, com o app antigo como oráculo

O app estático atual permanece funcional e intocado na raiz do repositório durante toda a migração. O app Next.js nasce em um diretório novo (ex.: `next/` — ou na raiz com o app antigo movido para `legacy/`; decidir na Etapa 1 e registrar aqui). Em todo momento existe uma versão de referência ("oráculo") contra a qual a versão nova é comparada com os mesmos dados.

A migração avança **por camadas de dependência, de dentro para fora**:

```
1. Fundação (projeto Next + TS + CSS global)
        ↓
2. Núcleo puro sem UI (datas, utilidades, constantes, motor de cálculo)  ← testes primeiro
        ↓
3. Camada de dados (tipos, mapeadores toDb*/fromDb*, cliente Supabase, store)
        ↓
4. Auth + shell (login, recuperação de senha, layout autenticado, navegação)
        ↓
5. Views, uma por vez (da mais simples à mais complexa)
        ↓
6. Modais e mutações (imóvel/meta/agenda, otimismo + rollback)
        ↓
7. Paridade final, cutover de deploy, remoção do app antigo
```

Regras do processo:

- **Uma etapa só começa quando a anterior atinge seus critérios de sucesso** (§6/§8).
- **O código antigo é a especificação.** Ao portar uma função, abrir o trecho original lado a lado e portar a lógica literalmente; refatorar *forma* (módulo, tipos) é permitido, refatorar *lógica* não.
- **Nenhum arquivo do app antigo é editado** durante as etapas 1–9. Ele só é removido na etapa final, depois do cutover validado.
- **Ambos os apps apontam para o mesmo projeto Supabase** (mesmos dados reais do usuário via RLS), o que torna a comparação visual/numérica direta: abrir os dois lado a lado e conferir que todo número bate.
- Durante a validação, **mutações são feitas preferencialmente em uma conta de teste** (usuário Supabase criado para isso), para não sujar os dados reais com escritas do app ainda não validado.

---

## 6. Ordem recomendada das etapas

### Etapa 0 — Preparação (sem código Next)
- Criar branch `migracao-next` a partir de `main`. Todo o trabalho acontece nela (ou em branches filhas com PRs para ela).
- Criar usuário de teste no Supabase e popular com um dataset representativo: imóveis em todos os 10 status, imóveis com histórico multi-status, imóveis stale, imóveis perdidos com motivo, metas de meses distintos, itens de agenda (incluindo auto-gerados), imóveis com e sem lat/lng.
- Registrar neste documento as versões exatas de Chart.js, Leaflet e Supabase JS usadas nos CDNs do `index.html`.
- **Capturar o baseline de paridade**: com o usuário de teste, fotografar (screenshots + valores anotados) cada view do app antigo — todos os KPIs do Dashboard, contagens do funil, números de Metas/Insights/Relatórios. Este baseline é o critério de aceitação das etapas 5–8.

### Etapa 1 — Fundação do projeto Next
- `create-next-app` (App Router, TypeScript, ESLint; sem Tailwind) no diretório escolhido.
- Importar `style.css` como CSS global sem modificações; copiar `favicon.ico`.
- Configurar `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` via `.env.local` (+ `.env.example` commitado).
- Página placeholder renderizando com as custom properties do CSS aplicadas.

### Etapa 2 — Núcleo puro (a etapa mais importante)
- Portar, **antes de qualquer UI**: constantes de negócio; helpers de data (`parseDate`, `daysBetween`, `addDaysISO`, `todayISO`); formatadores (`fmtMoney`, `fmtDate`); **todo o motor de cálculo** (`foiAngariado`, `dateEnteredStatus`, `currentStatusSince`, `isStale`, funções de conversão/coorte/tempo médio, `filteredImoveisEnhanced` na parte pura de filtro).
- Escrever **testes de caracterização** (ver §9) para cada função, com fixtures derivadas do dataset de teste. Estes testes são a rede de segurança de toda a migração.
- Nada aqui importa React, Next ou Supabase — é TypeScript puro, executável em Node.

### Etapa 3 — Camada de dados
- Tipos `Imovel`, `Meta`, `AgendaItem`, `UserConfig`.
- Portar `toDbImovel`/`fromDbImovel`, `toDbAgenda`/`fromDbAgenda` e os demais mapeadores, com testes de ida-e-volta (`fromDb(toDb(x)) ≅ x`).
- Cliente Supabase singleton (browser).
- Portar `loadState()` (fetch paralelo das 4 tabelas) e o store (shape espelhando `STATE = { imoveis, metas, agenda, config }`).

### Etapa 4 — Auth e shell
- Tela de login/cadastro/recuperação de senha com os mesmos textos e fluxo atual (inclusive o fluxo de recovery via `onAuthStateChange`).
- Layout autenticado: sidebar/nav com as mesmas entradas, proteção de rotas (usuário não autenticado → login), boot que dispara `loadState()`.
- Toasts portados.

### Etapa 5 — Views somente-leitura, em ordem de complexidade
1. **Roadmap** (estática — valida o pipeline de página inteiro com risco zero).
2. **Pipeline — modo Lista** (tabela + filtros via `filteredImoveisEnhanced`).
3. **Pipeline — modo Kanban** (colunas por `STATUS_FLOW`, cores, badges de stale).
4. **Agenda** (listagem, incluindo os lembretes auto-gerados de verificação de disponibilidade).
5. **Dashboard** (KPIs + Chart.js).
6. **Metas** (progresso mensal — depende do motor de coortes).
7. **Insights** (a view mais densa em métricas).
8. **Mapa** (Leaflet; atenção redobrada a cleanup de instância na navegação — equivalente ao destroy do `renderCurrentView()` atual).
9. **Relatórios** (semanal/mensal + impressão/PDF — validar o output impresso contra o antigo).

Cada view é comparada ao baseline da Etapa 0 antes de passar à próxima.

### Etapa 6 — Modais e mutações
- Modal de Imóvel (criar/editar): todos os campos, CEP lookup, geocoding Nominatim + mini-mapa, **push no `statusHistory` na mudança de status**, motivo de perda quando Perdido/Cancelado.
- Modal de Meta e modal de Agenda.
- Todas as mutações com o padrão otimista + rollback + toast de erro (testar o caminho de falha desligando a rede no devtools).
- Geração automática do lembrete de verificação de disponibilidade ao angariar.
- Exclusões (com confirmação idêntica à atual).

### Etapa 7 — Paridade final
- Rodar o **checklist de paridade completo** (§8 e baseline da Etapa 0) com o usuário de teste E com os dados reais (somente leitura nos reais).
- Sessão de uso real pelo usuário final no app novo em URL de preview da Vercel, por alguns dias, com o app antigo ainda em produção.

### Etapa 8 — Cutover
- Ajustar o projeto Vercel para servir o app Next (variáveis de ambiente incluídas).
- Atualizar `DEPLOY.md`.
- Manter o app antigo acessível (ex.: deployment de preview congelado) por um período de segurança definido (sugestão: 2 semanas).

### Etapa 9 — Limpeza
- Remover `app.js`, `index.html`, `style.css` (raiz), `supabase-config.js` antigos (o `supabase-schema.sql` **fica** — continua sendo a fonte do schema).
- Reescrever o CLAUDE.md para a nova arquitetura (novo mapa de módulos, mesmas regras de negócio).
- Marcar este documento como concluído, com um pós-mortem curto (o que divergiu do plano).

---

## 7. Como preservar 100% das regras de negócio existentes

1. **Port literal do motor de cálculo.** A seção 4 do `app.js` é traduzida função a função, mantendo nomes, ordem de condicionais e casos de borda (ex.: histórico vazio, imóvel sem data, mês sem meta). Tipos são adicionados; lógica não é tocada. Qualquer trecho que pareça "errado" durante o port: **não corrigir** — registrar em uma seção "Achados" neste documento e reproduzir igual.
2. **Testes de caracterização antes do port** (§9): os testes descrevem o que o código **antigo** faz (executando as funções antigas em Node quando possível, ou derivando os valores esperados manualmente do app antigo com o dataset de teste), e o código novo tem que passar neles.
3. **O contrato de dados não muda.** Mesmo shape de objeto, mesmos nomes de campo, mesmos mapeadores. Um imóvel salvo pelo app novo tem que ser aberto pelo app antigo sem nenhuma diferença — durante a migração os dois apps leem/escrevem o mesmo banco, então isso é diretamente verificável.
4. **Baseline numérico como contrato de aceitação.** Nenhuma view é dada como migrada enquanto todos os números não baterem com o baseline da Etapa 0, com os mesmos dados.
5. **As quatro superfícies do motor conferidas juntas.** Como Dashboard, Metas, Insights e Relatórios consomem o mesmo motor, qualquer divergência entre eles no app novo é sinal de erro de port — conferência cruzada obrigatória na Etapa 7.
6. **Semânticas sensíveis com teste dedicado**: `foiAngariado()` (registro criado ≠ angariado), stale (limiar exato de `STALE_DAYS_THRESHOLD`), coortes mensais por data de entrada no status (não por data de criação), saídas laterais fora do funil de conversão, deduplicação de entrada repetida no `statusHistory`.

---

## 8. Critérios de sucesso por etapa e checklist

### Critérios de sucesso

| Etapa | Critério de conclusão |
|---|---|
| 0 | Branch criada; dataset de teste cobrindo todos os status/cenários; baseline (screenshots + números) capturado e versionado junto deste documento |
| 1 | `next build` verde; página placeholder com CSS global aplicado; env vars funcionando |
| 2 | 100% do motor de cálculo portado; testes de caracterização passando; `tsc --noEmit` limpo; zero imports de React/Next no núcleo |
| 3 | Mapeadores com testes de ida-e-volta passando; `loadState()` popula o store com os mesmos dados que o app antigo exibe |
| 4 | Login, logout, cadastro e recuperação de senha funcionam; rota protegida redireciona; boot carrega estado |
| 5 | Cada view: todos os números/elementos batem com o baseline; navegação entre views sem erro de console e sem vazamento (Chart/Leaflet destruídos ao sair) |
| 6 | Cada mutação: efeito idêntico ao app antigo verificado no banco; `statusHistory` correto após qualquer mudança de status; caminho de falha reverte o estado e mostra toast |
| 7 | Checklist de paridade 100% verde; usuário final aprovou após uso real |
| 8 | Produção servindo o Next; `DEPLOY.md` atualizado; rollback documentado e testável |
| 9 | Código antigo removido; CLAUDE.md reescrito; pós-mortem registrado |

### Checklist padrão de TODA etapa

- [ ] Trecho correspondente do código antigo lido por completo antes de portar.
- [ ] Lógica portada literalmente (sem "melhorias" de comportamento).
- [ ] Strings de UI idênticas às atuais (pt-BR, mesmos textos de toast/labels/vazios).
- [ ] Datas somente via helpers ISO; nenhuma `new Date()` fora de `lib/datas.ts`.
- [ ] Nenhum `dangerouslySetInnerHTML`.
- [ ] Mutações (quando houver) com otimismo + rollback + toast de erro, incluindo teste manual do caminho de falha.
- [ ] `statusHistory` atualizado em toda mudança de status (quando houver).
- [ ] `tsc --noEmit`, ESLint e testes verdes; `next build` verde.
- [ ] Console do browser sem erros/warnings novos exercitando a funcionalidade.
- [ ] Comparação lado a lado com o app antigo (mesmos dados) feita e aprovada.
- [ ] Commit(s) seguindo §10; este documento atualizado se algo divergiu do plano.

### Checklist de paridade final (Etapa 7) — resumo

- [ ] Todos os KPIs do Dashboard = baseline.
- [ ] Funil: contagem por status idêntica; saídas laterais fora da conversão.
- [ ] Kanban e Lista mostram o mesmo conjunto filtrado; badges de stale nos mesmos cards.
- [ ] Metas: progresso do mês corrente e de meses passados idêntico.
- [ ] Insights: todas as métricas idênticas (tempo médio por etapa, motivos de perda, coortes…).
- [ ] Relatórios semanal e mensal: mesmos números; impressão legível como hoje.
- [ ] Mapa: mesmos pins; popup com mesmos dados.
- [ ] Agenda: mesmos itens, incluindo auto-gerados; concluir/excluir funciona.
- [ ] Criar imóvel → avançar status um a um até Locado → conferir `statusHistory` no banco e reflexo em todas as métricas.
- [ ] Marcar imóvel como Perdido com motivo → conferir métricas de perda.
- [ ] CEP lookup e geocoding funcionando no modal.
- [ ] Fluxo completo de recuperação de senha.
- [ ] Um registro criado no app novo abre perfeitamente no app antigo (e vice-versa).
- [ ] Sem erros de console em nenhuma view; navegação repetida entre views sem degradação (leak check).

---

## 9. Estratégia de testes e validação

Hoje não existe teste algum; a validação é manual no browser. A migração introduz três camadas:

1. **Testes de caracterização (unitários) — Vitest.** Cobrem o núcleo puro (Etapa 2) e os mapeadores (Etapa 3). São escritos **antes** do port, descrevendo o comportamento do código antigo — inclusive comportamentos estranhos. Fixtures: imóveis com histórico completo, histórico vazio, status repetido, datas na virada de mês/ano, valores nulos. Meta: o motor de cálculo inteiro coberto.
2. **Testes de componente/integração (seletivos).** Não é meta cobrir toda a UI; priorizar: montagem de cada view sem erro com o store populado, o fluxo do modal de imóvel (validação, push no `statusHistory`), e o rollback de mutação com Supabase mockado.
3. **Validação manual estruturada (a principal, como hoje).** O baseline da Etapa 0 + os checklists de §8, executados com o app antigo e o novo lado a lado sobre o mesmo banco. Toda etapa de view/mutação termina com essa comparação. Console do devtools limpo é critério de aceitação, como o CLAUDE.md já exige.

Regressão contínua: os testes rodam em cada commit (localmente e, se desejado, via GitHub Actions simples — `tsc && vitest && next build`). Qualquer divergência encontrada na validação manual vira um teste de caracterização novo antes de ser resolvida.

---

## 10. Estratégia de commits

- **Branch:** todo o trabalho em `migracao-next`; `main` continua refletindo o app em produção até o cutover (Etapa 8 é o merge).
- **Commits pequenos e temáticos, um assunto por commit**, sempre com o projeto compilando e os testes verdes. Nunca misturar port de lógica com criação de infra no mesmo commit.
- **Mensagens em pt-BR**, no padrão do histórico atual (imperativo, descritivo), prefixadas pela etapa. Exemplos:
  - `[migração][etapa-2] Porta helpers de data com testes de caracterização`
  - `[migração][etapa-5] Migra view Pipeline (modo Lista)`
  - `[migração][etapa-6] Modal de imóvel: mutação otimista com rollback`
- **Se um bug do app antigo for encontrado:** commit separado, claramente marcado (`[migração][achado] Reproduz comportamento X do app antigo`), com o comportamento **reproduzido**, não corrigido — correção só após a Etapa 7, em commit próprio fora do fluxo de paridade.
- **Nenhum commit altera arquivos do app antigo** até a Etapa 9.
- Cada etapa concluída ganha uma tag ou PR próprio (`migracao/etapa-2-nucleo`), facilitando bisect e rollback de etapa.

---

## 11. Riscos conhecidos e mitigações

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| 1 | Erro sutil no port do motor de cálculo (off-by-one em dias, borda de mês, histórico vazio) | KPIs errados sem ninguém notar | Testes de caracterização antes do port; baseline numérico; conferência cruzada das 4 views que consomem o motor |
| 2 | Quebra da invariante do `statusHistory` em algum caminho de mutação | Corrompe a base de todas as métricas, **nos dados reais** | Centralizar a mudança de status em UMA função no código novo (todos os fluxos passam por ela); teste dedicado; mutações validadas primeiro na conta de teste |
| 3 | Datas: `new Date()` do JS interpreta `YYYY-MM-DD` como UTC — risco de deslocar um dia em cálculos/exibição se o port trocar os helpers por `Date` cru | Métricas e badges de stale deslocados | Invariante §3.5; portar os helpers atuais literalmente; lint/grep proibindo `new Date(` fora de `lib/datas.ts` |
| 4 | Escape de HTML: na base antiga o perigo era esquecer `escapeHtml()`; na nova é usar `dangerouslySetInnerHTML` ao portar views que montam HTML rico | XSS | Proibição de `dangerouslySetInnerHTML` (checklist + regra ESLint) |
| 5 | Diferenças de versão CDN → npm (Chart.js/Leaflet mudam API e comportamento visual entre majors) | Gráficos/mapa quebrados ou diferentes | Fixar as mesmas versões major do CDN (registradas na Etapa 0); comparação visual por view |
| 6 | Leaflet/Chart.js × ciclo de vida do React (double-invoke do StrictMode, instância não destruída na troca de rota) | Mapa em branco, gráficos duplicados, leaks | Instanciar em `useEffect` com cleanup rigoroso (equivalente ao destroy do `renderCurrentView()`); testar navegação repetida; atenção ao `dynamic(..., { ssr: false })` para Leaflet |
| 7 | Supabase Auth no App Router (sessão, refresh, fluxo de recovery por URL) se comportar diferente do fluxo `onAuthStateChange` atual | Usuário deslogado, recovery quebrado | Manter auth 100% client-side como hoje (decisão §4); testar explicitamente o fluxo de recovery de ponta a ponta |
| 8 | Mutações do app novo, ainda com bug, escrevendo nos dados reais durante a migração | Perda/corrupção de dados do usuário | Mutações validadas primeiro em conta de teste; dados reais só leitura até a Etapa 7; backup/export das tabelas antes da Etapa 6 e do cutover |
| 9 | Escopo crescer ("já que estamos migrando, aproveita e…") | Migração eterna, paridade impossível de verificar | §2 e §4 são vinculantes; toda ideia nova vai para uma lista "pós-migração" neste documento |
| 10 | SSR renderizando componentes que dependem de `window` (Leaflet, Chart.js) | Build/runtime error | Views de dados como Client Components; imports dinâmicos sem SSR onde preciso |
| 11 | Regressão de comportamento não coberta pelo baseline (detalhe de UX não fotografado) | Usuário percebe diferença após cutover | Período de uso paralelo (Etapa 7) + app antigo acessível por 2 semanas após cutover; rollback = repontar a Vercel para o deploy estático |
| 12 | Impressão dos Relatórios (CSS de print) se comportar diferente no novo shell | Relatório impresso/PDF ilegível | Item explícito do checklist da view Relatórios: imprimir e comparar com o antigo |

---

## 12. Boas práticas específicas deste projeto

- **O `statusHistory` é sagrado.** Na base nova, criar um único ponto de passagem (ex.: `aplicarMudancaDeStatus(imovel, novoStatus)`) e fazer TODO fluxo de mudança de status — modal, kanban drag, qualquer atalho — passar por ele. No app antigo essa disciplina é por convenção; no novo, torne-a estrutural.
- **Núcleo de cálculo sem dependências.** `lib/calculo/` não importa React, Next, Supabase nem o store — só tipos e helpers de data. É o que permite testá-lo puro e garante que as 4 views nunca divirjam.
- **Espelhar o padrão `viewX()`/`afterRenderX()`** conscientemente: `viewX()` → JSX do componente; `afterRenderX()` → `useEffect` com cleanup. O cleanup do `useEffect` assume o papel que o `renderCurrentView()` tem hoje de destruir Chart/Leaflet — sem ele, o leak que o app antigo evita volta.
- **Espelhar o reset do `closeModal()`**: no app antigo, todo modal registra seu reset de estado em `closeModal()`; no novo, cada modal encapsula seu próprio estado e o descarta ao desmontar — verificar explicitamente que reabrir um modal nunca herda estado do uso anterior (é o bug que a convenção antiga previne).
- **Toda string nova em pt-BR**, incluindo mensagens de erro de validação e textos de teste visíveis.
- **Datas**: um único módulo `lib/datas.ts` com os helpers portados; regra de lint proibindo `new Date(` fora dele.
- **Supabase**: manter o padrão "um fetch total no login, escritas otimistas pontuais". Não introduzir subscriptions/realtime nem refetch automático durante a migração.
- **Nada de segredo no cliente além da anon key** — inclusive em API Routes futuras: se um dia existir uma rota server-side, é ela que pode ter service key, nunca código que chegue ao browser.
- **Novos dados user-scoped** (se surgirem pós-migração) seguem a regra de sempre: política RLS `auth.uid() = user_id` no `supabase-schema.sql` idempotente + par de mapeadores + tipos.

---

## 13. Definição de Pronto (Definition of Done)

Uma etapa só pode ser considerada **concluída** quando **todos** os itens abaixo estiverem satisfeitos — sem exceção e sem "concluo agora e fecho o resto depois":

- [ ] **Código implementado** — o escopo da etapa está inteiro, com a lógica portada literalmente do app antigo (§7).
- [ ] **Build sem erros** — `next build` verde e `tsc --noEmit` limpo.
- [ ] **ESLint limpo** — nenhum erro nem warning novo (inclui as regras específicas do projeto: proibição de `dangerouslySetInnerHTML` e de `new Date(` fora de `lib/datas.ts`).
- [ ] **Testes passando** — toda a suíte verde (testes de caracterização + integração seletiva), incluindo os testes novos escritos para esta etapa.
- [ ] **Comparação com o app antigo aprovada** — conferência lado a lado sobre o mesmo banco, com os números/elementos batendo com o baseline (Etapa 0) e o console do devtools sem erros.
- [ ] **Commit realizado** — commits pequenos e temáticos no padrão de §10, com o projeto compilando e os testes verdes em cada um.
- [ ] **Documento atualizado (se necessário)** — este `MIGRATION_NEXT.md` reflete qualquer desvio do plano, achado (`[migração][achado]`) ou decisão tomada durante a etapa.

Esta Definição de Pronto é transversal a **todas** as etapas (0–9) e se soma aos critérios de sucesso específicos de cada etapa (§8). Se qualquer item acima estiver aberto, a etapa **não** está pronta e a etapa seguinte **não** começa.

---

## 14. Como evitar regressões — resumo executivo

1. **Oráculo vivo:** o app antigo roda intocado, sobre o mesmo banco, até o fim — toda dúvida de comportamento se resolve olhando para ele, não para memória ou suposição.
2. **Baseline numérico congelado** antes de qualquer código (Etapa 0) — paridade é um critério objetivo, não uma impressão.
3. **Testes de caracterização** escritos contra o comportamento antigo, antes do port, cobrindo todo o motor de cálculo e os mapeadores.
4. **Port literal, melhorias depois:** durante a migração o objetivo é ser idêntico, inclusive nos defeitos; a lista de melhorias e correções espera a paridade.
5. **Ordem de risco crescente:** primeiro código puro testável, depois leitura, por último escrita — mutações (o único ponto capaz de corromper dados) chegam quando toda a base já foi validada.
6. **Dados reais protegidos:** conta de teste para mutações, backup antes das etapas de escrita e do cutover, rollback simples (repontar a Vercel para o deploy estático).
7. **Checklists obrigatórios por etapa** (§8) — nenhuma etapa "está pronta" por sensação; está pronta quando a lista fecha.

---

*Documento criado em 2026-07-09. Manter atualizado a cada etapa concluída ou desvio de plano.*
