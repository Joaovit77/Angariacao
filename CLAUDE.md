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
- **`calculo/agenda.ts` → `separarPorHorario`** — parte o dia em **dois modos de trabalho**:
  `comHora` (faixa cronológica) e `semHora` (checklist do dia). Misturados, a visita das 10h vira
  mais uma linha no meio de sete follow-ups, e a lista de tarefas ganha uma ordem que não significa
  nada. Os rótulos dos blocos só aparecem quando existem os DOIS — com um tipo só, seriam ruído.
  Hora vazia, `null` e `"  "` caem todas em `semHora`: o modal grava `null`, mas dado antigo tem
  `""`, e um item sem horário na faixa cronológica é uma linha fantasma.
- **`calculo/canais.ts` · `abordagens.ts`** — features da pós-migração (sem oráculo do app antigo),
  os **dois eixos da captação**: `canais` mede a ORIGEM do imóvel (onde a oportunidade foi achada);
  `abordagens` mede o ROTEIRO usado no contato (o que se diz). Não confundir com a
  `formaAbordagem` do imóvel, que é o CANAL. Ver "Abordagens e tentativas" abaixo.
- **`calculo/followup.ts`** — elegibilidade e texto do follow-up em lote (os freios que impedem
  o disparo em rajada). A fila que executa é `filaFollowUp.ts`. Ver "Follow-up em lote" abaixo.
- **`calculo/gamificacao.ts` · `celebracao.ts`** — o reconhecimento do progresso, em dois recortes
  que não se misturam: `gamificacao` são as **medalhas** (o acumulado, consultável a qualquer hora
  na view de Metas); `celebracao` é o **instante** — o card de parabéns que aparece quando um imóvel
  chega em "Angariado" ou quando a meta do mês fecha, e some depois. Ambos derivam do
  `statusHistory` e das metas já persistidas: **nenhum estado novo no banco**. A regra da
  `celebracao` é comemorar o **cruzamento**, nunca o estado — reeditar um imóvel que já era
  angariado não recomemora, senão corrigir um telefone jogaria confete na tela e o parabéns viraria
  ruído. Quem dispara é o `salvarImovel`; o card mora em `components/painel/Celebracao.tsx` e no
  store `lib/celebracao.ts`, **fora do `uiModal`** — o salvamento termina fechando o modal, e no
  mesmo store esse `fecharModal()` apagaria a festa no instante em que ela nasce.
- **`calculo/desdobramento.ts`** — um espaço captado que vira várias unidades (o galpão que o
  proprietário aceita dividir em salas). Ver "Desdobramento" abaixo.
- **`calculo/temperatura.ts`** — o **termômetro do proprietário**: de quem correr atrás hoje,
  do que já está na carteira. É a outra metade da manhã que o `planoDia` não responde (aquele diz
  ONDE prospectar; este, QUEM chamar). Ordena por **faixa** de sinal — compromisso vencido >
  agendou > vai retornar > respondeu > lead nunca contatado —, e cada linha carrega o
  `motivo` já escrito: faixa explicável, e não nota contínua, porque uma ordem em que o corretor
  não consegue concordar com o critério vira uma lista que ele para de ler.
  **Não há faixa de "imóvel parado", e tirá-la foi a correção mais importante daqui.** Ela existia
  e, na carteira real, 7 das 8 linhas viraram "parado há 11 dias" — os mesmos imóveis do card
  "Imóveis parados" logo abaixo, na mesma ordem, enterrando a única linha de calor de verdade. A
  causa é estrutural: em captação a esmagadora maioria dos contatos fica sem resposta, então a
  faixa mais fraca é sempre a mais populosa e sempre vence no volume. Estagnação já tem card
  próprio; **enviado e sem reação é espera, não calor** — quem cobra isso é o follow-up em lote e
  o nudge de resultados pendentes.
  Duas regras que caem daí: **quem foi contatado hoje sai inteiro** (a lista não manda cutucar de
  novo alguém com quem você acabou de falar — e o corte tem que vir antes das faixas, senão quem
  respondeu hoje reaparece como "parado há 8 dias", já que o status não muda quando o proprietário
  responde); e **quem já foi captado** (Angariado/Publicado) só entra por compromisso marcado, porque
  a cobrança dessa fase é o lembrete de disponibilidade, não esta lista.
  O sinal mais forte já estava no banco e ninguém consumia: quando o proprietário diz "me chama
  semana que vem", o webhook grava em `sugestaoIa.retomarEm` — e até aqui isso só era *exibido* na
  lista de pendências, sem nada avisar no dia marcado.
- **`calculo/mapa.ts`** — em qual dos quatro baldes de cor cada imóvel cai no mapa
  (`categoriaMapa`: locado / angariado / andamento / sem-sucesso) e as cores/rótulos da legenda
  (`CATEGORIAS_MAPA`). Fonte única: o pino (`MapaLeaflet`) e a legenda-filtro (`MapaView`) leem
  daqui. A prioridade é por **desfecho atual**, não por histórico — angariado-e-depois-perdido é
  "sem sucesso", não captação viva; "angariado" fica para o captado que segue na carteira sem locar.
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

### Desdobramento: carteira ≠ captação

O proprietário aceita angariar o galpão **e** dividi-lo em salas comerciais. São quatro anúncios e
até quatro contratos, mas **uma** conversa ganha — e os cenários são parcialmente excludentes
(locou o galpão inteiro, não há salas). O sistema separa os dois eixos com um campo só,
`imovel.imovelPrincipalId`:

- **Carteira** — a unidade é uma linha inteira, com aluguel, contrato, comissão e locação próprios.
  Sem isso o dinheiro não fecha: `valorAluguel` é um campo só por imóvel.
- **Captação** — a unidade **não** conta. O corte mora nas quatro funções de esforço de
  `calculo/motor.ts` (`imoveisAngariadosNoMes/Periodo`, `imoveisContatadosNoMes/Periodo`), que
  filtram por `imoveisDeCaptacao`. Num lugar só, porque é delas que descendem o KPI, a meta, as
  coortes e o relatório — e é o que mantém as quatro views concordando.

Consequência deliberada: **a meta de angariação passa a significar "negociações ganhas"**. Quantas
unidades saem de cada uma é decisão do proprietário, não trabalho do corretor.

Regras ao mexer:

- **Só desdobra depois de angariado** (`motivoNaoPodeDesdobrar`). Antes disso as unidades seriam
  imóveis que talvez nunca existam — e imóvel que não existe não fica quieto: entra no pipeline,
  dispara `isStale` cobrando o corretor por imóvel parado, empilha no mapa e entra na fila do
  follow-up. Quem desdobra é quem já tem interessado numa sala.
- **A unidade herda o `statusHistory`, não as tentativas.** O histórico de status é copiado porque
  ela É a mesma captação (e faz `tempoAteLocacao` medir o negócio inteiro); as tentativas ficam no
  principal, porque duplicá-las faria uma mensagem enviada valer por quatro no ranking de
  abordagens — o viés exato que `calculo/abordagens.ts` existe para não ter.
- **Unidade nunca nasce "Locado"**, nem quando o principal está: somaria à conversão, ao
  faturamento e à comissão do mês um contrato que não existiu.
- **O vínculo não vira corrente** — não se desdobra uma unidade. Com dois níveis, "de quem é esta
  captação?" deixaria de ter resposta única, que é a pergunta inteira que o campo responde.
- No banco, `on delete set null` (não cascade): excluir o galpão não pode levar junto salas com
  contrato ativo.

### Abordagens e tentativas

Mesma ideia do `statusHistory`, aplicada à captação: a verdade mora no **histórico de tentativas**,
não num campo único do imóvel.

- **Abordagem** é o **roteiro** — o que se diz ao proprietário ("ofereço avaliação gratuita").
  Vive na tabela `abordagens` (catálogo por usuário). **Não confundir** com `imovel.formaAbordagem`,
  que é o **canal** (WhatsApp, ligação, visita). São eixos independentes: o mesmo roteiro roda em
  canais diferentes.
- **Tentativa** é um contato feito. Fica em `imoveis.tentativas` (`jsonb`, como `notas` e
  `status_history`), com `{ abordagemId, canal, resultado, data, observacao }`.
- **O canal não se pergunta duas vezes.** `imovel.formaAbordagem` é derivado do histórico, não
  chutado num seletor: `registrarTentativa` o preenche com o canal da tentativa quando o campo está
  **vazio**, e o ModalImovel cai em `canalObservado()` (a primeira tentativa com canal) antes de
  oferecer "Não informado". Nenhum campo do cadastro nasce no primeiro item da lista — um padrão
  fixo dizia "Ligação telefônica" logo depois de um WhatsApp enviado pelo próprio painel, e o
  palpite ia direto para os insights por forma de abordagem. Mesma regra para `origemImovel`, que
  alimenta o ranking de canais.

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

#### De onde vêm as tentativas (e por que isso quase matou o ranking)

Por muito tempo a tentativa **só** entrava por registro manual, no ModalTentativas. O caminho real
de envio — o ModalWhatsapp — mandava a mensagem e não registrava nada, então o ranking media apenas
o que alguém lembrasse de anotar depois. Na prática, quase nada.

Hoje há três origens, e a diferença entre elas é o que mantém o ranking honesto:

- **Manual** (ModalTentativas) — o corretor afirma o que aconteceu. É a única em que o `resultado`
  é uma observação de verdade no instante em que é gravado.
- **Envio por abordagem** (ModalWhatsapp, grupo "Abordagens sugeridas por IA" do seletor) — registra
  sozinho, creditando a abordagem escolhida. É o elo que liga o que se FAZ ao que se MEDE.
- **Envio por modelo de captação** (ModalWhatsapp, modelo próprio do corretor ou modelo do sistema
  listado em `MODELOS_CAPTACAO`) — registra sem creditar ninguém no ranking.
- **Follow-up em lote** — idem, uma por imóvel da fila.

Três regras que caem daí:

- **Só registra com envio confirmado** pela Evolution. Registrar antes criaria tentativa fantasma
  toda vez que o número não tivesse WhatsApp, e o ranking mediria mensagem que nunca saiu. O `wa.me`
  não tem essa confirmação — ele só abre a conversa, quem aperta enviar é a pessoa —, então ali o
  app **pergunta**: ao voltar do link, o rodapé do ModalWhatsapp vira "você chegou a mandar a
  mensagem?", e só o "sim" grava. A resposta é afirmação do corretor, do mesmo tipo da tentativa
  anotada à mão; o que não pode é o app afirmar sozinho. O critério de o que se registra é o
  mesmo dos dois lados (`registraTentativa`) — o histórico não deve depender de por onde a
  mensagem saiu.
  > Até 21/07/2026 o `wa.me` era o único caminho de envio e não registrava nada. É por isso que
  > não existe tentativa nenhuma no banco antes dessa data: o histórico anterior foi reconstruído
  > por backfill (assinado na `observacao`), não observado.
- **Registrar ≠ creditar.** Registram tentativa: abordagem do catálogo, **modelo próprio do
  corretor** (`user_config.whatsapp_modelos`), **modelo do sistema que é contato de captação**
  (`MODELOS_CAPTACAO` em `calculo/whatsapp.ts`) e follow-up em lote. Ficam de fora os modelos
  operacionais — "imóvel locado", "confirmação de visita", cobrança de documentação, divulgação:
  tratam de um passo já combinado, não buscam o sim do proprietário.
  Mas só a **abordagem** entra no ranking: ela tem id estável e se arquiva em vez de ser
  excluída, então as séries continuam comparáveis. Os modelos gravam `abordagemId: null` +
  `modeloNome` (por VALOR, não por id — modelo tem botão de apagar, e guardar o id deixaria o
  histórico órfão). Aparecem no histórico, no resumo e no nudge; no ranking, não.
  O motivo de registrá-los apesar disso é o webhook: sem tentativa não há o que fechar quando a
  resposta do proprietário chega.
  > A classificação já foi por GRUPO ("modelo do sistema não registra"), e o balde misturava
  > "primeiro contato" e "retomada" com "imóvel locado". O caminho mais usado do app — o botão 💬
  > do Pipeline, que abre um modelo do sistema — não registrava nada: carteira inteira com zero
  > tentativas e ranking cego. Não volte a classificar por grupo.
- **`aguardandoResultado` separa palpite de fato.** No instante do envio ninguém sabe o desfecho,
  então a tentativa automática nasce `"sem-resposta"` **marcada**. Sem alguém confirmando depois,
  toda `taxaResposta` tenderia a zero e o ranking diria "nenhum roteiro funciona" quando o que
  faltou foi anotação. O nudge (`resultadosPendentes` + `ModalResultadosPendentes` + o chip no
  Pipeline) existe só para cobrar essa confirmação, e cobra por `DIAS_COBRANCA_RESULTADO` dias —
  passado o prazo, "não respondeu" é quase certamente verdade. A tentativa **manual não leva a
  marca** e nunca é cobrada: ali o "sem resposta" é afirmação do corretor, não chute do sistema.

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

**São DOIS lotes, uma máquina só.** Além do seguimento de "Sem resposta", há a **confirmação de
disponibilidade** (`selecionarVerificacaoDisponibilidade` + `ModalConfirmarDisponibilidade`):
imóveis já **angariados/publicados** há tempo, perguntando se ainda estão disponíveis — a versão
em LOTE do lembrete individual de "verificar disponibilidade" (ver `ModalVerificacao` / a agenda).
Os dois lotes compartilham a fila, os freios anti-spam abaixo, o relatório de falhas e o **teto do
dia** (mesma instância, mesma conta — o que protege o número é o total de envios, não o tipo). O
que muda no lote de disponibilidade:

- **Alvo e cadência longos.** Público é `DISPONIBILIDADE_STATUS_ALVO` (Angariado/Publicado) parado
  há ≥ `VERIFICACAO_DISPONIBILIDADE_DIAS` (60) dias desde a angariação. E a janela de recência é os
  mesmos 60 dias, não os 14 do seguimento: confirmar disponibilidade é cutucada de ciclo longo.
- **Sem corte de "tentativas demais".** Um imóvel anunciado um ano é perguntado várias vezes de
  propósito; quem segura a insistência é a janela de recência, não uma contagem.
- **Sem seletor de abordagem.** Não é roteiro de captação e não entra no ranking — a tentativa nasce
  com `abordagemId: null` + `modeloNome: "Confirmar disponibilidade"` (aparece no histórico e no
  nudge, nunca no ranking). O texto padrão é o modelo do sistema `confirmacao-disponibilidade`.
- **Dá baixa e reagenda o lembrete.** Cada envio confirmado chama `registrarConfirmacaoDisponibilidade`
  (via o `aposEnvioOk` da fila): marca como feito qualquer lembrete "Verificar disponibilidade"
  pendente do imóvel e agenda o próximo para +60 dias. Sem isso, o lote e o lembrete da agenda
  cutucariam o mesmo proprietário pelos dois caminhos.

O desenho é governado por um risco que **não é de software**: disparar mensagens em rajada pela
mesma instância derruba o número da imobiliária, e o público aqui é o pior possível para o detector
de spam — gente que já não respondeu. Os freios não são preferência de UX:

- **O lote nunca vira rajada.** 10 por rodada, 20 por dia, envio sequencial com intervalo
  **sorteado** entre 30 e 60s (cadência exata de N em N segundos é assinatura de bot). Mexer nesses
  números é mexer na chance de o número ser banido, não em conforto.
- **Os cortes saem das tentativas, não de campo novo.** "Falou há menos de 14 dias" e "já acumulou
  4 tentativas" são lidos do histórico que já existe — mesma leitura do ranking de abordagens.
  Nenhuma coluna, nenhuma migração, nenhuma política RLS a mais.
- **Uma mensagem por PROPRIETÁRIO, não por imóvel.** Quem tem quatro imóveis parados em "Sem
  resposta" — o galpão desdobrado em salas, os três apartamentos anunciados de uma vez — levaria
  quatro mensagens quase iguais no mesmo número em três minutos, que é assinatura de bot. Nenhum
  dos outros freios pega esse caso, por um detalhe fácil de não ver: **todos leem as tentativas
  daquele imóvel**, e quatro imóveis têm quatro históricos limpos. O corte roda depois da
  ordenação (fica quem espera há mais tempo), casa os telefones pela forma canônica de
  `telefoneCanonico` — a mesma do webhook, senão o mesmo número com e sem o nono dígito passaria
  por duas pessoas — e os demais voltam na rodada seguinte.
- **Um seletor só, o de abordagem.** Ela é ao mesmo tempo o texto que sai (o `roteiro`) e o
  `abordagemId` que fica registrado na tentativa. Dois seletores permitiriam divergir "o que eu
  disse" de "o que eu anotei que disse", e o ranking passaria a medir ficção.
- **O texto base é um MOLDE**, com `{nome}`/`{endereco}` — nunca a mensagem já preenchida de um
  proprietário, senão as outras nove sairiam com o nome errado. Sem `{nome}` o modal avisa: as
  mensagens sairiam idênticas, que é a assinatura de spam mais forte que existe.
- **Falha de ambiente encerra a fila** (`falhaEncerraLote`): instância caída ou token recusado vai
  falhar igual nos nove seguintes. Falha do contato da vez (`sem-whatsapp`, número inválido) não
  interrompe — não diz nada sobre o próximo.
- **O que falhou fica na tela.** Ao fim do lote o indicador vira relatório (`resumoAberto`), com
  nome, motivo e ação por imóvel. Antes o motivo era coletado e jogado fora: via-se "1 falhou" e a
  fila era zerada na rodada seguinte, então o telefone errado de um proprietário nunca aparecia — e
  o imóvel voltava para a fila do dia seguinte com o mesmo número. As ações (corrigir telefone,
  dar como Perdido por `MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO`) só aparecem quando `falhaEhDoNumero`:
  Evolution fora do ar não diz nada sobre o proprietário, e encerrar o imóvel ali seria dá-lo como
  perdido por um mau minuto do nosso servidor. Como no nudge, **pergunta antes** — número errado
  não é sinônimo de negócio perdido.

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

### As rotas de servidor: `api/whatsapp/enviar`, `api/whatsapp/webhook` e `api/ia`

São as **três** exceções ao "sem servidor", e existem pelo mesmo motivo: guardam um segredo que não
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
- **O número de saída é do CORRETOR, não do deploy.** Nome da instância e token vêm da tabela
  `whatsapp_instancias` (uma linha por conta), lida com a service role — aquela tabela não tem
  política de leitura, porque o token é segredo. Só `EVOLUTION_SERVER_URL` continua sendo env var,
  e nenhuma delas leva `NEXT_PUBLIC_`. Sem linha na tabela a rota **recusa** (`sem-instancia`) em
  vez de cair num padrão: com vários corretores, o padrão é sempre o número de outra pessoa — e a
  resposta do proprietário voltaria para a caixa errada.

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

#### `api/whatsapp/webhook` — a resposta do proprietário chegando

A única rota que inverte o sentido: as outras o app chama, esta a **Evolution** chama quando uma
mensagem chega no número do corretor. É o que fecha o buraco que o `aguardandoResultado` tapava na
marra — antes o app enviava e ficava cego, e o desfecho dependia de alguém lembrar de anotar.

As partes puras vivem em `lib/calculo/webhookWhatsapp.ts`; a rota só aplica.

**O filtro é o coração dela.** O número é o da imobiliária: por ele passa proprietário, mas também
colega, cliente e grupo. O evento não diz quem é quem — quem diz é a carteira do corretor. Daí a
cadeia, em que cada etapa só existe para descartar:

```
segredo → é mensagem recebida? → de qual corretor (instância)?
       → esse telefone é de algum imóvel DELE? → só então interessa
```

Regras ao mexer nela:

- **Não tem sessão de usuário**, então a autenticação é um segredo próprio
  (`EVOLUTION_WEBHOOK_SECRET`, por header **ou** no fim da URL — nem toda instalação da Evolution
  deixa configurar header). Ele protege o sentido contrário do usual: não esconde nada de quem
  hospeda a Evolution, e sim impede que qualquer um **poste** aqui forjando "o proprietário
  respondeu", o que envenenaria o ranking.
- **O `user_id` nasce do nome da instância**, nunca da requisição (ver "Modelo de RLS").
- **O telefone é casado por forma canônica**, e `telefoneCanonico()` é **gêmea** da função SQL
  `telefone_canonico()`. Divergir uma da outra faz o casamento falhar **em silêncio** — sem erro,
  sem log, só respostas que nunca acham o imóvel. Os testes rodam a mesma tabela de casos.
- **Idempotência sem tabela nova:** o id da nota é `wa:<id da mensagem>`, e
  `registrar_nota_whatsapp` faz checagem de duplicata e append numa instrução só. Isso resolve os
  dois problemas juntos — a reentrega da Evolution e a **rajada** (no WhatsApp as pessoas mandam
  três mensagens curtas, e um read-modify-write perderia notas sem dar erro).
- **A IA sugere o desfecho, o corretor confirma** (`sugerirNaTentativaPendente` mantém a marca de
  pendente). Ela lê uma frase solta, sem o resto da conversa.
- **A agenda inteligente.** "Pode ser quinta às 10h" É um compromisso, e o webhook o cria
  (`compromissoDaResposta` + a inserção na rota). Antes a data ficava só em
  `sugestaoIa.retomarEm`, exibida numa lista de pendências que ninguém abre — o corretor tinha
  horário marcado pelo próprio proprietário e nada o avisava no dia. É escrita automática como o
  encerramento, mas **barata de errar**: compromisso errado custa um clique para apagar, enquanto
  encerramento errado tira um imóvel bom da carteira — por isso as travas são menores. As que
  existem: **sem data não cria** (inventar um dia faz ligar no dia errado); **data no passado não
  cria** (é leitura errada); **imóvel encerrado não ganha compromisso** (marcar retorno para quem
  acabou de dizer que já alugou); **um pendente por imóvel/dia** — a reentrega do mesmo evento já
  para na `registrar_nota_whatsapp`, mas no WhatsApp as pessoas mandam três mensagens curtas
  ("pode quinta", "às 10h", "combinado") e cada uma é um evento diferente com a mesma data. E a
  nota do compromisso **diz de onde ele veio**, com a frase do proprietário: compromisso que
  aparece sozinho e não se explica é compromisso que o corretor apaga por desconfiança.
  A `horaRetomar` entrou junto no esquema da classificação — é ela que separa "te ligo quinta"
  de "quinta às 10h", e só com hora o item cai na faixa de horários da agenda.
- **A exceção:** encerramento automático. Quando a resposta não deixa nada a fazer ("já aluguei",
  "já estou com outra imobiliária"), o imóvel vai para **Perdido** com o motivo, sem clique. O que
  segura isso é o motivo sair de uma lista fechada e **menor** que `MOTIVOS_PERDA`
  (`MOTIVOS_PERDA_IA`, sem os que exigem julgamento), só valer junto de `recusou`, e uma segunda
  nota explicar na tela por que o status mudou — senão o imóvel sairia da carteira e a única
  explicação estaria no log do servidor. **Nunca vira "Locado":** "já aluguei por conta própria" é
  PERDA, e marcá-lo como ganho somaria à conversão, à comissão e à meta do mês um negócio que não
  existiu.

#### `api/ia` — sugestão de roteiros, leitura do ranking e captura de anúncio (OpenAI)

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

##### A captura em 1 toque (`tipo: "extrair-anuncio"`)

O garimpo do corretor. Foto da placa de "aluga-se", print do anúncio ou texto colado entram no
`ModalPreCadastro` e saem como campos preenchidos — daí ele confere, salva, e o WhatsApp já abre.
O gargalo do garimpo nunca foi *achar* o imóvel: foi o telefone (que a placa mostra e o portal
esconde, às vezes ofuscado por extenso) e o tempo entre ver o anúncio e mandar a mensagem.

> Isto **não** reabre o scraping de portais, descartado em 2026-07-10 (`RADAR_CAPTACAO.md`): não há
> busca automatizada, não há chat automatizado, e quem aponta a câmera ou cola o texto é a pessoa.

Três coisas a saber ao mexer:

- **É a única chamada em que o browser manda CONTEÚDO** (a imagem/texto), e não um contexto curto e
  tipado — desvio consciente da regra "o prompt é montado no servidor". O que o segura: prompt e
  esquema continuam do servidor, a saída é objeto **fechado** (enums de `TIPOS_IMOVEL`/
  `ORIGENS_IMOVEL` + `additionalProperties: false`, não texto livre), o acesso já passa por
  `podeUsarIa`, e `MAX_TEXTO_ANUNCIO`/`MAX_IMAGEM_BYTES` limitam o custo por chamada. Não é proxy
  de LLM aberto — é um extrator de campos.
- **A IA preenche, o corretor confirma** — nada salva sozinho, mesma regra do webhook. Modelo de
  visão troca dígito com naturalidade, e um telefone errado gravado sem revisão vira mensagem para
  um estranho. Por isso o prompt manda devolver `null` em vez de telefone "quase certo", e a
  `confianca` existe para a UI pedir conferência quando a foto sai ruim.
- **`lib/imagem.ts` reduz a foto antes de enviar.** Não é otimização: foto de celular atual sai com
  3–8 MB, acima do teto — sem reduzir, o caminho principal da feature (apontar a câmera para a
  placa) falharia quase sempre, e o corretor não tem como "mandar uma foto menor".

**A unidade é identidade, e a mensagem precisa dela.** `enderecoComUnidade()` em
`calculo/whatsapp.ts` é a fonte única que compõe "rua, número, ap X, bloco Y" — usada pela
referência curta (`{imovel}`), pelo marcador `{endereco}` dos modelos do corretor e pela
confirmação de endereço, para as três não divergirem. Sem ela, quem tem apartamento recebia uma
mensagem sobre "o imóvel na Rua X, 250" — o endereço do PRÉDIO, que não diz nada a quem mora no
806 e menos ainda a quem tem duas unidades ali. Dois detalhes que parecem enfeite e não são:
o prefixo respeita o tipo (sala comercial não é "ap") e não duplica quando o corretor já digitou
"ap 806"; e **`tokenizarModeloUsuario` troca o endereço COMPOSTO antes do simples** — na ordem
inversa, salvar um modelo gravaria `{endereco}, ap 806` e o apartamento daquele proprietário
viajaria para todos os contatos seguintes.

Três correções que vieram junto, no `ModalPreCadastro`, e valem por si. Ele agora tem
**`unidade`/`bloco`/`edificio`** — que num modal de cadastro *mínimo* parecem excesso, mas são a
identidade do imóvel: sem eles dois apartamentos vizinhos caem na mesma chave de duplicidade e o
cadastro acusa falso a cada unidade nova (e prédio é a maior parte do garimpo). Grava
**`origemImovel`** (não gravava nenhuma — e como `planoDia`/`canais` pulam imóvel sem origem, tudo
que entrava pelo cadastro rápido ficava invisível no Foco do dia e no ranking de canais, justamente
para quem só trabalha por garimpo). E checa **duplicidade de endereço** (checava só código repetido;
garimpo produz duplicata o tempo todo — a mesma placa fotografada duas vezes, o mesmo anúncio visto
na OLX e no Marketplace). Como no `ModalImovel`, o aviso de duplicata **avisa, não bloqueia**.

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
- **Sem segredo no cliente além da anon key.** Segredo mora em API Route (é o caso da
  `EVOLUTION_SERVER_URL`/`EVOLUTION_WEBHOOK_SECRET`, da `OPENAI_API_KEY` e da
  `SUPABASE_SERVICE_ROLE_KEY`); código que chega ao browser, nunca. Na prática: variável com
  `NEXT_PUBLIC_` é pública — se é segredo, não leva o prefixo.
- **A service role é a exceção mais perigosa do projeto.** Ela ignora a RLS por completo, e por
  isso só existe em duas rotas de servidor (`api/whatsapp/webhook` e `api/whatsapp/enviar`), lida
  dentro do próprio arquivo e nunca exportada de módulo compartilhado — de onde vazaria para outra
  rota por descuido. A regra que a segura: **o `user_id` nunca vem da requisição**. No webhook ele
  nasce do nome da instância em `whatsapp_instancias`; no envio, de `auth.getUser()`. Toda consulta
  feita com ela é filtrada por esse id.

## Ao trabalhar aqui

Depois de qualquer mudança: `npm test`, `npx tsc --noEmit`, `npm run lint` e `npm run build` verdes,
e validar exercitando a UI no browser com o console limpo. Para mudanças de cálculo/KPIs, conferir
que Dashboard, Metas, Insights e Relatórios continuam concordando entre si (divergência entre eles é
sinal de bug) e comparar com o [BASELINE_ETAPA0.md](BASELINE_ETAPA0.md) — que é também um teste
executável (`web/tests/baseline-etapa0.test.ts`).
