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

- **`web/app/`** — App Router. `layout.tsx` (raiz: monta `SessaoProvider` + `Toasts` + o
  `AplicadorTema` e o script inline do tema, importa o CSS
  do Leaflet e o `style.css`), `page.tsx` (tela de acesso e queda do link de recuperação de senha),
  e o grupo **`(painel)/`** com o shell autenticado (`layout.tsx`) e uma rota por view
  (`dashboard`, `pipeline`, `metas`, `agenda`, `insights`, `mapa`, `relatorios`, `roadmap`).
  **`app/api/whatsapp/enviar/route.ts`** e **`app/api/ia/route.ts`** são as duas rotas de servidor
  do projeto — ambas existem só porque guardam um segredo (ver abaixo).
- **`web/app/style.css`** — o CSS do app antigo, dirigido por custom properties em `:root`. Não
  houve redesign: classes e paleta escura seguem as do app estático. As duas mudanças estruturais
  vieram com o **tema claro** — a paleta ganhou um segundo conjunto de valores e as cores que
  estavam escritas à mão no meio das regras (sombra, borda de acento, cor de status) viraram
  token, porque literal no meio da folha só serve a um tema. Ver "Cor sempre por token" nas
  convenções.
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
- **`calculo/motor.ts` → `isStale` / `diasSemMovimento`** — **"parado" é ausência de MOVIMENTO,
  não de mudança de status.** `isStale` contava dias desde a última transição do funil, e isso
  bastava enquanto o app era cego para o que acontecia entre uma etapa e outra. Deixou de bastar
  com as tentativas registradas e as respostas chegando pelo webhook: **nada move o status
  sozinho** (a mesma causa que levou "Novo contato" para `FOLLOWUP_STATUS_ALVO`), então um imóvel
  levava follow-up ontem, o proprietário respondia hoje, e o card seguia cobrando "parado há 14
  dias". Foi caso real — o LD-55 em 28/07/2026, em que o filho passou o telefone do pai e o pai
  confirmou ser o proprietário, tudo gravado, e a tela ignorando os dois. Na carteira daquele dia,
  **11 dos 46 marcados como parados tinham tido contato** depois da última mudança de status; 2
  tinham resposta do próprio proprietário. Movimento são as **três** coisas que o app sabe datar —
  mudança de status, tentativa e resposta —, porque cada uma tapa o buraco das outras: o corretor
  que trabalha o lead sem mexer na etapa, e o proprietário que reage sem ninguém confirmar nada.
  Fora ficam a nota escrita à mão (não distingue ação de lembrete — quem registra ação é a
  tentativa) e a nota do **encerramento automático**, que nasce com o mesmo prefixo `wa:` e é o app
  falando, não o proprietário. **O funil não mudou**: `daysInCurrentStatus`, coortes e tempo médio
  seguem medindo etapa, que é a pergunta deles. Quem exibe a palavra "parado" tem que exibir
  `diasSemMovimento` junto — o número que marcou o selo; com dias no status, a linha diria "parado
  há 20 dias" sobre quem respondeu ontem.
- **`calculo/motor.ts` → `conversaoCaptacao`** — as **duas taxas do painel**, e por que são duas.
  `metricsForRange` mede LOCAÇÃO (locados ÷ processos fechados): é a régua do dinheiro, e continua
  valendo. Só que o trabalho medido aqui termina uma etapa antes — no "sim" do proprietário —, e
  medir só locação num painel de captação erra duas vezes: a amostra fica minúscula (locação é o fim
  de um funil longo; na carteira real, 0 locações contra 8 angariações) e a atribuição fica errada
  (imóvel captado que não aluga por causa do preço não diz nada sobre a qualidade da captação). Por
  isso `conversaoCaptacao` tem a **mesma forma** da outra — taxa sobre desfechos DECIDIDOS, nunca
  sobre a carteira toda —, senão as duas não seriam comparáveis e esta despencaria a cada dia de
  prospecção bem-feita, já que lead em aberto não é derrota. Três regras que caem do invariante do
  `statusHistory`: **angariado-e-depois-perdido conta como angariado** (a captação foi ganha; a perda
  veio em outra etapa); **quem está em jogo fica fora da taxa** (é pendência, não fracasso); e é o
  **único lugar do motor que não pergunta só ao `foiAngariado`** — "Locado" conta como captação ganha
  mesmo sem a etapa no histórico, porque não se aluga o que não se captou, e sem a ressalva o
  desfecho mais positivo que existe cairia em "ainda em disputa". `imoveisAngariadosNoMes` segue
  exigindo a entrada no histórico, e deve: lá a pergunta é em que MÊS, e sem data não há resposta.
- **`calculo/projecao.ts`** — o eixo do **TEMPO** na meta. O card de meta sabia dividir e subtrair,
  mas não sabia que existe calendário: no dia 3 do mês dizia o mesmo que no dia 28, e "faltam 4" é
  tranquilidade no começo e emergência no fim. Responde as duas perguntas reais ("no meu ritmo, dá?"
  e "quanto por dia?"). O ritmo é medido em dias **úteis**, não corridos — captação é trabalho de
  horário comercial, e dividir por dias corridos mandaria o corretor trabalhar sábado. **Sem meta
  não há projeção** (projetar contra zero acusaria "meta atingida" em todo card vazio), e mês
  encerrado não projeta. Não conhece feriado, de propósito: feriado municipal varia por cidade e
  inventar um calendário seria pior que ignorá-lo — a consequência (projeção levemente otimista em
  semana de feriado) está assumida. Na UI, o total da projeção usa **piso, não arredondamento**:
  9,6 contra meta 10 viraria "o mês fecha em 10" num card marcado em amarelo por não bater a meta,
  com o texto contradizendo a cor.
- **`calculo/transcricao.ts`** (+ `app/api/whatsapp/_transcricao.ts`, que não é rota) — o áudio do
  proprietário vira TEXTO. O webhook gravava `[áudio]`, e `ehSoMidia` ainda os tirava das pendências
  da caixa — honesto (não havia o que ler) e cego: eram **43 das 149 respostas** da carteira em
  31/07/2026, 20 num imóvel só. **Foi MEDIDO antes de construído**, como o próprio projeto exige
  desde o fiasco da leitura de placa por foto: os 43 áudios reais transcritos primeiro, com 41
  acertos, 43/43 ainda disponíveis na Evolution e ~1,1 s cada. O conteúdo decidia negócio — um
  "Novo contato" cujo áudio dizia "vai desocupar esse mês, está disponível", uma negociação inteira
  de contrato, e um "não dá exclusividade, já está com outra imobiliária". Duas decisões que a
  medição tomou: **transcreve ANTES de gravar a nota** (a intenção era `after()`; com ele, um "já
  aluguei" em áudio não encerraria o registro e um "pode quinta às 10h" não viraria compromisso,
  porque classificação, encerramento e agenda já teriam rodado sobre `[áudio]` — e a demora é
  segura, já que reentrega da Evolution esbarra na duplicata de `registrar_nota_whatsapp`); e
  **retry é requisito, não polimento** — 11 das 43 falharam com HTTP 403 `model_not_found` e 9
  passaram na segunda tentativa, mesma chave e mesmo modelo (é limite de taxa disfarçado, por isso
  403 é retentável aqui). Falhar grava `[áudio]`, que é o comportamento de antes: nada interrompe a
  rota. Não transcreve foto nem vídeo — isso é o caminho de VISÃO, já medido e reprovado. O
  backfill dos que já estavam no banco é `scripts/backfill-transcricao.mjs` (idempotente, só toca
  nota cujo texto ainda é o marcador; rodado em 31/07/2026: 43/43).
- **`calculo/resultadoObservado.ts`** — o desfecho de uma tentativa **derivado do que o app viu**,
  em vez de perguntado. A tentativa criada no envio nasce `"sem-resposta"` marcada com
  `aguardandoResultado`, e a resposta a essa pergunta era sempre "o corretor, clicando". A conta
  disso apareceu em 31/07/2026: **77 conversas esperando confirmação, das quais 73 eram silêncio
  puro** — nenhuma mensagem do proprietário. Setenta e três cliques para afirmar à mão o que o app
  já observa (ele está ouvindo o webhook, e nada chegou); e como ninguém faz, o dado ficava
  eternamente "chute" e o ranking subestimava a resposta de **todos** os roteiros. Isto **não**
  afrouxa "a IA sugere, o corretor confirma": não há IA opinando. Chegou nota `wa:` depois da
  tentativa é FATO; não ter chegado nada é igualmente observável. O que continua sendo pergunta é a
  **categoria** de quem respondeu (agendou / vai retornar / recusou) — isso a conversa diz e o app
  não vê, e é só ali que o clique tem valor. Eram 4. Duas regras: **silêncio nunca é pendência**
  (cobrar "não respondeu" foi o que encheu o nudge), e **nada é gravado** — a derivação roda na
  leitura, então as ~200 tentativas antigas ficam resolvidas sem migração, um bug se conserta
  editando uma função, e a resposta que chegar amanhã muda o desfecho de ontem sozinha. O flag
  `aguardandoResultado` continua intocado no banco de propósito: `alvoPendente`, no webhook, precisa
  dele para saber em qual tentativa registrar a resposta que chega.
- **`calculo/rodadaDia.ts`** — o índice executável do dia, no topo da Início. Toda a maquinaria de
  lote já existia e morava no **Pipeline**, atrás de um clique, numa tela que se abre para procurar
  imóvel e não para começar o dia. Medido em 31/07/2026: **82 proprietários com uma única tentativa,
  parados há 7+ dias** — todos elegíveis para a segunda cutucada, contra 18 que já a haviam recebido
  na história inteira. Não é falta de ferramenta nem de disciplina: nada nunca disse quantos eram. E
  custa caro porque **a segunda mensagem converte melhor que a primeira** (~15% no lote de 21–23/07
  contra ~12,5% da abertura) — é a fonte de lead mais barata que existe aqui, sem garimpo nenhum.
  O número que faltava não é "82": é **"82, e cabem 20 por dia"** — os freios anti-spam fazem a fila
  DRENAR, e dia pulado é vaga que não volta. `diasParaVazar` fala da fila de HOJE e ignora quem entra
  amanhã, de propósito: não é previsão, e a decisão que informa ("vale abrir o lote hoje?") não muda
  com isso. A ordem é **de quem é a vez**, não quem tem mais fila — `agora` (o outro lado já agiu:
  resposta sem leitura, hora marcada) > `hoje` (iniciativa nossa com vaga limitada) > `quando-der`
  (o que arruma registro). Ordenar por volume inverteria isso todo dia, porque em captação o
  silêncio é sempre a categoria mais populosa — a armadilha que matou a faixa de "imóvel parado" no
  termômetro. Não é o termômetro: aquele lista PESSOAS por sinal, este lista FRENTES com fila.
  Nenhuma contagem daqui pode divergir da tela que a origina (há teste fixando isso contra o badge).
- **`calculo/relatorioCompleto.ts`** — o terceiro relatório, que mede o **TRABALHO** e não o
  desfecho. `relatorios.ts` (mensal/semanal) segue intacto: é a régua do dinheiro. O problema é que
  em captação o desfecho é raro e lento — em 31/07/2026, 177 imóveis, 12 angariados e **zero
  locados**, ou seja, o documento imprimia zeros enquanto 200 tentativas saíam e 20 proprietários
  respondiam. Quatro seções: esforço, respostas, perdas e fila. Três decisões de medição: a taxa de
  resposta é por **COORTE** (dos imóveis cuja PRIMEIRA tentativa caiu no período, quantos já
  responderam — inclusive depois do fim dele; a fotografia jogaria no denominador quem foi abordado
  dia 30 e não teve tempo); o desfecho é o de **HOJE**, com "ainda em disputa" como categoria
  exibida e não zero escondido; e **"Sem resposta" não é perda decidida**. Esta última nasceu de um
  erro real: contando os três terminais juntos, a seção 3 dava por perdidos os 29 imóveis que a
  seção 4 mandava trabalhar hoje, e diluía "chegamos tarde" de **58% para 37%**, porque silêncio não
  tem `motivoPerda` e virava o maior balde da tela. A seção 4 reusa `rodadaDia` — relatório e Início
  não podem discordar sobre quantos esperam — e é sempre a fila de HOJE, mesmo com mês passado
  selecionado: a elegibilidade do follow-up conta a partir da data atual, e reconstruí-la exigiria o
  estado do banco naquele dia. A tela avisa quando o mês não é o corrente.
- **`calculo/filtros.ts`** — filtro/ordenação do Pipeline (parte pura).
- **`calculo/dashboard.ts` · `insights.ts` · `relatorios.ts` · `agenda.ts`** — as métricas de cada
  view, extraídas da montagem de HTML antiga sem alterar nenhuma fórmula. **Duas exceções assinadas**
  no [BASELINE_ETAPA0.md](BASELINE_ETAPA0.md): a conversão do relatório (achado A3) e os rankings dos
  Insights, que passaram a medir angariação em vez de locação (ver `conversaoCaptacao` acima).
  Ao mexer em fórmula aqui, a divergência tem que ficar registrada lá **e** no teste do baseline.
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
  **Ressalva que o cálculo não tem como corrigir: as taxas de `canais` NÃO são comparáveis entre
  canais**, porque o momento do cadastro muda por canal. Onde o corretor aborda pelo chat do portal
  (OLX, Marketplace, redes sociais) ele só cadastra depois que o proprietário responde e passa o
  telefone — os ignorados e os que recusaram nunca entram na base. Onde é preciso cadastrar ANTES
  para trabalhar o lead (garimpo em site, Copel, placa, porta a porta), os fracassos entram todos.
  A tela acaba comparando finalistas com populações inteiras. Medido em 27/07/2026: a tela dizia
  60% para OLX contra 5% para garimpo em site; com o denominador real (76 abordagens de OLX em três
  meses, contadas na mão) dá **3,9% contra 3,2% — praticamente iguais**. Ao mexer aqui, ou ao usar
  esses números para recomendar qualquer coisa, **confira primeiro se o canal cadastra antes ou
  depois do contato**. Taxa boa demais é sintoma disso, não de canal bom.
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
  responde); e **quem já foi captado** (Angariado/Publicado/Locado) **não entra por faixa nenhuma**,
  porque a cobrança dessa fase são outras três telas — a agenda, o lembrete de disponibilidade e o
  nudge de resultados.
  Esse segundo corte é a **reincidência exata** da faixa de "imóvel parado", por outra porta, e
  levou duas correções. A primeira: o corte existia mas rodava **depois** das faixas, então qualquer
  reação do proprietário trazia o captado de volta — em 28/07/2026, 5 das 8 linhas eram imóveis já
  angariados, nenhuma com compromisso marcado, uma delas (LD-156) com 64 respostas de CPF, fotos e
  "Já Assinei". A causa é a de sempre: depois de angariar o proprietário fala muito mais, então essa
  categoria vence no volume. A segunda: a versão inicial do corte abria exceção para **promessa
  marcada** ("hora combinada é hora combinada"), e foi o corretor que mostrou o furo — em imóvel
  captado, a visita marcada é com o **inquilino**, e quem cobra hora marcada é a agenda. A exceção
  teria preservado justamente a linha que não era captação.
  O sinal mais forte já estava no banco e ninguém consumia: quando o proprietário diz "me chama
  semana que vem", o webhook grava em `sugestaoIa.retomarEm` — e até aqui isso só era *exibido* na
  lista de pendências, sem nada avisar no dia marcado.
- **`calculo/notas.ts`** — a convenção de id das notas automáticas (`wa:<id da mensagem>`, e
  `wa:<id>:encerrado` para a explicação do encerramento) e a leitura dela. Quem **cria** essas
  notas é o webhook; a convenção mora à parte porque tem três leitores, e um deles é o **motor**
  (resposta é movimento, ver `isStale`) — que não pode importar de `webhookWhatsapp.ts`, já que
  aquele importa `historicoComStatus` daqui e o ciclo se fecharia. Módulo sem dependência nenhuma,
  de propósito. `ehNotaDeResposta` existe para ninguém refazer o `startsWith("wa:")` a dedo e
  acabar contando a fala do próprio app como se fosse resposta de alguém.
- **`calculo/respostas.ts`** — a **caixa de respostas** (view `/respostas`): o que o proprietário
  ESCREVEU, num lugar só. O webhook já gravava tudo, e três consumidores já liam esse dado — mas
  nenhum mostrava o texto: `isStale` usa só a data (resposta é movimento), o termômetro usa a data
  e escreve um `motivo`, e a IA guarda um resumo de uma linha na tentativa. Para ler o que a pessoa
  disse era preciso abrir imóvel por imóvel no modal de notas; com 110 respostas na carteira — 64
  num imóvel só — isso é o mesmo que não ter o dado.
  **Não é o termômetro de novo, e a diferença é o corte.** `temperatura.ts` responde "de QUEM eu
  corro atrás agora" e por isso exclui o já captado (a cobrança dessa fase é a agenda) e quem foi
  contatado hoje. É justamente ali que está o volume: depois de angariar o proprietário fala muito
  mais (CPF, fotos, "já assinei"), nada disso é captação e tudo isso é trabalho que se perde se
  ninguém ler. A caixa **não corta o captado** — sem ela, esse material não tem leitor nenhum.
  Manter o captado foi **medido**, não suposto, quando o corretor questionou a decisão. Em
  29/07/2026 ele respondia por 59 das 80 pendências — e também por **11 dos 17 conteúdos que
  importavam**: "Bloco 10 / Ap 701 / Garagem n° 299", "o valor cheio seria com o condomínio", "Já
  Assinei", "caso confirme a visita ligue pro meu esposo" e o aviso, no LD-163, de que outra
  imobiliária estava falando com o proprietário. Cortar por status jogaria fora as duas coisas
  juntas. A separação é por **bloco** (`fase`): "Captação" antes de "Carteira", para o operacional
  nunca enterrar um lead sem que nada se perca. O **badge do menu conta só captação** — somar as
  duas o deixaria permanentemente alto por causa de documentação e visita de inquilino, e badge que
  nunca baixa ninguém olha.
  **O ruído não tem status, e é ele que enche a caixa.** Na mesma medição, 63 das 80 pendências
  eram marcador de mídia ou mensagem de até 20 caracteres — e isso valia igual na captação (15 de
  21). Só o **marcador de mídia** deixa de cobrar (`ehSoMidia` em `calculo/notas.ts`): `[áudio]`,
  `[imagem]` e afins não têm o que ser lido no painel, e a única saída deles é abrir o WhatsApp, que
  é o que a linha já oferece. Eles continuam visíveis, e a linha diz quantos são — nove áudios são
  um proprietário muito ativo, e escondê-los faria a linha mentir. As mensagens **curtas continuam
  cobrando**, contra a intuição: "Ok" é ruído, mas "Pode sim" tem 8 caracteres e "Já Assinei" tem
  10 — nenhuma regra de tamanho separa uma da outra, e errar aí é perder o "sim". Pelo mesmo
  motivo a linha fechada mostra a `previa` (a última mensagem COM TEXTO) e não a `ultima`: com um
  áudio encerrando a conversa, a prévia seria "[áudio]" e não diria nada sobre o assunto.
  A unidade da lista é o **imóvel**, não a mensagem: no WhatsApp as pessoas mandam três mensagens
  curtas seguidas, e uma linha por mensagem faria um proprietário empurrar todos os outros da tela
  (mesmo motivo do "uma mensagem por PROPRIETÁRIO" no follow-up).
  **"Pendente" tem regra DUPLA, e nenhuma metade funciona sozinha.** Sai da caixa por **ação** —
  tentativa registrada ou status mudado depois da mensagem, então quem trabalha pelo painel nunca
  marca nada, igual ao `aguardandoResultado` que morre na confirmação — **ou** pelo flag `lida`
  (`NotaImovel.lida`, jsonb, sem migração). O flag existe porque "obrigado" e "combinado" não vão
  gerar tentativa nem mudar status nunca: só com a regra derivada essas mensagens ficariam
  pendentes para sempre, a caixa encheria de ruído e o corretor pararia de abri-la — que é
  exatamente como a faixa de "imóvel parado" matou o termômetro. Só com o flag, viraria burocracia
  diária. O empate de mesmo dia entre `statusHistory` (guarda DIA) e a nota (guarda datetime) cai
  para o lado de **continuar pendente**: dar por tratada uma resposta que ninguém leu é o único
  erro que esta tela não pode cometer, porque é a tela inteira.
  Há **saída em massa** (`marcarTodasRespostasLidas`) porque a caixa nasce sobre um backlog que
  nunca teve tela: medido em 29/07/2026, na estreia ela abria com **13 dos 14 imóveis pendentes e
  ~90 mensagens**, várias com tudo por tratar (LD-123 com 18 de 18). Sem um "limpar", a primeira
  abertura não deixa distinguir o que chegou hoje do que está parado há um mês — e a tela morreria
  na estreia, do mesmo jeito que a faixa de "imóvel parado" morreu no termômetro. Repare que a
  regra derivada não é o problema e está funcionando: no mesmo dia, o LD-156 tinha 64 mensagens e
  só 24 pendentes (tentativas e mudanças de status limparam 40).
  A view tem botão **Atualizar** (`recarregarEstado`) por um motivo estrutural: a resposta entra
  pelo **webhook, no servidor**, e o painel carrega o estado uma vez por sessão — numa aba aberta
  desde cedo, uma caixa vazia diria "nada chegou" quando significa "nada chegou desde o login".
  O botão continua ali como rede (ver `chegadaResposta.ts` abaixo: hoje o Realtime empurra a
  mudança, mas socket cai, aba dorme, e o botão é a saída que não depende de nada disso).
- **`calculo/chegadaResposta.ts`** — a resposta do proprietário aparecendo **na hora**, sem F5.
  O buraco era estrutural e a caixa o contornava com um botão: quem escreve é o **webhook, no
  servidor**, e o painel lia o banco **uma vez por sessão**. Numa aba aberta desde cedo o badge
  marcava zero e o sino dizia "tudo em dia" enquanto as mensagens se empilhavam. Agora `imoveis`
  está publicada no **Realtime** (única tabela publicada — é a única que recebe escrita de fora do
  painel; as outras quatro só mudam pelas mãos do próprio usuário, na própria aba, e publicá-las
  seria devolver ao painel o que ele acabou de mandar). A RLS continua sendo o isolamento: sem
  sessão válida não chega evento. Quem assina é `components/painel/SincronizacaoRespostas`, montado
  no layout **fora do `<main>`** como o `IndicadorFollowUp` — navegar não pode reabrir o canal.
  O módulo daqui é só o **diff**, e ele é a peça que impede o aviso errado. Três regras:
  **sem retrato anterior não há aviso** (imóvel que o painel nunca viu chega com o histórico
  inteiro — o LD-156 real tem 64 respostas, e "tudo que existe é novo" seriam 64 caixinhas de uma
  vez); **compara por ID de nota, nunca por quantidade** (o encerramento automático ACRESCENTA uma
  nota `wa:<id>:encerrado` escrita pelo próprio app, e um contador anunciaria como "resposta do
  proprietário" um texto nosso — é para isso que `ehNotaDeResposta` existe); e por tabela **a nossa
  própria escrita não avisa**, que é o caso de todo dia, já que cada tentativa registrada devolve um
  evento com as mesmas notas. A **rajada vira UM aviso** ("(3 mensagens)", prévia da mais recente):
  no WhatsApp três mensagens curtas seguidas são a regra, e três interrupções pelo mesmo assunto
  são o caminho mais curto para a pessoa desligar a permissão — mesmo raciocínio do "uma mensagem
  por PROPRIETÁRIO" no follow-up. Onde o aviso sai depende da aba: **visível → toast**; **oculta →
  notificação do sistema** (`lib/notificacaoSistema.ts`), porque ali o toast nasceria e morreria
  sem ninguém ver. Por isso o aviso sai daqui em partes SOLTAS (`quem`/`imovel`/`mensagem`) **e**
  já compostas (`titulo`/`corpo`): a caixinha do sistema é do SO e só aceita duas linhas de texto
  puro, enquanto o toast é HTML nosso e vira **cartão** (`toastCartao` + `.toast-cartao`) — nome em
  destaque, imóvel fino, mensagem em citação, e um clique que leva à caixa, igual ao clique na
  notificação do sistema. Compor as duas formas no mesmo lugar é o que impede os dois avisos de
  contarem histórias diferentes da mesma mensagem. O cartão também fica mais tempo na tela que um
  toast comum: 2,6s é o tempo de reconhecer "Imóvel salvo", não o de LER o que o proprietário
  escreveu. Isso exige o painel ABERTO em alguma aba — Web Push (service worker + VAPID +
  tabela de inscrições) ficou de fora por ser outro tamanho de obra e em boa parte redundante: a
  mensagem já faz o celular apitar pelo WhatsApp, e o que o painel acrescenta é o CONTEXTO.
  A permissão do navegador é a **única** preferência, sem toggle nosso em localStorage — duas
  fontes de verdade viram o clássico "desliguei e continua chegando".
- **`calculo/googleAgenda.ts`** — as partes puras do espelhamento no Google Agenda: a tradução de
  um `AgendaItem` em evento (dia inteiro vs. cronometrado, fuso, o "✓" do concluído), o vocabulário
  de falhas e a URL de autorização. Mesmo papel de `calculo/whatsapp.ts` no envio. Ver
  "As rotas de servidor → `api/google/*`".
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
- **`tema.ts`** — a troca entre **escuro** (padrão, a identidade do app) e **claro**. Nada aqui
  sabe de cor: a paleta inteira vive nos tokens do `app/style.css`, e este módulo só decide QUAL
  conjunto vale e escreve `data-tema` no `<html>`. A decisão tem duas metades de propósito, e
  separá-las é o que evita a tela piscar: **a preferência do SISTEMA é resolvida em CSS puro**
  (`@media (prefers-color-scheme: light)`), que pinta certo já no primeiro quadro; o `SCRIPT_TEMA`
  — inline, antes do React — aplica só a **escolha explícita** do corretor, que mora no
  localStorage. O script do Next entra junto com o corpo da página, tarde demais para ser a única
  defesa. A escolha é do **dispositivo**, não da conta (não vai para `user_config`): tema é
  preferência de tela — escuro no monitor da imobiliária, claro no celular sob o sol —, e
  sincronizar pelo banco significaria esperar o login para saber com que cor pintar a tela de
  login. Sem escolha salva, a janela segue o sistema ao vivo (`sincronizarTema`).
  `inscreverTema` existe para quem pinta **fora do CSS**: hoje só o Chart.js, que desenha em canvas
  e guarda a cor que recebeu — token nenhum chega lá sozinho (ver `components/graficos/Grafico.tsx`
  e o `corToken`).
- **`toast.ts` / `notificacaoSistema.ts` / `geo.ts` / `dadosDemo.ts` / `auth/`** — aviso dentro da
  tela; aviso do SISTEMA operacional (a caixinha do Windows, para quando a aba está oculta — ver
  `calculo/chegadaResposta.ts`); CEP (ViaCEP) + geocoding (Nominatim); seed de exemplo; força de
  senha e tradução de erros do Supabase Auth.

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

#### O ranking no momento da escolha (`abordagensParaEnvio`)

O ranking era só **relatório**: vivia na view de Relatórios e no resumo da IA. No seletor do
ModalWhatsapp e no do follow-up em lote — onde a decisão acontece — a lista saía na ordem do
CATÁLOGO, isto é, na ordem em que o corretor cadastrou os roteiros. O sistema sabia qual roteiro
fecha mais e não dizia nada ali; para usar o que sabia, era preciso sair do envio, abrir Relatórios,
ler o ranking e voltar. `abordagensParaEnvio` leva o ranking para o seletor: comprovadas primeiro,
com selo de desempenho, e no máximo **uma** marcada como recomendada.

Três regras que impedem a sugestão de virar palpite:

- **Sem amostra não há recomendação nem selo**, e nenhuma abordagem é recomendada se a líder tiver
  0% de angariação — sugerir a "melhor" de uma carteira que não converte é sugerir repetir o que não
  funcionou. Na carteira real isso já acontece: os dois roteiros com amostra estão em 0%, e o app
  corretamente não recomenda nenhum.
- **Abertura e seguimento não disputam o mesmo lugar.** Primeiro contato e retomada de quem não
  respondeu são conversas diferentes, e o mesmo seletor serve as duas. O momento (`momentoDoContato`,
  derivado do próprio histórico de tentativas) entra como **desempate**, não como filtro — filtrar
  esconderia roteiro bom por falta de histórico numa das pontas. No lote o momento é sempre
  `"seguimento"`: o público é quem já foi contatado.
- **O lote NÃO pré-seleciona a recomendada.** Um padrão que se autoaplica faria o ranking se
  autoconfirmar — o sugerido é usado, o usado sobe —, e mudaria em silêncio o que fica registrado na
  tentativa. Quem escolhe o roteiro continua sendo o corretor, mesma regra do "a IA sugere, o
  corretor confirma".

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

Uma mensagem para cada proprietário que não respondeu, de uma vez. As partes puras
(elegibilidade, texto, intervalo, resumo) ficam em `calculo/followup.ts`; a execução em
`filaFollowUp.ts`, um store Zustand que roda a fila em background chamando a rota de WhatsApp já
existente uma vez por imóvel. Entrada pelo Pipeline; UI em `ModalFollowUpLote` +
`painel/IndicadorFollowUp`.

**O público são DOIS status, e o segundo entrou por medição** (`FOLLOWUP_STATUS_ALVO`): "Sem
resposta" **e "Novo contato"**. O lote atendia só o primeiro, partindo de que um contato sem
retorno viraria "Sem resposta" em algum momento. **Não vira** — nada move esse status sozinho:
`confirmarResultadoTentativa` marca o desfecho da TENTATIVA e não toca no imóvel, então confirmar
"não respondeu" no nudge deixa o imóvel exatamente onde estava. Na carteira real de 27/07/2026 isso
prendia **68 imóveis** num beco (primeira mensagem enviada, silêncio, invisíveis para a única
ferramenta feita para esse caso), com 28 deles cruzando os 14 dias na semana seguinte. "Perdido" e
"Cancelado" seguem de fora e por outro motivo: são saídas DELIBERADAS, o proprietário disse não.
"Novo contato" não é saída de ninguém — é silêncio.

**São DOIS lotes, uma máquina só.** Além do seguimento acima, há a **confirmação de
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
- **A espera entre cutucadas CRESCE** (`FOLLOWUP_DIAS_POR_TENTATIVA` = 7, 14, 30 —
  `diasDesdeUltimoContato`). Era 14 fixo, e o defeito não era o 14: era o "sempre". A **segunda**
  tentativa e a **quarta** são conversas diferentes, e o intervalo único tratava as duas igual —
  tarde demais para a que converte (o lote de 21–23/07/2026 teve ~15% de resposta na segunda) e
  cedo demais para a que já beira a insistência. Repare que isto **não** é um freio anti-banimento:
  encurtar o começo não aumenta o volume diário, que é travado pelo teto e pelo intervalo acima —
  só faz a fila se reabastecer. O que a escala protege é a paciência do proprietário.
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

**Ao consultar o banco por fora do app — SQL editor, MCP do Supabase, service role — a RLS não
vale, e o banco tem mais de uma conta**: a real do corretor, a de teste do `seed-teste.mjs` e
sobras de experimentos. **Toda consulta administrativa leva `where user_id = '...'`.** Não é
zelo: em 27/07/2026 uma análise de conversão por origem foi montada sem esse filtro, misturou as
contas e foi apresentada ao corretor com números de seed dentro — inclusive imóveis "Locado" numa
carteira que nunca locou nenhum. Quem pegou o erro foi ele. Número estranho na análise (locação
onde não devia haver, angariação demais) é sintoma disto antes de ser sintoma de bug no cálculo.

### As rotas de servidor: `api/whatsapp/*`, `api/ia` e `api/google/*`

São as exceções ao "sem servidor", e existem todas pelo mesmo motivo: guardam um segredo que não
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
- **As três escritas são INDEPENDENTES — nenhuma é pré-condição da outra.** A sugestão na
  tentativa, o encerramento e o compromisso derivam todos do que o proprietário ESCREVEU, não um
  do outro. A rota já teve um `return` quando não achava tentativa pendente, e ele levava junto o
  encerramento e a agenda. **Não ter tentativa pendente é comum e não diz nada sobre a conversa:**
  o registro automático de envio nasceu depois de boa parte dos contatos (imóvel antigo não tem
  tentativa); backfill e tentativa manual não levam `aguardandoResultado` de propósito; e passados
  `DIAS_COBRANCA_RESULTADO` dias o palpite deixa de ser cobrado. Medido em 28/07/2026: dos 14
  imóveis que já haviam respondido, **2 não tinham tentativa alguma e somavam 65 das 110
  respostas** — o LD-156 sozinho tinha 64, todas descartadas ali, com a chamada da IA já paga.
  O sintoma que abriu a investigação foi um compromisso perdido (LD-123, hora marcada por escrito
  que nunca chegou à agenda); o efeito grave era outro — **um "já aluguei" nesses imóveis não
  encerrava o registro**.
- **A exceção:** encerramento automático. Quando a resposta não deixa nada a fazer ("já aluguei",
  "já estou com outra imobiliária"), o imóvel vai para **Perdido** com o motivo, sem clique. O que
  segura isso é o motivo sair de uma lista fechada e **menor** que `MOTIVOS_PERDA`
  (`MOTIVOS_PERDA_IA`, sem os que exigem julgamento), só valer junto de `recusou`, e uma segunda
  nota explicar na tela por que o status mudou — senão o imóvel sairia da carteira e a única
  explicação estaria no log do servidor. **Nunca vira "Locado":** "já aluguei por conta própria" é
  PERDA, e marcá-lo como ganho somaria à conversão, à comissão e à meta do mês um negócio que não
  existiu.

#### `api/ia` — sugestão de roteiros, leitura do ranking, captura de anúncio e rascunho de resposta (OpenAI)

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

##### A captura de anúncio colado (`tipo: "extrair-anuncio"`)

O garimpo do corretor. O texto do anúncio entra no `ModalPreCadastro` e sai como campos
preenchidos — daí ele confere, salva, e o WhatsApp já abre. O gargalo do garimpo nunca foi *achar*
o imóvel: foi o telefone (que o portal esconde, às vezes ofuscado por extenso) e o tempo entre ver
o anúncio e mandar a mensagem.

> Isto **não** reabre o scraping de portais, descartado em 2026-07-10 (`RADAR_CAPTACAO.md`): não há
> busca automatizada, não há chat automatizado, e quem cola o texto é a pessoa.

**A leitura de IMAGEM foi removida em 2026-07-25** — ver "Garimpo automatizado" acima. Junto com ela
saíram `lib/imagem.ts`, `MAX_IMAGEM_BYTES`/`bytesDeBase64` e o caminho de visão da rota. O prompt
não menciona mais foto, e há teste guardando isso (a menção mais fácil de esquecer estava na regra
de `origemSugerida`, que citava "foto de uma placa/faixa").

Duas coisas a saber ao mexer:

- **É a única chamada em que o browser manda CONTEÚDO** (o texto colado), e não um contexto curto e
  tipado — desvio consciente da regra "o prompt é montado no servidor". O que o segura: prompt e
  esquema continuam do servidor, a saída é objeto **fechado** (enums de `TIPOS_IMOVEL`/
  `ORIGENS_IMOVEL` + `additionalProperties: false`, não texto livre), o acesso já passa por
  `podeUsarIa`, e `MAX_TEXTO_ANUNCIO` limita o custo por chamada. Não é proxy de LLM aberto — é um
  extrator de campos.
- **A IA preenche, o corretor confirma** — nada salva sozinho, mesma regra do webhook. Um telefone
  errado gravado sem revisão vira mensagem para um estranho. Por isso o prompt manda devolver `null`
  em vez de telefone "quase certo", e a `confianca` existe para a UI pedir conferência quando o
  texto vem cortado ou misturado com outro anúncio.

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

##### Responder o proprietário: réplica pronta (camada 1) e rascunho por IA (camada 2)

A caixa de respostas (`/respostas`) mostra o que o proprietário escreveu; o passo seguinte é
**responder**, e ele tem DUAS camadas — a divisão é entre o que dá para saber sem ler a mensagem e
o que não dá.

- **Camada 1 — réplica pronta, SEM IA** (`sugestaoRespostaModelo` em `calculo/whatsapp.ts`). O
  webhook já classificou a resposta e guardou o desfecho em `tentativa.sugestaoIa`; a camada 1 só
  traduz aquele desfecho num modelo de réplica: `motivoPerda`/`recusou` → encerramento cordial;
  `agendou` → confirmar; `vai-retornar` → aguardar; `numero-errado` → desculpar engano. São 4
  modelos do sistema NOVOS, **fora de `MODELOS_CAPTACAO`** (não são pitch — não registram tentativa
  nem entram no ranking). O botão "Responder (sugestão)" abre o `ModalWhatsapp` já preenchido. O
  `"respondeu"` genérico (uma dúvida, uma pergunta, "não entendi", "sou o proprietário") devolve
  `null` de propósito: não há réplica fixa que sirva sem LER a mensagem — é a camada 2.

- **Camada 2 — rascunho por IA** (`tipo: "rascunhar-resposta"`). Para o `"respondeu"` genérico, o
  botão "✨ Rascunhar resposta (IA)" chama a rota, que **relê a última mensagem do proprietário do
  BANCO** (a nota do webhook, com o token de quem chamou) — o browser manda só o `imovelId`, nem o
  alvo do rascunho ele escolhe. É a forma mais forte da regra "o conteúdo sai do banco": mais rígida
  que a extração de anúncio, que aceita texto colado. A saída é objeto **fechado** (um campo
  `mensagem`) e cai no `ModalWhatsapp` **editável** (prop `textoInicial` + `abrirWhatsappRascunho`
  no `uiModal`), sem modelo associado — logo não credita tentativa. **A IA sugere, o corretor
  confirma:** nada sai sozinho.

  A trava que dá forma ao `promptRascunharResposta`: **a IA não sabe nada do imóvel além do
  endereço.** Se o proprietário pergunta "tem garagem?", responder "sim, duas vagas" seria promessa
  falsa a uma pessoa real. Por isso o prompt proíbe inventar fato do imóvel e manda reconhecer a
  pergunta levando a um próximo passo (ligação/visita em que o corretor dá o detalhe) — o análogo
  exato do "não invente" da extração. Gated por `podeUsarIa` (a UI usa o flag `iaDisponivel`), com
  `MAX_TEXTO_RASCUNHO` limitando o custo.

#### `api/google/*` — espelhar a agenda no Google Agenda

Quatro rotas (`conectar`, `callback`, `sincronizar`, `conta`) e um módulo `_comum.ts` que não é
rota (o `_` o mantém fora do roteamento). O segredo que as justifica é o `GOOGLE_CLIENT_SECRET` e,
mais ainda, o **refresh token** de cada corretor: ele não expira sozinho e dá acesso contínuo à
agenda pessoal da pessoa. Mora em `google_contas`, tabela com RLS ligada e **nenhuma política** —
o mesmo desenho de `whatsapp_instancias`, pelo mesmo motivo (uma política de select entregaria o
token ao browser com a anon key).

**A sincronização é de UMA VIA: painel → Google.** Não há reconciliação porque não há conflito
possível. É escolha, não falta de tempo: o bidirecional exige detectar mudança do lado do Google
(canais push que expiram toda semana, ou varredura periódica), decidir quem vence quando os dois
mudam, e distinguir "apagado no Google" de "nunca sincronizado" — é onde essa integração costuma
quebrar, e o problema real do corretor era outro (receber o lembrete no celular). Consequência
assumida: evento editado no Google é sobrescrito no próximo salvamento daqui.

Quatro coisas que caem disso e não são detalhe:

- **O `state` do OAuth é ASSINADO, e precisava ser.** O callback do Google é um redirect de
  navegação: chega sem sessão, porque a sessão do Supabase neste app vive em `localStorage` e
  servidor nenhum enxerga isso. Mandar o access token na query também não serve — query string
  entra em log, histórico e `Referer`. Então vai só o `user_id`, com HMAC. Sem a assinatura,
  qualquer um montaria um `state` com o id de outro corretor e plantaria a **própria** conta do
  Google na conta dele, passando a receber os compromissos do outro. A chave do HMAC é o
  `GOOGLE_CLIENT_SECRET` — reúso consciente, para não criar mais uma variável de ambiente para
  configurar errado.
- **`access_type=offline` + `prompt=consent`.** Sem o primeiro não vem refresh token e tudo morre
  em uma hora; sem o segundo, RECONECTAR não devolve refresh token nenhum (o Google só o manda na
  primeira autorização de cada conta) e o corretor fica preso num "conectado" que não funciona. O
  callback recusa gravar uma conexão sem refresh token, em vez de deixá-la morrer em silêncio.
- **O conteúdo do evento sai do BANCO**, nunca do corpo da requisição — mesma regra do "destinatário
  sai do banco" no envio de WhatsApp. Aqui o risco é que a rota viraria um "escreva o que eu quiser
  na agenda do usuário", e um bug de UI passaria a corromper a agenda pessoal dele. Pelo mesmo
  motivo a **remoção acontece ANTES** da exclusão local, com a linha ainda no banco: é assim que o
  `google_event_id` continua vindo do banco em vez de o cliente poder pedir a exclusão de qualquer
  evento da agenda da pessoa.
- **Falhar no Google não derruba o salvamento.** O compromisso é do corretor; a cópia lá é
  conveniência. `espelharNoGoogle` dispara e não espera (o botão Salvar não pode ficar lento por
  causa de serviço de terceiro), e é silenciosa: `sem-conexao-google` e `nao-configurado` são o caso
  NORMAL de quem nunca conectou, não erro. Só a exclusão espera, e mesmo assim segue em frente se o
  Google recusar — sobra um evento órfão, que é melhor que não conseguir apagar o compromisso.

Compromisso **sem hora vira evento de DIA INTEIRO** (a mesma distinção do `separarPorHorario`):
como evento cronometrado ele apareceria de madrugada e dispararia lembrete na hora errada. Com
hora, o `timeZone` é obrigatório — sem ele o Google assume UTC e a visita das 10h chega às 7h no
celular. Concluir **não apaga** o evento, põe "✓" no título: a agenda também é registro do que foi
feito, e uma visita que some depois de realizada apaga a prova de que aconteceu.

> **A armadilha que não é do código:** enquanto a tela de consentimento estiver em modo **Teste** no
> Google Cloud, o refresh token expira em **7 dias**. A sincronização funciona a semana inteira e
> quebra sozinha, sem erro visível — o sintoma é `invalid_grant`, que a rota traduz para
> `autorizacao-expirada` e a UI pede reconexão. Para uso real, publicar em "Em produção".

## Garimpo automatizado: o que já foi medido e descartado

O garimpo — achar o imóvel antes de ele virar cliente de outra imobiliária — é a parte do trabalho
que mais parece pedir automação, e é onde mais se gastou esforço à toa. O que segue foi **medido**,
não estimado. Cada item existe para não ser reaberto sem dado novo.

**As fontes reais são três, e são dois problemas diferentes.** Marketplace e OLX (anúncio de
proprietário, contato pelo chat do próprio portal) de um lado; sites de imobiliária, ZAP, Chaves na
Mão e Wimóveis/ImovelWeb do outro (anúncio de imobiliária, o dono não aparece). Note que "grupo
zap" na fala do corretor é o **Grupo ZAP**, os portais — não grupo de WhatsApp. Não há fonte de
garimpo dentro do WhatsApp; os grupos dele são internos da imobiliária.

- **Raspagem de portal / Central de Angariação com Playwright** — descartada em 2026-07-10, ver
  [RADAR_CAPTACAO.md](RADAR_CAPTACAO.md). Segue descartada.
- **Extensão de navegador que lê a página aberta** — avaliada e descartada em 2026-07-27. O ganho
  que a justificava era parar de reler a lista todo dia, e isso o corretor já resolve com um
  favorito: na OLX o filtro "direto do proprietário" e a ordem por recente vivem na URL
  (`?sf=1&f=p`), e a data sai em cada card. Sobrava construir um artefato fora do Next, com três
  adaptadores de DOM para manter, em troca de um marcador de páginas. Some a isso que captura em
  massa encheria a base de registro sem endereço — que não geolocaliza, fica fora do mapa, é
  invisível para a duplicidade e ainda assim ocupa linha no pipeline disparando `isStale`.
- **Descobrir o NÚMERO do endereço por IA + busca na web** — testado e **reprovado** em 2026-07-27,
  com 16 casas reais da carteira e o número que o corretor já havia achado como gabarito:
  **1 acerto, 8 erros, 7 "não achei" — 11% de precisão quando arriscou responder.** Não é ajuste de
  prompt. Para PRÉDIO funciona (o empreendimento tem nome e a construtora publica o endereço), mas
  para **CASA o dado não existe na internet**: nada publicado diz qual casa daquela rua está
  anunciada. A busca então acha *alguma* casa da rua — em Jornal Oficial da Prefeitura, em PDF do
  Detran — e devolve com **confiança alta**. Erro com procedência verificável é pior que erro
  óbvio, e o custo dele não é a consulta: é o eemovel devolver o proprietário errado e a mensagem
  ir para um estranho. **O eemovel não tem API** (já verificado), então não há atalho por ali.
- **Geocodificar pelo nome do empreendimento (Nominatim/OSM)** — descartado no mesmo dia: 1 acerto
  em 4 prédios de Londrina, e nem um endereço sabidamente correto resolveu. O OSM não tem
  numeração de Londrina. O `lib/geo.ts` continua servindo para CEP, não para descobrir número.
- **Tela para o corretor contar as abordagens não cadastradas** — descartada. Corrigir o viés dos
  canais (acima) exige o denominador, mas é dado que se precisa **uma vez**, não para sempre; e em
  multiusuário um campo manual sem retorno visível decai, com cada corretor contando de um jeito.
  A correção certa, se um dia importar, é o contato passar pelo painel.
- **Ler a placa/print por FOTO (IA de visão)** — construída, usada e **removida em 2026-07-25**.
  Reprovou no uso real exatamente no campo que a justificava: em duas tentativas seguidas, com o
  número **bem visível** na imagem, não devolveu o telefone. O raciocínio da remoção: o que a foto
  tinha de melhor que o texto colado era só o telefone — a placa mostra, o portal esconde. Sem
  acertar isso, sobra preencher endereço e valor, que o texto colado faz melhor, sem OCR e por uma
  fração dos tokens. Era também o caminho mais caro do app na nossa conta da OpenAI, disparado pelo
  botão mais fácil de tocar sem querer (a câmera). **A captura por texto colado continua** — o que
  saiu foi a imagem. Se for reaberto, precisa de MEDIÇÃO antes, como se fez com a busca de endereço:
  N placas reais, o telefone certo como gabarito, taxa de acerto anotada. Trocar de modelo e torcer
  não conta.

**O fio solto**, para quem retomar: a busca por **texto exato do anúncio** em outro portal (onde o
número às vezes aparece) nunca foi testada — só a busca por rua e por nome de empreendimento.
Exigiria textos de anúncio reais, não endereços reconstruídos.

**E a conclusão que vale mais que qualquer uma dessas features:** OLX e garimpo em site convertem
quase igual (~3,5%), mas **custam muito diferente por tentativa** — abordar na OLX é escrever uma
mensagem; no garimpo é achar endereço, rodar o eemovel e cadastrar. A vantagem da OLX é custo por
tentativa, não conversão.

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
- **Cor sempre por token, nunca literal** — são DOIS temas dividindo o mesmo CSS (ver `lib/tema.ts`).
  Literal só quando a cor é a mesma nos dois: o que fica por cima do mapa (as telhas do OSM são
  claras sempre), o véu escuro atrás dos modais e o bloco `@media print`. Três consequências
  práticas ao mexer no `app/style.css`:
  - **Token novo entra em TRÊS lugares**: o valor escuro no `:root`, o valor claro no
    `--claro-*` e o mapeamento nos **blocos gêmeos** (o de `[data-tema="claro"]` e o do
    `@media (prefers-color-scheme: light)`). Esquecer um dos gêmeos deixa metade dos usuários com
    a cor do outro tema, e é invisível para quem testa só um caminho.
  - **Cor derivada de outra sai por `color-mix`/`currentColor`**, não por hex com alfa: as pílulas
    de status declaram só a cor do texto e o fundo cai dela (ver `.badge`), então não existe pílula
    com fundo de um status e texto de outro.
  - **O que não contrasta com fundo branco tem versão própria no claro.** O dourado da marca é o
    caso: como FUNDO de botão com texto branco ele precisou escurecer (o tom do tema escuro dá
    3,8:1, abaixo do legível). Ao criar acento novo, confira o contraste nos dois temas.
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
