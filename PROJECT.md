# PROJECT.md

Fonte canônica, neutra e permanente de contexto, arquitetura, regras e decisões deste projeto.
Ela deve ser compreensível por qualquer pessoa ou agente, sem depender de Claude, Codex ou outro
fornecedor. Foi conferida contra o código em 2026-08-17.

Não use este arquivo como changelog. Atualize-o somente quando mudar arquitetura, integração,
regra permanente, modelo de dados, restrição operacional ou comportamento relevante. Alterações
triviais devem ficar no histórico do Git.

## Mapa da documentação

- Este arquivo: visão do produto, arquitetura, invariantes e decisões permanentes.
- [supabase-schema.sql](supabase-schema.sql): fonte de verdade executável do schema e das políticas.
- [DEPLOY.md](DEPLOY.md): configuração de ambientes, deploy, cutover, rollback e tarefas agendadas.
- [INTEGRACAO_SOPHIA.md](INTEGRACAO_SOPHIA.md): contrato externo da integração Sophia.
- [MIGRATION_NEXT.md](MIGRATION_NEXT.md) e [BASELINE_ETAPA0.md](BASELINE_ETAPA0.md): histórico e
  contrato de paridade da migração para Next.js.
- [PROTOTIPOS_LOCAIS.md](PROTOTIPOS_LOCAIS.md): protótipos isolados e limites de alteração.
- [AGENTS.md](AGENTS.md): regras de trabalho para agentes; [CLAUDE.md](CLAUDE.md) é apenas a ponte
  de compatibilidade do Claude.

## O que é

"Angario" — um CRM/dashboard single-tenant-por-login para corretores de imóveis
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

- [supabase-schema.sql](supabase-schema.sql) — schema completo do banco. Inclui dados da carteira
  (`imoveis`, `metas`, `agenda`, `abordagens`, `protocolos`, `user_config`), avaliações de imóveis,
  mensagens agendadas, Central/Radar, integrações protegidas e tabelas operacionais. As tabelas
  acessíveis pelo usuário
  têm RLS por `auth.uid() = user_id`; secrets e dados globais de operação permanecem sem políticas
  de cliente.
  Idempotente — pode ser re-rodado no SQL editor do Supabase. **É a fonte de verdade do schema.**
- [DEPLOY.md](DEPLOY.md) — passo a passo de deploy (Supabase + Vercel com Root Directory `web`),
  runbook de cutover e rollback.
- [MIGRATION_NEXT.md](MIGRATION_NEXT.md) / [BASELINE_ETAPA0.md](BASELINE_ETAPA0.md) — guia da
  migração e o baseline numérico de paridade (contrato de aceitação das views).
- [INTEGRACAO_SOPHIA.md](INTEGRACAO_SOPHIA.md) — o contrato da integração com o Sistema Principal,
  escrito para a equipe do OUTRO sistema (não pressupõe acesso a este repositório). É documento
  voltado para fora: mudou payload, chave de casamento ou código de resposta em
  `api/sophia/eventos`, muda aqui junto.
- [scripts/seed-teste.mjs](scripts/seed-teste.mjs) — semeia a conta de teste no Supabase
  (idempotente; credenciais via `SEED_EMAIL`/`SEED_PASSWORD`). Ver §15 do MIGRATION_NEXT para um
  bug conhecido do re-seed em `user_config`.
- [PROTOTIPOS_LOCAIS.md](PROTOTIPOS_LOCAIS.md) — documenta `mapillary-facade-test`, experimento local
  pausado, ignorado pelo Git e proibido de ser movido, apagado ou integrado sem pedido explícito.

O aplicativo vive em **[`web/`](web/)** — Next 16 (App Router, Turbopack), TypeScript, sem Tailwind:

- **`web/app/`** — App Router. `layout.tsx` (raiz: monta `SessaoProvider` + `Toasts` + o
  `AplicadorTema` e o script inline do tema, importa o CSS
  do Leaflet e o `style.css`), `page.tsx` (tela de acesso e queda do link de recuperação de senha),
  páginas públicas de termos/privacidade e o grupo **`(painel)/`** com o shell autenticado. As views
  atuais incluem `home`, `dashboard`, `pipeline`, `metas`, `agenda`, `mensagens`, `respostas`,
  `insights`, `mapa`, `relatorios`, `protocolos`, `avaliacao`, `central-angariacao` e `admin`. A antiga rota
  `roadmap` redireciona para o Início: integrações e IA não formam uma frente de trabalho do
  corretor; configuração e saúde técnica pertencem à Administração.
  As rotas de servidor vivem em **`app/api/`**: `whatsapp/*`, `ia`, `assistente`, `google/*`,
  `admin/*`, `sophia/eventos`, `central-angariacao/*` e `cron/*`. Elas protegem secrets, executam
  integrações externas ou realizam trabalho privilegiado que não pode ficar no browser.
- **`web/app/style.css`** — o CSS do app antigo, dirigido por custom properties em `:root`. Não
  houve redesign: classes e paleta escura seguem as do app estático. As duas mudanças estruturais
  vieram com o **tema claro** — a paleta ganhou um segundo conjunto de valores e as cores que
  estavam escritas à mão no meio das regras (sombra, borda de acento, cor de status) viraram
  token, porque literal no meio da folha só serve a um tema. Ver "Cor sempre por token" nas
  convenções.
- **`web/lib/`** — núcleo sem UI (ver "Arquitetura" abaixo), persistência e stores. O cálculo puro
  não importa React/Next; código exclusivo do servidor fica em `lib/servidor/`, e o Assistente se
  divide entre `lib/assistente/` (contratos/cliente) e `lib/servidor/assistente/` (orquestração).
- **`web/components/`** — os componentes React por view e os modais.
- **`web/tests/`** — Vitest. Testes de caracterização, regressão, segurança estrutural e o baseline
  como teste executável.

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
Metas, Insights e Relatórios consomem as mesmas funções, então nunca divergem. O domínio puro vive
principalmente em `web/lib/calculo/` e **não importa React, Next, Supabase nem o store** — só tipos e
helpers de data. Código com efeitos fica nas fronteiras (`persistencia`, `mutacoes`, stores, rotas e
`lib/servidor`). É o que torna as regras testáveis sem infraestrutura.

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
- **`configuracaoUsuario.ts`** — separa padrão do produto, preferências explícitas de `user_config`
  e catálogos inferidos dos dados da própria conta. Origens já presentes em `imoveis` e tipos já
  presentes em `agenda` reaparecem automaticamente nos seletores e no Foco do dia, mesmo quando
  vieram de importação; a inferência fica em memória e não transforma um dado histórico em
  preferência permanente. Dados sensíveis ou contratuais (`dados_pagamento`, empresa e percentual
  de comissão) nunca são inferidos.
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
  **Imóvel IMPORTADO não é imóvel parado** (`Imovel.importado` + `teveAtividadeAposImportacao`).
  Uma planilha traz datas de meses ou anos atrás, e elas são história, não inatividade: ninguém
  deixou o lead parado no painel, o painel é que acabou de conhecê-lo. Sem a marca, a carteira
  importada abre com tudo acusado — medido em 04/08/2026, quando a conta da supervisora recebeu
  583 captações de 2023 a 2026 e o Pipeline exibiu **581 selos de estagnação no primeiro acesso**.
  Card que nasce cheio ninguém lê, e é assim que a faixa de "imóvel parado" morreu no termômetro.
  A marca **não esconde para sempre**, e essa é a metade que importa: vale só até a primeira ação
  de verdade — tentativa registrada, resposta do proprietário ou mudança de status —, e aí o prazo
  religa. Senão ela viraria um jeito de esconder imóvel que não anda, que é o oposto do que o selo
  existe para fazer. A distinção usa a **data** da entrada de status, não a existência dela: a
  importação carimba o histórico com a data antiga da planilha e `aplicarMudancaDeStatus` carimba
  hoje, então comparar com `dataAngariacao` separa as duas sem guardar quando a importação rodou.
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
  A cota aparece como **duas rodadas assistidas de 10**, e não como um saldo abstrato de 20: no uso
  real até 18/08/2026, 7 dos 10 dias com lote pararam em dez envios ou menos, apesar de ainda haver
  fila e cota. A Início mostra somente a fila, a capacidade, o progresso e o botão da rodada; etapas
  da cadência, retorno acumulado e listas completas ficam nas ferramentas próprias para não
  transformar o começo do dia em relatório. Ao abrir a segunda rodada, o modal reaproveita na mesma
  aba os roteiros e textos revisados naquele dia; o rascunho expira na virada do dia e nunca
  altera a Abordagem permanente. Continuar segue exigindo confirmação humana — não há envio
  automático nem mudança nos freios anti-spam.
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
  **A seção 3 também separa a fase da perda**, e pelo mesmo motivo: perder a locação de um imóvel
  que JÁ foi angariado (o não exclusivo que a concorrente alugou, ou o proprietário fechando direto)
  não é "chegamos tarde" — chegamos, e ganhamos. É o motivo `MOTIVO_PERDA_LOCADO_FORA` e o balde
  `MOTIVOS_PERDA_POS_CAPTACAO`; sem ele, cada captação perdida piorava o número que existe para
  diagnosticar o GARIMPO, e o documento se contradizia com a `conversaoCaptacao`, que já lê esse
  imóvel como angariado. Quem separa as duas é `motivoPerdaPelaFase`, no **motor**: "já aluguei" é a
  mesma frase nas duas situações, e quem sabe a diferença é o `statusHistory`.
  **Ela roda na LEITURA, e é aí que ganha o caso real.** Nasceu no webhook (a IA lê uma frase solta
  e não sabe onde o imóvel está no funil), mas o caminho que a carteira usou foi o outro: o LD-123
  foi encerrado À MÃO, no seletor do cadastro, onde os dois rótulos de "chegamos tarde" continuam
  disponíveis e são os que mais se parecem com o que o proprietário escreveu. Corrigindo só na
  escrita, o relatório erraria pelo caminho mais comum e o que já está gravado exigiria migração;
  derivando na leitura, o clique errado de ontem sai certo no documento de hoje — a disciplina de
  `resultadoObservado.ts`. O webhook segue corrigindo também na escrita, e deve: lá o motivo vai
  para o banco e aparece no cadastro, e gravar "chegamos tarde" num imóvel captado mostraria ao
  corretor um rótulo que contradiz a própria tela.
  A regra vive de **três listas concordando sobre a mesma string** e nenhuma importa a outra
  (`MOTIVOS_QUE_DEPENDEM_DA_FASE`, `MOTIVOS_PERDA_IA`, `MOTIVOS_CHEGAMOS_TARDE`): reescrever um
  rótulo desligaria a correção sem erro de compilação, então há teste amarrando as três.
- **`calculo/importacao.ts`** — trazer a carteira de uma planilha. O `csv.ts` só EXPORTA; isto é o
  caminho de volta, para o corretor que chega com 200 imóveis numa planilha e hoje digitaria um a
  um. **O risco que dá forma ao módulo não é o parse** — é o que uma importação em massa faz com o
  resto do sistema, que é exatamente o motivo de a extensão de navegador ter sido descartada em
  27/07/2026: registro sem endereço não geocodifica, some do mapa, é invisível para a duplicidade e
  **mesmo assim** ocupa linha no pipeline disparando `isStale` todo dia. Daí endereço ser
  obrigatório e a linha sem ele ser recusada, em vez de entrar pela metade. Quatro regras:
  **tudo entra como "Novo contato"** (um "Locado" importado somaria à conversão, à comissão e à meta
  um negócio que nunca aconteceu aqui — mesma regra da unidade desdobrada); **o `statusHistory`
  nasce VAZIO**, porque importar não é transição e o motor já cai em `dataAngariacao` quando o
  histórico está vazio; **a data vem da planilha quando existe**, senão `imoveisContatadosNoMes`
  (que conta por `dataAngariacao`) anunciaria "200 contatados este mês" sobre imóveis de meses
  atrás; e **telefone ilegível não derruba a linha, mas não entra** — imóvel sem telefone é
  trabalhável, com telefone errado manda mensagem para um estranho. A duplicata é checada duas
  vezes, contra a carteira **e dentro do próprio arquivo**, porque planilha de verdade tem linha
  repetida. Datas são lidas por manipulação de string (nunca `new Date`): `new Date("10/07/2026")`
  entende mês/dia e joga um imóvel de julho para outubro, silenciosa e plausivelmente.
- **`calculo/solicitacaoAngariacao.ts`** (+ `lib/documentoDocx.ts`, que zipa) — o documento que
  COBRA a comissão, gerado no fim do funil. Quando a captação vira contrato, o corretor manda ao
  financeiro da imobiliária uma "Solicitação de recebimento de angariação de locação", e até aqui
  ela era digitada à mão no Word, uma por locação, recopiando do painel o endereço, as referências
  e o valor. O erro que o gerador evita não é a digitação em geral: é o **endereço sem a unidade**
  (num edifício, "Rua X, 150" não identifica contrato nenhum) e o valor recopiado errado — os dois
  campos que decidem para qual contrato o dinheiro vai. Sai em `.docx` de verdade (o formato que o
  financeiro já recebe) e em texto puro, para colar no WhatsApp.
  Três decisões: a **REF INQUILINO é derivada, e o número tem significado** — ela é
  `<REF PROP>.<NN>`, onde NN é a vez em que o imóvel foi locado (01 = primeiro locatário, 02 =
  segundo), coisa que o `statusHistory` sabe contar, com piso de 1 porque histórico vazio é locação
  fora do app e não ausência de locação; **nada é gravado** (o documento se monta na leitura, a
  disciplina de `resultadoObservado.ts`, então a solicitação de um contrato antigo sai igual à de
  hoje e um acerto de formatação é a edição de uma função); e **uma estrutura só alimenta as três
  saídas** (`linhasSolicitacao` gera o .docx, o texto e a prévia da tela, senão o que o corretor
  confere divergiria do que o financeiro abre, e a divergência só apareceria numa cobrança errada).
  O `.docx` é montado como OOXML à mão porque a fidelidade ao formulário que o financeiro reconhece
  é o ponto; o XML é texto puro e testável, e só o zip (JSZip, por import dinâmico) toca o browser.
  A conta/PIX mora em `user_config.dados_pagamento`, e não no imóvel: é dado do CORRETOR, igual em
  toda solicitação, e um dígito errado manda o dinheiro para outra pessoa. A entrada é o imóvel
  **Locado** (drawer do Pipeline e bloco Comissão do cadastro) — oferecê-la antes convidaria a
  pedir pagamento de uma locação que ainda não existe. A observação padrão diz "via <origem>" e não
  "pelo <origem>": nenhum dado do painel sabe o gênero de um rótulo que o próprio corretor
  cadastrou, e o artigo fixo produzia "pelo Redes sociais".
  **O valor da solicitação NÃO é o aluguel anunciado, e essa é a regra mais fácil de errar aqui.**
  A imobiliária roda uma campanha em que o proprietário define o que quer receber (`valorAluguel`,
  o que vai ao anúncio) e quem paga atrasado paga um acréscimo (`valorAluguelAtraso`). A angariação
  é cobrada sobre o valor **com** o acréscimo: no imóvel da Rua José Francisco Pereira, 800, o
  anúncio é R$ 1.600,00 e a solicitação diz "R$ 1.920,00 – 20% R$ 384,00". São duas contas sobre o
  mesmo contrato, e trocá-las erra o pedido de pagamento em ~20%. Por isso o campo em
  `CamposSolicitacao` chama-se `valorBase` e não `valorAluguel` — o nome antigo era o do OUTRO
  valor, e alimentá-lo por baixo deixaria tudo compilando com o documento errado; quem resolve qual
  dos dois é `valorBaseDaSolicitacao`, num lugar só, para o .docx, o texto e a prévia não poderem
  divergir. Sem valor de atraso gravado cai no aluguel, que é o caso do imóvel fora da campanha.
  **O acréscimo é GUARDADO, nunca derivado por ×1,2**: medido na carteira real, ele é 20% em 278 de
  279 imóveis e **21,6% em um** (ref 02256.001) — derivar poria R$ 1.266,67 onde o certo é
  R$ 1.250,00. E o CRM exporta o valor CHEIO na coluna "Valor do Aluguel", o que já fez 147 imóveis
  entrarem com o valor de atraso no campo do anúncio, inflando a carteira em R$ 47 mil: ao importar
  de lá, o que vale como aluguel é o "Aluguel Líquido".
- **`calculo/filtros.ts`** — filtro/ordenação do Pipeline (parte pura), e o corte entre a carteira
  ATIVA e o que saiu dela. `PipelineViewMode` tem três modos, não dois: além de Lista e Kanban,
  **`retirados`** — o imóvel que o proprietário tirou (`Imovel.retirado`). Não é "Perdido", e a
  diferença importa: ali a captação falhou, aqui ela foi **ganha e depois encerrada**, e o motivo
  nem sempre é conhecido — o CRM da imobiliária registra só "RETIROU", que tanto cobre "locou por
  conta própria" quanto "tirou da imobiliária". Forçá-lo em "Locado" somaria comissão e faturamento
  de um contrato que não é nosso; em "Perdido", diria que a captação falhou.
  O corte mora **no filtro, não na tela**: retirado sai de Lista e Kanban e só aparece na própria
  aba, para o contador "X de Y", o quadro e a tabela concordarem sem cada um lembrar da regra.
  Deixá-lo nas três abas transformaria a aba num filtro decorativo — a carteira continuaria
  anunciando como em jogo o que já saiu (na conta da supervisora, 189 de 640 em 05/08/2026).
  A marca é **campo**, não texto: ela nasce da coluna RECEBIMENTO do CRM na importação, e uma
  busca por "RETIROU" dentro de `observacoes` morreria na primeira edição da observação — além de
  nunca poder marcar imóvel novo.
  **A busca é insensível a ACENTO** (`semAcento`), e os dois lados passam por ela — normalizar só o
  que o usuário digita não resolveria: "Jose" tem que achar "José" no dado gravado. A normalização
  vale só para PESQUISAR; o cadastro continua guardando e exibindo "Rua José Francisco Pereira",
  porque corrigir digitação corrompendo o endereço é pior que o problema. A faixa dos diacríticos
  vai por escape, e não pelos caracteres em si, pelo motivo do `normalizarCabecalho` da importação:
  eles são invisíveis no editor e um salvamento noutra codificação os perderia sem ninguém ver.
  As colunas filtráveis incluem **`unidade`, `bloco` e `telefone`**. As duas primeiras reusam os
  campos que já existem no cadastro — sem elas a Lista mostra dezenas de linhas idênticas de "Rua
  André Gallo, 101", que é a carteira de quem trabalha com apartamento. A de telefone é derivada
  (`temTelefone`) e devolve sempre um dos dois rótulos, nunca vazio: "sem número" é um estado que
  se filtra, não a ausência de dado que viraria "(vazio)". Ao acrescentar coluna aqui, lembre que
  `setViewMode` (em `uiPipeline.ts`) copia os filtros campo a campo — esquecer a nova ali faz o
  filtro sumir ao trocar de aba, sem erro — e que as larguras da Lista são fixadas por `nth-child`
  no `style.css`, então inserir coluna no meio desloca todas as seguintes. `pipeline-colunas.test.ts`
  falha quando cabeçalho, linha e CSS discordam sobre quantas colunas existem.
  O filtro **Identificação dos imóveis** escolhe o rótulo destacado nos cards, na primeira coluna e
  no drawer: código interno ou referência do CRM. A referência só é elegível depois da captação
  (`Angariado`/etapas posteriores ou histórico equivalente); antes disso o código interno permanece
  como fallback, porque o imóvel ainda não existe no CRM da imobiliária. Se o identificador escolhido
  estiver vazio, o outro é exibido para nenhuma linha ficar anônima.
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
  Por isso o Dashboard não mostra uma taxa para escolher portal: o ranking "Portais que mais geram
  angariações" usa somente a contagem absoluta de imóveis da carteira que chegaram a `Angariado`,
  sem dividir por leads, tentativas ou abordagens. A série mensal duplicada saiu dali porque o
  gráfico vizinho já exibe angariados junto dos locados.
- **`calculo/followup.ts`** — elegibilidade e texto do follow-up em lote (os freios que impedem
  o disparo em rajada). A fila que executa é `filaFollowUp.ts`. Ver "Follow-up em lote" abaixo.
- **`calculo/conquistasDoMes.ts`** — o que se move ENQUANTO o mês corre, e o terceiro recorte do
  reconhecimento. Nasceu de um sintoma que o corretor descreveu melhor que qualquer métrica: "quando
  o mês vira, as conquistas não viram junto". Ele tinha razão — em 03/08/2026 a grade de medalhas
  estava congelada (13 angariações no total, todas de julho, próximo degrau em 25, locação parada em
  "0 de 1"), e entre 31/07 e 01/08 não mudava um pixel. Tela de progresso que não se move deixa de
  ser lida, que é o mesmo fim da faixa de "imóvel parado" no termômetro.
  **Mede ESFORÇO, não desfecho**, e isso não é preferência: fazer os desafios do mês medirem
  angariação os deixaria quase tão parados quanto as medalhas (13 em julho INTEIRO), porque em
  captação o desfecho é raro e lento — a mesma razão de `relatorioCompleto.ts` ter uma seção só para
  esforço. O que anda todo dia é tentativa enviada, proprietário respondendo e dia útil trabalhado.
  **Os alvos saíram da MEDIÇÃO** (julho/2026: 209 tentativas, 26 proprietários distintos
  respondendo, 16 dias úteis seguidos com atividade): cada escada tem o primeiro degrau caindo na
  primeira semana e o topo pouco acima do melhor mês observado. Alvo inventado erra dos dois lados —
  alto demais nunca acende, baixo demais acende no dia 2 e a tela volta a ficar parada, que é o
  problema que o módulo existe para resolver. Foi por isso que o topo da constância subiu de 15 para
  21 ao ser conferido contra a carteira: com 15 ele **nasceria conquistado**.
  Três regras: **respostas conta PROPRIETÁRIOS, não mensagens** (um dono mandou 64 sozinho em julho;
  contar mensagem encheria a barra por causa de uma conversa — a mesma unidade da caixa de
  respostas); **a constância ATRAVESSA o mês**, sozinha entre as quatro, porque zerar dia 1º diria
  "1" a quem trabalhou vinte dias seguidos, e constância medida em pedaços de calendário não é
  constância; e **o dia de hoje não conta contra** até somar, senão às 9h da manhã a sequência de
  dezesseis dias morreria por o corretor ter acordado cedo. Sem meta definida o desafio de meta não
  aparece, pela razão de `projecao.ts` (contra meta zero, todo card nasce "concluído").
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
- **`calculo/sistemaPrincipal.ts`** — a ponte com o **Sistema Principal (Sophia)**: ler o evento,
  achar a angariação, aplicar. Também os sete indicadores "da assinatura ao pagamento" do
  Dashboard, que contam a CARTEIRA e não a captação (uma sala desdobrada não é angariação nova, mas
  tem contrato e comissão próprios — e é dinheiro que esta seção mede), e a leitura do log para a
  tela de auditoria (`linhaDoHistorico`). Ver "As rotas de servidor → `api/sophia/eventos`"
  adiante, que é onde estão as decisões. O contrato para quem integra do outro lado está em
  [INTEGRACAO_SOPHIA.md](INTEGRACAO_SOPHIA.md) — **ao mexer em payload, casamento ou código de
  resposta, aquele documento tem que mudar junto**: ele é escrito para quem não lê este código, e
  desatualizado ele não é incompleto, é errado.
- **`calculo/timeline.ts`** — a evolução do imóvel numa lista só, do cadastro ao pagamento da
  comissão. **Nenhum dado novo**: deriva de `dataAngariacao`, do `statusHistory` e dos campos que a
  integração carimba, na LEITURA — a disciplina de `resultadoObservado.ts`. Três decisões:
  **tentativa e resposta ficam de FORA** (na carteira real há imóvel com 74 mensagens e outro com 3
  tentativas; misturar isso com os quatro marcos faria o marco virar agulha em palheiro — a
  reincidência exata do que matou a faixa de "imóvel parado" no termômetro, e por isso a lista é de
  MARCOS, coisas que aconteceram uma vez e mudaram o estado do negócio); **a data do FATO vence a
  data em que o painel soube** (o `statusHistory` guarda quando o evento chegou, `autorizacaoAssinadaEm`
  guarda quando o proprietário assinou, e as duas divergem sempre que a integração é religada
  depois do fim de semana — uma linha do tempo com a data do nosso servidor conta a história errada);
  e **a assinatura aparece UMA vez**, embora exista em três lugares ao mesmo tempo (etapa do funil,
  campo e nota `sophia:`) — daí a nota nem ser consultada ali, e o campo entrar só como correção da
  data da etapa que já existe.
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
  Desde 2026-08-17, o mesmo `notas` é também o **histórico bidirecional** de WhatsApp: entradas novas
  carregam `direcao`, `autor`, `tipo` e `origem`. Mensagens recebidas antigas continuam reconhecíveis
  por `wa:<id>`; não há migração que invente saídas que nunca foram armazenadas. Envios diretos,
  agendados e confirmações `fromMe` usam o mesmo append idempotente no banco.
  Conversas que aconteceram **antes do cadastro do imóvel** podem ser trazidas manualmente em
  Histórico de interações → *Importar conversa recente*. A tela primeiro pede uma prévia à rota
  `api/whatsapp/importar-conversa`; o servidor autentica o usuário, relê telefone e instância de
  fontes confiáveis, consulta `chat/findMessages` e filtra de novo pelo telefone canônico — não se
  confia no filtro da Evolution, que já foi ignorado por algumas versões. Somente depois da seleção
  a rota relê o histórico e grava até 30 mensagens por `registrar_nota_imovel`; texto vindo do
  browser nunca é persistido como fala do proprietário. Entradas retroativas usam os prefixos
  `wa-contexto-recebida:`/`wa-contexto-enviada:` e origem `importacao-evolution`: o agente de
  atendimento as lê, mas `ehNotaDeResposta` deliberadamente não. Portanto elas **não** criam
  pendência, status, agenda, tentativa nem efeito retroativo no ranking. Mensagem LID só entra se
  houver `remoteJidAlt` numérico que confirme o contato ou se o id de uma mensagem que o webhook já
  vinculou àquele imóvel servir de âncora para o LID. Essa segunda ponte cobre a troca de identidade
  que ocorre quando o contato é salvo depois do início da conversa; um LID global sem âncora
  verificável continua descartado.
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
  O mesmo módulo filtra busca/bairro/status/responsável/origem/período, evita inflar captações com
  unidades desdobradas e produz a leitura territorial que a IA apenas interpreta; ela não calcula
  nem escolhe bairros sobre os dados crus.
- **`calculo/focoDia.ts`** — fila determinística das próximas ações; a **Início exibe somente a
  primeira**, porque mostrar a fila inteira transforma prioridade em backlog: respostas pendentes,
  compromissos vencidos/de hoje, imóveis estagnados e prospecção. A pontuação e a ordem são do motor,
  com no máximo uma ação por imóvel; a IA pode explicar a fila, mas não inventá-la nem reordená-la.
  Quando a ação já identifica um imóvel estagnado, a Início abre o caso diretamente; respostas e
  agenda continuam nas filas próprias. O Dashboard permanece como leitura analítica, sem duplicar o
  plano operacional. Abaixo da ação e da rodada, a Início mantém apenas um panorama compacto e
  clicável de Conversas, Agenda, Pipeline e meta de angariações; não repete listas nem relatórios.
- **`calculo/avaliacao.ts`** — motor determinístico da **Avaliação Rápida** (`/avaliacao`). A V3
  combina a carteira com a base durável `comparaveis_mercado`. Na base externa, filtros de usuário,
  finalidade, cidade, família de tipo, área e quartos são aplicados no Postgres antes da ordenação
  vetorial; durante o preenchimento gradual, resultados estruturados complementam uma amostra
  vetorial pequena. O score expõe separadamente similaridade estrutural, semântica e
  comparabilidade final. O embedding só seleciona/reordena comparáveis: o peso do preço continua
  estrutural. Quando há ao menos três opções na mesma rua, elas prevalecem sobre as demais do
  bairro. Depois o motor ajusta parcialmente por área, remove outliers por mediana/desvio absoluto
  e usa mediana ponderada por estrutura, recência, estágio e origem para produzir faixa,
  recomendação e confiança. Preço externo é valor pedido, recebe peso menor e sozinho nunca produz
  confiança alta. A expectativa do proprietário é comparada somente depois e nunca entra no preço.
  Como `imoveis` e a base externa só têm locação, venda responde dados insuficientes. Área ausente
  não é inventada. Cada execução grava em `avaliacoes_imoveis` uma fotografia imutável da entrada,
  versão da metodologia e comparáveis utilizados.
- **`calculo/comparaveisMercado.ts` · `servidor/comparaveisMercado.ts` ·
  `api/avaliacao/comparaveis`** — identidade, representação semântica, ingestão e busca híbrida dos
  anúncios observados. A identidade aceita, em ordem, portal+código, URL canônica ou fingerprint
  forte; preço não faz parte dela. `observacoes_comparaveis_mercado` é append-only e conserva
  anúncio novo, mudança de preço/status, reaparecimento e confirmação diária. Ausência nunca prova
  locação ou venda. O texto do embedding tem ordem e versão fixas; seu SHA-256, modelo e dimensão
  impedem geração repetida e comparação entre modelos diferentes. A V3 usa pgvector/HNSW com 512
  dimensões. Sem `OPENAI_API_KEY`, falha de geração ou RPC ainda não aplicada, a busca estruturada
  da V2 continua funcionando.
- **`calculo/centralAngariacao.ts` · `radarAngariacao.ts`** — contratos e regras da Central/Radar.
  Resultado de portal não é `Imovel` e só chega à carteira após revisão humana. As buscas cobrem
  OLX, Chaves na Mão, Wimoveis e Viva Real; o Radar persiste filtros e anúncios novos em tabelas
  próprias, com unicidade por busca/portal/id externo e intervalo mínimo de duas horas.
- **`calculo/duplicidade.ts`** — detecta imóvel já cadastrado. A identidade é
  `endereço + cidade + unidade + bloco`, comparada por chave normalizada (grafia, acento,
  pontuação e abreviação de logradouro não contam). `unidade`/`bloco` fazem parte da identidade
  de propósito: no mesmo prédio o ap 101 e o ap 202 são imóveis **diferentes**. O modal **avisa,
  não bloqueia** — recadastrar às vezes é proposital (um "Perdido" que voltou a atender).
- **`persistencia/mapeadores.ts`** — `toDb*`/`fromDb*` que traduzem entre o camelCase do app e o
  snake_case do Supabase. Definem o contrato de dados.
- **`persistencia/supabase.ts`** — cliente singleton do browser. **`persistencia/carregarEstado.ts`**
  — o `loadState()`: busca as 6 tabelas em paralelo no login. Erro em `user_config`, `abordagens` ou
  `protocolos` **não** derruba o carregamento (o app inteiro funciona sem eles); erro nas outras
  três propaga.
- **`persistencia/avaliacoes.ts`** — fronteira tipada e isolada do histórico de avaliações. Faz
  somente `select`/`insert`; a UI aguarda a gravação antes de publicar o resultado, e a RLS também
  valida que o `imovel_id` opcional pertence ao mesmo usuário.
- **`store.ts`** — store Zustand espelhando o `STATE` legado, mais o catálogo de abordagens e os
  protocolos da imobiliária (`{ imoveis, metas, agenda, abordagens, protocolos, config }`).
- **`mutacoes.ts`** — escritas do estado central no Supabase num só lugar (criar/editar/excluir
  imóvel, metas, agenda, abordagens, tentativas, verificação, config, dados demo). Mensagens
  agendadas, Radar e integrações têm fronteiras próprias porque não pertencem ao store central.
  No cliente, `aplicarMudancaDeStatus()` é o ponto único de transição; o trigger do schema é a rede
  final que protege o histórico contra outros caminhos, inclusive integrações.
- **`uiPipeline.ts` / `uiModal.ts`** — estado de UI (filtros/drawer do Pipeline; modal ativo).
- **`filaFollowUp.ts`** — a fila do follow-up em lote (estado + orquestração dos envios). Como o
  `mutacoes.ts`, é exceção consciente à regra abaixo: orquestra efeitos, não calcula.
- **`rascunhoFollowUp.ts`** — escolhas de roteiro/texto das duas rodadas do dia. Vive só na aba,
  separado da fila e do Supabase, e descarta o dia anterior ao receber a primeira escolha nova.
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
- **`calculo/custoIa.ts` · `calculo/admin.ts`** — o painel de quem OPERA o sistema (não de quem usa):
  tokens virando dinheiro e o estado de cada corretor. Ver "O super admin" adiante — inclusive a
  regra de que modelo sem preço devolve `null`, nunca zero.
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
O `components/assistente/Assistente.tsx` é montado no layout autenticado e sobrevive à navegação.
Seu acionador e painel podem ser arrastados; apenas a posição do acionador é preferência local do
dispositivo. Resultados do Assistente são renderizados em blocos estruturados e Markdown seguro.

### Invariante do `statusHistory`

A posição atual mora em `status`; a verdade histórica sobre por onde o imóvel passou mora no
**`statusHistory`**. No cliente, toda transição usa `aplicarMudancaDeStatus()`. No banco, o trigger
`proteger_status_history_imovel` impede que uma edição comum apague ou reescreva a trilha e acrescenta
atomicamente a transição quando qualquer caminho altera `status`. Em sessão autenticada, a autoria
vem de `auth.uid()`; integrações com service role podem preservar `authorName` e `source`, como
`sophia`.

As primeiras entradas em **Angariado**, **Publicado** e **Locado** são marcos permanentes, mesmo que
o status atual avance ou mude depois. Angariado e Publicado usam a primeira entrada correspondente;
Locado prefere `locadoEm`, data real confirmada pela Sophia, e cai para a primeira entrada em Locado.
Reentradas continuam no histórico. Não existe backfill inventado: legado sem transição datada
permanece incompleto. `foiAngariado()` só reconhece a passagem real por Angariado; cadastrar ou
contatar não conta como captação concluída.

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
  Vive na tabela `abordagens` (catálogo por usuário) e pode declarar as **origens** de imóvel que
  atende (`origens`, jsonb), que é como o follow-up em lote sabe qual texto mandar para cada pedaço
  da fila (ver "Um lote não é uma conversa só"). Arquivada não declara nada: ela sai dos seletores,
  e pré-selecionar um roteiro que o corretor não consegue trocar seria pior que não sugerir.
  **Não confundir** com `imovel.formaAbordagem`,
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

**Tentativa registrada ≠ tentativa de ALCANCE, e contar tudo junto mente.** A lista guarda duas
coisas diferentes: o esforço para conseguir falar com o proprietário e as réplicas de uma conversa
já aberta. Elas moram juntas de propósito — o webhook precisa de uma tentativa em aberto para
pendurar a classificação da resposta que chega —, então quem conta ESFORÇO separa na leitura, com
`tentativasDeAlcance` (as anteriores à primeira mensagem do proprietário). Nasceu do LD-178
(31/07/2026): uma abordagem enviada, a proprietária respondeu, o corretor treplicou duas vezes pelo
painel e o card anunciava **"3ª tentativa"** — a leitura exata oposta da realidade, e justamente
sobre a conversa mais bem-sucedida da carteira. As réplicas saíram como "Primeiro contato" porque é
o modelo que o modal pré-seleciona para o status "Novo contato", e ele está em `MODELOS_CAPTACAO`.
Medido no mesmo dia: dos 34 imóveis com 2+ tentativas, só 2 mudam — os outros 32 são silêncio de
verdade, inclusive o LD-55, com 3 tentativas TODAS anteriores à resposta, que segue dizendo "3ª".
O corte **não** é "respondeu → esconde o selo": quem só respondeu na 3ª cutucada levou 3 cutucadas.
Quem exibe contagem de registros (o drawer do Pipeline diz "3 tentativa(s) registrada(s)", ao lado
do botão que abre a lista das 3) **não** usa esta função — ali filtrar faria a linha contradizer a
lista que ela mesma abre.

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

Hoje há quatro origens, e a diferença entre elas é o que mantém o ranking honesto:

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
- **`DISPONIBILIDADE_STATUS_ALVO` é a régua dos DOIS lados** (`deveTerVerificacaoAberta`): quem entra
  na fila do lote é exatamente quem tem lembrete em aberto, e `salvarImovel` cria ou cancela por ela.
  Antes eram dois critérios diferentes, e ambos erravam para o mesmo lado: cancelava só em "Locado",
  então imóvel dado como **Perdido ficava com o lembrete aberto** (o LD-123 real, encerrado em
  01/08/2026 e ainda cobrando "confirme se segue disponível" em 20/09 — com direito a evento no
  Google Agenda); e criava por `foiAngariado()`, que lê o HISTÓRICO e **nunca deixa de ser verdade**,
  então encerrar um imóvel captado podia AGENDAR um lembrete novo pedindo a disponibilidade de algo
  que acabara de sair da carteira. Ler o status ATUAL é o que faz a regra se corrigir sozinha nos
  dois sentidos.

**Um lote não é uma conversa só** (`calculo/lotePorOrigem.ts`). O que se pode AFIRMAR ao proprietário
depende de como o imóvel foi achado: anúncio em site de outra imobiliária está declaradamente para
locação, e do Copel só se sabe que o imóvel está **desocupado** (pode ser para venda, pode ser o dono
voltando a morar). O lote tinha um seletor para as dez mensagens, e a fila ordena por sinal e
antiguidade, que não sabem nada de origem: em 03/08/2026, entre 12:31 e 12:36, quatro proprietários
de imóvel apenas desocupado receberam "vi que o imóvel está disponível para locação", que é uma frase
falsa na primeira linha que aquela pessoa lê da imobiliária. No mesmo dia o envio individual
acertava (22 das 26 tentativas em imóveis do Copel usavam o roteiro escrito para imóvel vazio) — quem
misturava era só o lote. A regra é uma: **um texto nunca cobre duas origens diferentes, a menos que
uma abordagem declare que serve as duas.** Três consequências:

- **Quem junta origem com roteiro é a DECLARAÇÃO do corretor** (`Abordagem.origens`), não uma tabela
  de premissas no código. Foi medido: das 61 pessoas elegíveis naquele dia, 22 estavam em origens que
  ele mesmo criou (Copel desocupado, Chaves na mão, Wimoveis) — Copel inclusive, que é o caso que deu
  origem a tudo. Constante nossa nenhuma conhece esses rótulos, então uma tabela fixa erraria
  justamente onde importa. Como as origens que compartilham um roteiro declarado viram **um** grupo, a
  declaração é também o que transforma oito origens em três conversas.
- **Sem declaração, um grupo por origem.** É o pior caso aceitável: mais escolhas para o corretor e
  nenhuma mistura silenciosa. Nunca um texto só para todos, que era o comportamento antigo.
- **Pré-selecionar aqui não contradiz "o lote não pré-seleciona a recomendada".** Lá quem escolheria
  era o ranking, e a sugestão se autoconfirmaria (o sugerido é usado, o usado sobe). Aqui quem
  escolheu foi o corretor, uma vez, ao dizer que aquele roteiro serve aquela origem — e por isso
  **duas** abordagens declarando a mesma origem também não pré-selecionam nada: aí o app voltaria a
  estar adivinhando. O lote de **disponibilidade** segue com texto único de propósito: "seu imóvel
  ainda está disponível?" vale igual para todo imóvel já captado, e a origem só muda o que se pode
  afirmar na ABERTURA da conversa.

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
- **Um seletor por GRUPO DE ORIGEM, e um só dentro do grupo** (`calculo/lotePorOrigem.ts`). Dentro
  do grupo vale a regra antiga: a abordagem é ao mesmo tempo o texto que sai (o `roteiro`) e o
  `abordagemId` que fica registrado na tentativa, e dois seletores permitiriam divergir "o que eu
  disse" de "o que eu anotei que disse", fazendo o ranking medir ficção. Por isso o
  `ItemFila.abordagemId` é **por item**: com um id só para os dez, metade das tentativas creditaria
  um roteiro que aquele proprietário nunca leu.
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

### Mensagens agendadas

Mensagens programadas não são itens da Agenda. Vivem em `mensagens_agendadas`, têm os estados
`agendada`, `processando`, `enviada`, `erro` e `cancelada`, e aparecem na view `/mensagens`. Podem ser
criadas pelo corretor ou a partir do fluxo de disponibilidade.

Regras permanentes:

- o browser escolhe o imóvel, mas o trigger do banco relê nome/telefone da linha pertencente ao mesmo
  `user_id`; payload de cliente não escolhe arbitrariamente o destinatário;
- nome e telefone são fotografados no agendamento, preservando o que seria enviado mesmo se o
  cadastro mudar depois;
- `claim_mensagens_agendadas` usa `FOR UPDATE SKIP LOCKED`, de modo que execuções concorrentes não
  obtêm a mesma mensagem;
- o worker aceita no máximo a janela de dez minutos. Atraso maior vira `janela-expirada`; nunca envia
  de surpresa hoje uma mensagem prometida para ontem;
- o Supabase `pg_cron` chama `/api/cron/mensagens` a cada minuto com `CRON_SECRET`. O worker usa
  service role, busca a instância do próprio `user_id`, envia sequencialmente e persiste a saída no
  histórico bidirecional;
- falha de persistência após envio não recoloca a mensagem na fila, evitando duplicidade real.
- excluir um imóvel chama `excluir_imovel_com_dependencias`: na mesma transação bloqueia a fila,
  remove mensagens `agendada`, exclui a agenda vinculada e só então exclui o imóvel. Se um envio
  já está `processando`, a exclusão inteira falha para nunca concluir em paralelo ao efeito externo.
  Mensagens concluídas permanecem como histórico, com a fotografia do destinatário; o worker ainda
  relê o estado imediatamente antes do envio para descartar um item removido do lote em memória.

Configuração e verificação do job ficam em [DEPLOY.md](DEPLOY.md); não presuma que aplicar o schema
sozinho cadastrou URL e segredo no Vault.

### Modelo de RLS

Supabase (Postgres + Auth) é o backend dos **dados**. O CRUD normal do painel usa o cliente
autenticado diretamente; rotas participam quando há secret, integração externa ou trabalho
privilegiado. O isolamento do acesso de usuário é definido pelas políticas RLS
(`auth.uid() = user_id`) em `supabase-schema.sql`. O schema também declara os grants da Data API:
`anon` não acessa tabelas; `authenticated` recebe apenas as operações usadas pelo browser; tabelas
de credenciais, administração e auditoria ficam exclusivas da service role no servidor. Grants não
substituem RLS. Ao adicionar dado user-scoped, ele precisa de políticas RLS no mesmo padrão,
tipo explícito e tradução consistente entre banco e domínio — nos dados centrais, pelo par
`toDb*`/`fromDb*` em `web/lib/persistencia/mapeadores.ts`; features isoladas podem ter adaptadores
tipados próprios. Tabelas que guardam secrets (`whatsapp_instancias`, `google_contas`, `admins`) não
ganham políticas de cliente apenas para facilitar uma tela: são acessadas por rotas autenticadas.

**Ao consultar o banco por fora do app — SQL editor, MCP do Supabase, service role — a RLS não
vale, e o banco tem mais de uma conta**: a real do corretor, a de teste do `seed-teste.mjs` e
sobras de experimentos. **Toda consulta administrativa leva `where user_id = '...'`.** Não é
zelo: em 27/07/2026 uma análise de conversão por origem foi montada sem esse filtro, misturou as
contas e foi apresentada ao corretor com números de seed dentro — inclusive imóveis "Locado" numa
carteira que nunca locou nenhum. Quem pegou o erro foi ele. Número estranho na análise (locação
onde não devia haver, angariação demais) é sintoma disto antes de ser sintoma de bug no cálculo.

### As rotas de servidor e integrações privilegiadas

São as exceções ao acesso normal do browser. Uma rota deve proteger segredo, autenticar uma chamada
externa, executar trabalho com service role ou oferecer uma fronteira de custo/segurança que não
pode ser confiada ao cliente. Código que não satisfaz um desses critérios deve permanecer no núcleo
ou no cliente.

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

#### `api/whatsapp/conexao` — o corretor reconecta o próprio número

O número cai — a sessão do WhatsApp Web expira, o celular fica dias sem internet, alguém
desconecta o aparelho pareado. Até aqui o corretor **não sabia**, descobria pelo toast de falha no
meio de um lote, e a única saída era alguém com acesso ao painel da Evolution ler o QR Code por
ele. Esse último passo é o que trava a operação com mais de um corretor: aquele painel tem as
instâncias de todo mundo.

**A decisão que dá forma à rota: ver e reconectar o próprio número não precisa da global api key.**
Criar e apagar instância precisa — e isso continua fora do app, com quem opera. Perguntar o estado
e pedir o QR funcionam com o **token daquela instância**, que já vive em `whatsapp_instancias` e já
é lido pela rota de envio. Nenhum poder novo entra no sistema por causa de uma tela de
conveniência. O token, claro, não volta ao browser: a rota o usa e devolve só estado e QR.

**O que fala com a Evolution mora em `api/whatsapp/_conexao.ts`** (o `_` o mantém fora do
roteamento), compartilhado com `api/admin/conexao` — mesmo papel de `_espelho.ts` no Google. A
duplicação seria especialmente traiçoeira aqui porque as três sutilezas abaixo foram **medidas**,
não lidas na documentação: uma segunda cópia escrita a partir dos docs nasceria com o campo
"conectado como…" eternamente vazio, sem erro nenhum. Há teste estrutural fixando que os três
endpoints da Evolution são chamados de um arquivo só. O `pedirQr` é parâmetro porque pedir o QR faz
a Evolution **começar a parear**: faz sentido na tela de um corretor reconectando, e seria
disparar pareamento em série numa varredura de todas as contas.

Três coisas medidas contra a Evolution real em 01/08/2026, e não deduzidas da documentação:

- `connectionState` devolve `{instance:{state}}` — **sem `owner`, sem número**. O campo "conectado
  como…" teria ficado eternamente vazio, sem erro nenhum. O número sai de `fetchInstances`, e por
  isso ele só é consultado quando o estado JÁ é "conectado" (a única hora em que a tela o exibe, e
  quando o intervalo de consulta é o longo).
- A resposta de `fetchInstances` **inclui o token da instância**. Só `ownerJid` sai de lá — é a
  razão de `identidadeConectada` devolver uma string, e não o objeto para o chamador escolher.
- O QR aparece em formatos diferentes conforme a versão (`base64`, `qrcode.base64`, `code`), daí
  os três serem tentados. `qrParaImagem` normaliza o prefixo `data:`, senão a imagem quebrada só
  apareceria em produção.

Duas regras no cliente (`calculo/conexaoWhatsapp.ts`, puro e testado): **QR não aparece em
"conectando"** — ali ele já foi lido e a sessão está subindo; mostrar outro faz o corretor escanear
de novo, e o segundo pareamento derruba o primeiro, prendendo-o num laço. E **o intervalo de
consulta depende do estado**: rápido só enquanto algo muda, zero quando insistir não muda nada
(sem instância, sem ambiente) — cada consulta ocupa a mesma instância que precisa estar livre para
enviar.

#### `api/whatsapp/webhook` — a resposta do proprietário chegando

É a rota de entrada da Evolution: a **Evolution** chama quando uma mensagem chega ou uma saída
`fromMe` é observada no número do corretor. É o que fecha o buraco que o `aguardandoResultado` tapava na
marra — antes o app enviava e ficava cego, e o desfecho dependia de alguém lembrar de anotar.

O webhook hoje recebe os dois sentidos. Entrada do proprietário segue o fluxo de nota, transcrição,
classificação, encerramento seguro e agenda; evento `fromMe` confirma uma saída e a acrescenta ao
mesmo histórico. A rota `api/whatsapp/enviar` persiste a mensagem somente depois de a Evolution
confirmar o envio, e o worker de mensagens agendadas faz o mesmo. Todos usam o id real retornado pela
Evolution e `registrar_nota_imovel`, cujo append idempotente evita duplicar o envio quando API e
webhook observam a mesma mensagem. Se a mensagem saiu mas o append falhou, ela não é reenviada: o
webhook ainda pode recuperar o histórico, e duplicar uma mensagem real seria pior que uma lacuna.

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
- **Ela classifica a CONVERSA, não a frase** (`MAX_MENSAGENS_CONTEXTO`). Cada mensagem do WhatsApp é
  um evento próprio, então uma classificação por evento é uma classificação por pedaço de recado. No
  LD-110 (03/08/2026) o proprietário mandou "Boa tarde", "Por hora, não tenho interesse" e "Já está
  em negociação para venda" em três mensagens: nenhuma delas encerra o imóvel sozinha — a segunda é
  recusa mole pelo próprio prompt, e a terceira, isolada, é um fato sobre o imóvel e não uma resposta
  ao corretor —, e o imóvel ficou em "Novo contato" com a recusa escrita no histórico. Partir um
  recado em três mensagens curtas é o normal do WhatsApp, a mesma observação que fez a chegada de
  resposta virar UM aviso e o compromisso automático ter trava de um por imóvel/dia. As anteriores
  vão ao prompt como CONTEXTO, nunca como alvo: quem se classifica é sempre a mais recente, e
  encerrar por causa de uma mensagem antiga que a última não confirme é proibido no texto do prompt.
  Elas saem das notas lidas antes de a nota desta mensagem ser gravada, filtradas por
  `ehNotaDeResposta` + `ehSoMidia` — marcador de mídia não desambigua nada, e a nota de encerramento
  é fala nossa.
  O mesmo caso mostrou uma lacuna de VOCABULÁRIO: nenhum `MOTIVOS_PERDA_IA` cobria "vai vender em vez
  de alugar", e "Imóvel já vendido" seria falso enquanto a venda não fecha. Hoje isso é
  "Proprietário desistiu de alugar" — o fato que interessa é a locação que não vai acontecer, não a
  venda que aconteceu.
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

  A **confirmação de visita** tem também um caminho determinístico, sem depender de a IA extrair
  uma data de um “ok”. Ao escolher esse modelo, o corretor informa dia e horário; os dois viajam
  como `confirmacaoVisita` na nota da mensagem efetivamente enviada. Somente uma confirmação curta
  e inequívoca na resposta imediatamente posterior promove a intenção para a Agenda. Uma saudação
  isolada pode precedê-la, porque “Bom dia” + “ok” costuma chegar em dois eventos; pergunta, recusa,
  remarcação, resposta ambígua, data passada, nova mensagem do corretor ou “ok” sem esse metadado
  não criam compromisso. A criação continua usando a mesma trava por imóvel/dia e o mesmo
  espelhamento painel → Google Agenda dos demais compromissos automáticos.
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
  indisponibilidade definitiva, recusa terminal ou exclusividade vigente explicitamente informada),
  o imóvel vai para **Perdido** com o motivo, sem clique. **Outra imobiliária, sozinha, não é
  perda:** a classificação permanece aberta e uma trava determinística descarta o motivo
  `Optou por outra imobiliária` sem evidência textual de exclusividade vigente (ou de locação já
  concluída pela outra empresa). O que
  segura isso é o motivo sair de uma lista fechada e **menor** que `MOTIVOS_PERDA`
  (`MOTIVOS_PERDA_IA`, sem os que exigem julgamento), só valer junto de `recusou`, e uma segunda
  nota explicar na tela por que o status mudou — senão o imóvel sairia da carteira e a única
  explicação estaria no log do servidor. “O imóvel não está mais disponível” também encerra, mas
  com um motivo genérico próprio: a frase prova o encerramento, não se ele foi alugado, vendido ou
  retirado. Mencionar venda, informar seu preço ou aceitar propostas **não prova desistência da
  locação**: as duas modalidades podem coexistir, e `Proprietário desistiu de alugar` exige uma
  retirada inequívoca no próprio texto (“não vou mais alugar”, “somente venda”). Marcas de
  provisoriedade (“por enquanto”, “no momento”, “talvez”) mantêm o imóvel aberto.
  **Nunca vira "Locado":** "já aluguei por conta própria" é
  PERDA, e marcá-lo como ganho somaria à conversão, à comissão e à meta do mês um negócio que não
  existiu.
  Prazo relativo curto que completa uma conversa sobre disponibilidade ou visita (por exemplo,
  "daqui 10 dias") tem fallback determinístico: se a classificação não trouxer data, cria um
  compromisso de **retorno** no dia calculado, sem fingir que uma visita ou horário já foi combinado.

#### `api/ia` — operações especializadas de IA (OpenAI)

A rota atende operações tipadas: roteiros e ranking, análises de Dashboard/Mapa/Foco, extração e
geração de anúncio, abordagem de anúncio e atendimento ao proprietário. O fluxo espelha o do
WhatsApp — `lib/ia.ts` (browser) → a rota (servidor) → OpenAI. Tipos conhecidos passam pelo
`lib/servidor/ia/dispatcher.ts`; cada domínio pode ganhar um handler especializado sem transformar a
rota em outro monólito. Operações ainda não extraídas permanecem no fluxo legado da rota.

A chave (`OPENAI_API_KEY`, **sem** `NEXT_PUBLIC_`) é cobrada por token consumido. Sem ela o app
não quebra: os botões respondem "não configurado" e o resto segue igual.

O executor OpenAI está isolado em `lib/servidor/ia/executor-openai.ts`; prompts, esquemas e contratos
de domínio não importam o SDK. O modelo textual único é `MODELO_TEXTO_IA` em
`lib/servidor/ia/config.ts`, atualmente `gpt-5.4-mini`. O modelo de transcrição é independente.

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

> Este tipo de chamada continua sendo o extrator **manual** de texto colado: ele não busca portal nem
> automatiza chat. Central/Radar são uma fronteira separada, com coleta e revisão próprias.

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

**Responder é EMENDAR, não recomeçar** — e isso vale nas duas camadas e no que a tela
pré-seleciona. Nenhuma réplica cumprimenta: elas abriam com "Olá, Fulano!" (saudação leve, já sem o
"Tudo bem?"), e não bastou. No LD-185 (04/08/2026), depois de cinco mensagens trocadas no mesmo dia,
a sugestão saía "Olá, Johann Diego Lima dos Santos!" — cumprimento no meio de conversa viva, com o
nome do cadastro inteiro. Hoje o nome entra como vocativo dentro da frase e só o PRIMEIRO. Pela
mesma razão a caixa **não cai mais no modelo por etapa do funil** quando não há classificação: aquele
padrão vem do Pipeline, onde a conversa pode nem ter começado, e ali ela sempre começou — a linha só
existe porque a pessoa escreveu. Ele propunha abertura no meio de conversa aberta ("Olá, Fulano! Tudo
bem?" mais o início da divulgação no LD-156, que tem 74 mensagens) e, em "Perdido"/"Sem resposta",
afirmava o falso: "não consegui retorno" para quem tinha acabado de responder. Eram 9 dos 32 imóveis
com resposta. O botão abre **em branco** (sem modelo, logo sem creditar tentativa) e o seletor segue
ali para quem quiser um modelo.

- **Camada 1 — réplica pronta, SEM IA** (`sugestaoRespostaModelo` em `calculo/whatsapp.ts`). O
  webhook já classificou a resposta e guardou o desfecho em `tentativa.sugestaoIa`; a camada 1 só
  traduz aquele desfecho num modelo de réplica: `motivoPerda`/`recusou` → encerramento cordial;
  `agendou` → confirmar; `vai-retornar` → aguardar; `numero-errado` → desculpar engano. São 4
  modelos do sistema NOVOS, **fora de `MODELOS_CAPTACAO`** (não são pitch — não registram tentativa
  nem entram no ranking). O botão "Responder (sugestão)" abre o `ModalWhatsapp` já preenchido. O
  `"respondeu"` genérico (uma dúvida, uma pergunta, "não entendi", "sou o proprietário") devolve
  `null` de propósito. Quando a IA está disponível e há texto, a camada 2 tem prioridade também
  sobre réplicas de recusa, retorno e agendamento; elas continuam visíveis como fallback. Número
  errado permanece determinístico.

- **Camada 2 — rascunho por IA** (`tipo: "rascunhar-resposta"`). Para o `"respondeu"` genérico, o
  botão "✨ Rascunhar resposta (IA)" chama a rota, que **relê a última mensagem do proprietário do
  BANCO** (a nota do webhook, com o token de quem chamou) — o browser manda só o `imovelId`, nem o
  alvo do rascunho ele escolhe. É a forma mais forte da regra "o conteúdo sai do banco": mais rígida
  que a extração de anúncio, que aceita texto colado. A saída é objeto **fechado** (`mensagem` e
  `protocolosUsados`) e cai no `ModalWhatsapp` **editável** (prop `textoInicial` + `abrirWhatsappRascunho`
  no `uiModal`), sem modelo associado — logo não credita tentativa. **A IA sugere, o corretor
  confirma:** nada sai sozinho.

  **O rascunho continua a conversa, não a recomeça.** O histórico bidirecional fornece mensagens do
  proprietário e do corretor em ordem; são selecionadas até 12 anteriores mais a mensagem atual.
  Fora dessa janela, uma seleção pura e auditável recupera até quatro mensagens antigas por
  sobreposição de termos e marcos de negociação (taxa, exclusividade, reparos, ocupação, visita,
  autorização), sem embeddings nem memória persistida. IDs acompanham as mensagens para a decisão
  poder declarar evidências; mensagens recentes prevalecem em contradições.
  Somente no legado sem saída textual persistida o handler reconstrói a última abordagem/modelo a
  partir da tentativa. Saudação, reapresentação e repetição da oferta no meio da conversa continuam
  proibidas.

  Desde 2026-08-15, esse fluxo é o primeiro **agente especializado** da rota `/api/ia`. O domínio
  puro vive em `lib/ia/atendimento/`; o handler em `lib/servidor/ia/handlers/atendimento.ts` executa
  três etapas separadas: decisão (intenção, objeção, estado conversacional, informação já explicada,
  ação esperada, próximo passo permitido, ações proibidas, evidências, protocolos, lacunas e confiança),
  geração e validação independente. Confiança baixa, falta de informação, protocolo inadequado ou
  validação reprovada bloqueiam o rascunho e pedem intervenção humana. Diagnósticos operacionais
  registram apenas contagens, classificações e fingerprint — nunca conversa, prompt ou raciocínio.

  A IA recebe somente fatos tipados do imóvel (endereço/unidade/localização, tipo, quartos,
  banheiros, vagas, valores, autorização, pausa, responsável, origem e histórico de estágio quando
  cadastrados), estágio, conversa selecionada e protocolos
  aplicáveis. Observações livres e texto de anúncio ficam fora. Fato ausente não pode ser inventado;
  o próximo passo deve reconhecer a lacuna. O acesso continua gated por `podeUsarIa`, e nada é
  enviado sem revisão do corretor.

  O jeito pessoal de escrever vem de `user_config.perfil_comunicacao` (tom, tamanho, emojis,
  tratamento e listas curtas de expressões preferidas/a evitar), normalizado com default seguro para
  contas existentes. Ele não contém regra comercial nem nome hardcoded de corretor/empresa. O texto
  final é rejeitado antes da validação se vazio, maior que 360 caracteres no perfil curto ou 600 no
  médio, incompatível com emojis desativados, fizer afirmação comercial sem protocolo declarado,
  insistir após recusa, executar ação proibida ou repetir apresentação de forma óbvia. A validação
  por modelo recebe o rascunho inteiro e os títulos de `protocolosUsados`.

  **Os protocolos da imobiliária são a exceção a essa trava, e a única.** Não saber nada está certo
  para fato do IMÓVEL, que o painel não tem; está errado para regra da EMPRESA, que o corretor
  repete em toda conversa. Medido em 04/08/2026: das 49 respostas de proprietário com pergunta, ~18
  eram sobre a empresa (taxa, repasse, prazo, multa, quem paga o quê, exclusividade, horário, se
  trabalha com venda), e **12 delas no LD-156** — o único imóvel da carteira que chegou a assinar
  contrato. A pergunta não é rara: é a da fase que fecha o negócio, e por isso poucos chegam nela.
  Sem fonte de verdade o rascunho só sabia sugerir "vamos marcar uma ligação", doze vezes seguidas,
  enquanto o corretor respondia tudo por escrito.
  A tabela é `protocolos` (por usuário, no molde de `abordagens`), a tela é `/protocolos` e os
  contratos/prompts puros ficam em `lib/ia/atendimento/`. Decisões permanentes:
  **o conteúdo sai do BANCO** (a rota relê com o token de quem chamou; se o browser mandasse os
  protocolos, ele escolheria o que a IA está autorizada a afirmar a um proprietário real);
  **proibido deduzir e combinar** — assunto não coberto por um item volta à regra de sempre, e
  juntar "a taxa é 10%" com "o contrato é de 3 anos" para concluir o que acontece na renovação é o
  erro que um modelo comete com naturalidade; **a trava do fato do imóvel fica intacta** (protocolo
  é sobre a empresa, e há teste amarrando as duas regras); **protocolos são selecionados na decisão,
  antes da geração**, e no máximo cinco podem ser aplicados; e **o rascunho declara em que se apoiou**
  (`protocolosUsados` no esquema,
  filtrado na rota contra os títulos que existem de verdade, exibido no ModalWhatsapp) — "a IA
  sugere, o corretor confirma" não significa nada se conferir exigir reler a base inteira.
  O que decide se isso funciona não é o prompt e sim o **estado vazio da tela**: base vazia não muda
  nada, e tela que não muda nada ninguém reabre. Por isso ele lista os assuntos medidos acima, cada
  um a um clique de virar protocolo, e **sem conteúdo pré-preenchido** — um texto padrão sobre taxa
  de administração seria a IA afirmando um número que esta imobiliária nunca disse, com o corretor
  confirmando sem ler porque já estava escrito.
  Protocolos registram **regras e fatos objetivos da imobiliária**, não saudações, textos prontos ou
  preferências pessoais; estas pertencem ao perfil de comunicação.

#### `api/assistente` — Assistente geral somente leitura

O Assistente é uma superfície global do painel para consultar carteira, agenda, mensagens agendadas,
follow-ups, estagnação, Foco do dia, métricas e marcos históricos. Ele é deliberadamente **somente
leitura**: não cria, altera, envia nem exclui. A rota exige sessão válida e permissão de IA; consulta
o Supabase com o token do chamador, portanto a RLS continua sendo a fronteira de dados.

Arquitetura:

- `lib/assistente/`: contratos cliente-servidor, contexto visual, histórico compacto, referências,
  posição e continuidade conversacional.
- `lib/servidor/assistente/conhecimento.ts`: regras do produto fornecidas ao modelo. Não substitui o
  motor; explica quando usar cada consulta.
- `lib/servidor/assistente/ferramentas.ts`: ferramentas de leitura com argumentos estritos. Elas
  reutilizam motores reais para foco, follow-up, estagnação e métricas, em vez de duplicar regras no
  prompt.
- `lib/servidor/assistente/orquestrador.ts`: OpenAI Responses API com tool calling sequencial, até
  quatro rodadas, `store: false`, identificador de segurança derivado por hash e registro de custo.
  O modelo padrão é `gpt-5.4-mini`, substituível por `OPENAI_ASSISTENTE_MODEL`.

O cliente envia rota/página/superfície e, quando há drawer ou modal compatível, apenas tipo e ID da
entidade. O backend reconsulta o objeto; nenhum dado do card é aceito como verdade. Até 12 turnos são
enviados com limites de tamanho. Resultados estruturados anteriores são compactados só para resolver
referências como “desses”, “dele” e “o último”; fatos atuais são sempre reconsultados.

A continuidade multi-turno compara ID (ou código canônico como fallback) do resultado singular novo
com a entidade visual ou com o único card de imóvel da resposta imediatamente anterior. Não procura
códigos no texto e não ressuscita contexto depois de uma resposta quantitativa. Para marcos de
Angariado, Publicado e Locado, texto e card nascem do mesmo resultado determinístico: se a entidade
é a mesma, reconhece a continuidade; se mudou, deixa a troca explícita. Essa camada melhora a
redação, mas nunca substitui a ferramenta nem a consulta ao banco.

#### `api/sophia/eventos` — os fatos da locação chegando do Sistema Principal

É a outra entrada de integração de negócio: quem chama é o
**Sistema Principal da imobiliária (Sophia)**, quando o proprietário assina a Autorização de
Locação, quando o imóvel é locado e quando o financeiro paga a comissão. As partes puras vivem em
`lib/calculo/sistemaPrincipal.ts`; a rota só aplica.

Ela existe porque o painel acompanha a **captação** e, depois do "sim" do proprietário, ficava
cego: o corretor descobria que a própria comissão tinha sido paga perguntando para alguém. A regra
que dá forma a tudo é **só se recebe** — nenhuma função daqui decide que uma comissão foi paga, e
toda regra de negócio (quem assina, quando loca, quanto paga) continua lá. É isso que evita a pior
coisa que uma integração cria: dois sistemas achando que mandam no mesmo dado.

- **O `user_id` nasce do IMÓVEL, e essa é a única novidade estrutural.** No webhook do WhatsApp o
  dono sai do nome da instância; aqui não dá — o Sistema Principal não sabe (nem deve saber) a qual
  corretor a angariação pertence, porque quem angariou é informação daqui. Então acha-se a
  angariação por uma chave forte e o dono é o da linha encontrada. Continua **não vindo da
  requisição**: vem do banco. É o único lugar do projeto onde uma consulta com service role roda
  sem filtro de `user_id` — porque é ela que o descobre. Da seguinte em diante, tudo é filtrado.
- **A chave de casamento foi MEDIDA, e a óbvia estava errada.** Em 05/08/2026, na conta da
  supervisora: `referencia_crm` presente em **101 de 101 "Locado"**, 42 de 42 "Publicado" e **3 de
  497 "Angariado"** — e, em toda a base, **zero** referências repetidas. Ou seja, a referência é
  chave excelente e **nasce tarde**: ela é criada no Sistema Principal no momento do Evento 1.
  Casar só por ela funcionaria nos eventos 2 e 3 e falharia justo no primeiro, o que na prática é
  falhar em todos. Daí a cascata **referência → código → telefone canônico** (a mesma
  `telefoneCanonico` do webhook, de propósito: duas normalizações diferentes fariam o casamento
  falhar sem erro nenhum) e, sobretudo, daí o **Evento 1 GRAVAR a referência recebida** — é assim
  que ela vira o id compartilhado entre os dois sistemas.
- **`localizarAngariacao` recusa em vez de chutar.** Casar por telefone traz todos os imóveis de um
  proprietário com vários, e o evento é sobre um. A escada de desempate é endereço (o único
  critério que fala do imóvel; usa a `chaveEndereco` de `duplicidade.ts`, **não** uma cópia — a
  primeira versão tinha uma gêmea sem a tabela de abreviações e falhava em "R." contra "Rua"),
  depois "ainda vivo", depois "mais avançado no funil". Sobrando empate, devolve `ambigua` e nada é
  aplicado. Escolher um dos dois acertaria na maioria das vezes e erraria **em silêncio** no resto,
  que é o pior desfecho possível quando o evento é o pagamento de uma comissão.
- **A nota vem antes das colunas, e a ordem é a idempotência.** `registrar_nota_imovel` faz
  checagem de duplicata e append numa instrução só — gravando as colunas primeiro, uma reentrega
  reescreveria status e comissão a cada retentativa. (Essa função é a antiga
  `registrar_nota_whatsapp` renomeada; o nome velho ficou como **casca que delega**, nunca como
  segunda cópia do corpo, e não foi apagado porque o schema é aplicado à mão e o código sai na
  Vercel, sem ordem garantida entre os dois.)
- **O status só ANDA, mas o fato é gravado sempre.** Eventos chegam fora de ordem (fila
  reprocessada, integração religada), e desfazer um "Locado" com uma assinatura antiga é pior que
  perder o evento. A exceção deliberada: imóvel **fora** do funil (Perdido, Cancelado, Sem resposta)
  sempre avança — se de lá vem que o contrato foi assinado, o "Perdido" registrado aqui era o
  corretor tendo desistido de um negócio que a imobiliária fechou, e recusar a correção manteria na
  carteira uma derrota que não aconteceu.
- **Campo ausente não apaga nada.** Só o que vem preenchido sobrescreve — um evento magro não pode
  zerar o número do contrato que um evento anterior trouxe. Pelo mesmo motivo, **sem valor no evento
  a comissão fica `null`** e o app segue exibindo a estimativa pelo fallback do motor: gravar a
  estimativa transformaria um palpite nosso num número do financeiro. E `lerValor` devolve `null`
  para o ilegível, **nunca zero** — `Number("")` é 0, e um evento com `valor: "a combinar"` gravaria
  R$ 0,00 como valor pago, com cara de exato, numa tela de dinheiro (foi um teste que pegou isso).
- **A rota responde 4xx, ao contrário do webhook do WhatsApp.** Lá o 200 sempre é para não ser
  reentregue em loop (a Evolution desativa webhook que falha demais). Aqui quem chama é um sistema
  da própria casa, e formato errado ou imóvel não encontrado precisam aparecer para quem está
  integrando — 404 para "não achei", 409 para "achei mais de um, mande a referência".

**A etapa nova no funil.** `STATUS_AUTORIZACAO_ASSINADA` entrou no `STATUS_FLOW` entre "Angariado" e
"Publicado": aquele é o "sim" falado, este é o "sim" assinado. Ao mexer nisso, saiba que a etapa
atravessa **quatro** réguas, e três delas quebram em silêncio se esquecidas:
`STATUS_STALE_LENTO` (sem ela, todo imóvel autorizado nasce com selo de estagnação em 7 dias — a
reincidência exata do que matou a faixa de "imóvel parado" no termômetro), `DISPONIBILIDADE_STATUS_ALVO`
(sem ela, o imóvel sai da fila de confirmação de disponibilidade no momento em que a captação é
formalizada), `STATUS_POS_CAPTACAO`/`captacaoGanha` no motor e o balde do mapa. Este último ponto
é o mais fácil de não ver: o Sistema Principal escreve "Autorização assinada" **sem saber** se o
corretor chegou a marcar "Angariado" aqui, então a ressalva que já valia para "Locado" (contar como
captação ganha mesmo sem a etapa no histórico) precisou virar lista e valer para as duas. A
divergência de baseline está assinada no [BASELINE_ETAPA0.md](BASELINE_ETAPA0.md): a série do funil
passou de 7 para 8 posições, e **nenhum número existente mudou**.

**A auditoria é o log que já existia**, filtrado por `categoria = "sophia"` e exibido na `/admin`
(`linhaDoHistorico` faz a leitura). Duas decisões: ela mora no painel de quem OPERA e não numa tela
do corretor, porque as linhas mais valiosas para depurar — "angariação não encontrada" e "mais de
uma angariação" — **não têm dono** (é justamente o `user_id` que faltou descobrir), e uma tela
escopada por corretor esconderia exatamente os eventos que se perderam; e a consulta é própria, e
não um recorte da lista geral, porque aquela abre filtrada por erro enquanto aqui o desfecho normal
— "aplicado" — é `info`. **A reentrega passou a ser REGISTRADA** (`sophia-duplicado`, nível info):
ela é o único caso em que tudo funcionou e ainda assim nada mudou, e sem a linha o integrador vê a
rota responder `ok:true`, o painel não mexer um pixel e nenhum lugar onde ler o porquê — concluindo
que está quebrado o que está fazendo exatamente o que deve. O `detalhe` começa **sempre** com o
tipo do evento (`detalheDoLog`), e é dali que a coluna "Evento" sai: escrita e leitura moram no
mesmo arquivo porque uma divergência aqui não daria erro, só deixaria a coluna vazia.

**As notificações são NOTAS, não uma tabela.** Cada evento aplicado vira uma nota `sophia:<id do
evento>` no imóvel, e ela é a notificação: nasce sem `lida`, o sino a conta, o Realtime a empurra
para a tela na hora e o clique abre o imóvel. Uma tabela nova exigiria RLS própria, mapeadores, mais
uma publicação de Realtime e uma regra de expiração — para guardar um texto que pertence ao
histórico daquele imóvel de qualquer forma. A nota dá tudo isso de graça: idempotência (pelo id do
evento, na função do banco), estado de leitura (o `lida` que a caixa de respostas inaugurou) e o
vínculo com a angariação. **O prefixo é separado do `wa:` de propósito**: caísse lá, três coisas
passariam a mentir juntas e caladas — `isStale` trataria a assinatura como manifestação do
proprietário, a caixa de respostas cobraria leitura de um recado que ninguém mandou, e
`dataUltimaResposta` diria que a pessoa respondeu no dia em que o financeiro pagou.
`marcarEventosLidos` é separada de `marcarRespostasLidas` pela mesma razão: uma função só com
parâmetro de prefixo faria o "limpar" de uma tela apagar o pendente da outra.

**Os campos novos precisaram entrar na rede de segurança do `salvarImovel`.** `autorizacaoAssinadaEm`,
`autorizacaoResponsavel`, `locadoEm`, `contratoNumero`, `comissaoFormaPagamento` e
`comissaoObservacao` não são digitados em formulário nenhum — chegam pela rota. Como o `salvarImovel`
faz **upsert da linha inteira**, e nenhum modal os monta, abrir um imóvel para corrigir um telefone
os gravaria como `null`: o painel perderia a data da assinatura e o número do contrato em silêncio, e
a única recuperação seria pedir o reenvio do evento. É o mesmo bug que já apagou as tentativas, agora
com dado que este sistema **não consegue recriar sozinho**. No cadastro eles aparecem em bloco de
**só leitura**: campo editável convidaria a "corrigir" a data da assinatura aqui, e aí os dois
sistemas voltariam a discordar sobre o mesmo contrato.

#### `api/google/*` — espelhar a agenda no Google Agenda

Quatro rotas (`conectar`, `callback`, `sincronizar`, `conta`) e dois módulos que não são rota (o `_`
os mantém fora do roteamento): `_comum.ts` e `_espelho.ts`. O segredo que as justifica é o `GOOGLE_CLIENT_SECRET` e,
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

**Todo caminho que CRIA compromisso precisa espelhar, e esquecer disso é invisível.** O espelhamento
morava só em `salvarAgenda` e `alternarAgendaDone`, e os **cinco** caminhos em que o app cria
compromisso sozinho ficavam de fora: os dois lembretes do salvamento de imóvel, o encadeado da
verificação, o do lote de disponibilidade e o da **agenda inteligente no webhook**. Nada falha
quando isso acontece: o compromisso aparece normal no painel, sem erro e sem toast, e o único
sintoma é o lembrete não tocar no celular — que só se descobre perdendo a visita. Medido em
03/08/2026 na carteira real: dos compromissos criados desde a conexão da conta, **nenhum** tinha
`google_event_id`, inclusive uma visita cuja hora a própria proprietária havia combinado por escrito.
A correção não foi espalhar chamadas e sim deixar **um caminho só** — `inserirCompromisso`, em
`mutacoes.ts`, que insere e espelha juntos —, com teste estrutural guardando que ninguém abra um
segundo. O webhook não passa por ali (roda no servidor, sem browser), então tem o seu:
`_espelho.ts` é o miolo que os dois chamadores compartilham, recebendo o cliente do Supabase e o
`userId` em vez de deduzi-los. Como o webhook lhe passa a **service role**, toda consulta lá dentro
filtra por `user_id` explicitamente, mesmo onde o RLS já faria isso: sob a service role esse filtro
é a única barreira entre um corretor e a agenda do outro. No webhook o espelhamento roda em
`after()`, pelo contrato do `registrarEvento` — quem espera a resposta é a Evolution, e ela não pode
ficar presa numa conversa nossa com o Google.
Os **dados demo** são a exceção deliberada: exemplo descartável não vai para a agenda pessoal de
ninguém, ainda mais porque `limparDados` apaga a linha daqui sem ter como apagar o evento de lá.
O que já estava no banco é `scripts/backfill-google-agenda.ts` (idempotente, só toca linha com
`google_event_id` nulo; rodado em 03/08/2026: 14/14). Ele cobre **só compromisso futuro e em
aberto** — evento com "✓" numa data que já passou é arqueologia, não lembrete. E importa
`eventoDoCompromisso` de `web/lib` em vez de reescrevê-lo (o Node 24 executa TypeScript direto):
com um construtor próprio, os compromissos antigos sairiam com formato diferente dos novos e a
divergência só apareceria olhando o celular.

Compromisso **sem hora vira evento de DIA INTEIRO** (a mesma distinção do `separarPorHorario`):
como evento cronometrado ele apareceria de madrugada e dispararia lembrete na hora errada. Com
hora, o `timeZone` é obrigatório — sem ele o Google assume UTC e a visita das 10h chega às 7h no
celular. Concluir **não apaga** o evento, põe "✓" no título: a agenda também é registro do que foi
feito, e uma visita que some depois de realizada apaga a prova de que aconteceu.

> **A armadilha que não é do código:** enquanto a tela de consentimento estiver em modo **Teste** no
> Google Cloud, o refresh token expira em **7 dias**. A sincronização funciona a semana inteira e
> quebra sozinha, sem erro visível — o sintoma é `invalid_grant`, que a rota traduz para
> `autorizacao-expirada` e a UI pede reconexão. Para uso real, publicar em "Em produção".

#### `api/central-angariacao/*` e `api/cron/radar` — Central e Radar

A Central faz busca sob demanda em hosts fixos; o browser fornece filtros tipados, nunca uma URL
arbitrária. Em produção, usa Firecrawl quando configurado. Fora da Vercel pode cair para Playwright/
Chromium e, por último, extração HTTP/JSON-LD. Falha conserva o link de pesquisa pronto para a pessoa
continuar manualmente. Resultado coletado é oportunidade para revisão, não gravação automática no
Pipeline; cidade é conferida exatamente para não misturar região metropolitana.

Cada resultado válido também registra ou atualiza `comparaveis_mercado`, sempre sob o `user_id`
autenticado. A deduplicação combina código externo, URL canônica e fingerprint forte; o trigger de
observações conserva preço e status ao longo do tempo. Campos objetivos declarados continuam em
colunas e a descrição normalizada recebe embedding somente quando seu SHA-256/modelo/dimensão
mudam. A Avaliação Rápida reutiliza essa base sem chamar o coletor a cada cálculo. No Firecrawl, a
consulta usa proxy básico e cache para manter o custo previsível; o fallback local preserva os
mesmos campos estruturados quando o portal os disponibiliza.

O Radar salva buscas e o baseline visto em `radar_buscas`/`radar_anuncios`. A chave única
`busca_id + portal + id_externo` impede duplicatas entre consulta manual e monitor. O cron diário da
Vercel chama `/api/cron/radar` com `CRON_SECRET`; o worker usa service role, processa somente buscas
ativas vencidas, no máximo oito por rodada e duas por vez, sempre filtrando/escrevendo o `user_id`
da própria busca. O limite controla custo do Firecrawl e evita rajada. Falha numa busca atualiza a
janela e não bloqueia as demais.

`api/central-angariacao/imagem` funciona apenas como proxy seguro para imagens de hosts esperados;
não deve virar fetch genérico controlado pelo cliente.

#### `api/admin/*` — o painel de quem opera

Oito rotas (`eu`, `corretores`, `logs`, `ia`, `instancia`, `cargo`, `conexao`, `ambiente`) e um
`_comum.ts` que não é rota. O
segredo que as justifica é a própria **service role** — e aqui ela é mais perigosa do que em
qualquer outro lugar do projeto: nas outras (webhook, envio, Google) ela ignora a RLS para
trabalhar dentro de UMA conta já identificada; aqui, para olhar TODAS. É exatamente o poder que o
cargo precisa ter, e por isso o que não pode escapar por descuido.

- **A identidade de quem pede nunca vem da requisição.** Sai de `auth.getUser()` sobre o Bearer, e
  só então é conferida contra `admins` com service role. Um `userId` no corpo é aceito só como
  **alvo** de uma ação ("libere a IA de fulano"), jamais como quem pede. `exigirAdmin` devolve a
  `Response` de erro em vez de um booleano de propósito: um `if` esquecido não compila em silêncio.
- **Toda rota reconfere.** Esconder o menu é conveniência — quem souber o endereço chama a rota
  direto, o mesmo raciocínio que já valia para `podeUsarIa`.
- **Nenhuma tabela foi afrouxada para o painel existir.** `ia_permissoes` e `whatsapp_instancias`
  continuam sem política de escrita; quem escreve é o servidor. Se um dia alguém "simplificar" isto
  criando uma política de update, o controle inteiro cai — qualquer usuário se autolibera com a
  anon key.
- `GET /api/admin/eu` responde `{admin:false}` em vez de 403, por duas razões: o boot da UI não
  pode quebrar por causa dele (igual ao `GET /api/ia`), e um 403 seria um oráculo dizendo "este
  endereço existe e você quase chegou". Ele devolve **dois** flags, e eles erram para lados
  OPOSTOS: `admin` é falso em toda dúvida (nega), `operaCarteira` é verdadeiro (libera). A
  assimetria é a de `aceitouVersaoAtual` — errar para `false` ali trancaria um corretor fora do
  próprio trabalho por causa de uma falha de rede nossa, enquanto errar para `true` só mostra um
  menu a mais a quem não ia usá-lo.
- **`cargo` é a única rota que muda quem manda no sistema**, e a trava dela é uma só: **ninguém
  remove o próprio cargo**. Não é paternalismo — é o que torna inalcançável o estado "sistema sem
  nenhum admin", sem precisar de uma contagem à parte: um admin só some por decisão de OUTRO, e
  para o último sumir alguém teria de removê-lo. Sem isso, um clique distraído deixaria o sistema
  num estado que só se conserta abrindo o banco, que é o que esta tela veio eliminar.
- **`conexao` tem duas formas, e a diferença não é conveniência**: sem `userId` varre todas SEM
  pedir QR; com `userId` devolve uma COM QR. Pedir o QR manda a Evolution começar a parear, então
  a varredura dispararia pareamento nas instâncias de todo mundo por causa de uma tela aberta.
  Ela também **não registra no log**, ao contrário da rota do corretor: lá o registro avisa que um
  número caiu sem esperar a reclamação; aqui quem olha é justamente quem leria o aviso, e N linhas
  por clique encheriam de ruído a tabela que este painel existe para deixar legível.
  A consulta é **sob demanda** (botão), nunca a cada abertura da tela — cada consulta ocupa a mesma
  instância que precisa estar livre para enviar.
- **A corretora fixa é a exceção administrativa mínima:** número-fonte `43 9653-4523`, forma
  normalizada `554396534523` (somente DDI 55, sem inventar dígito) e nome imutável `corretora`.
  `lib/servidor/evolution.ts` é o único cliente de ciclo de vida da Evolution 2.3.7. Antes de usar
  essa instância, ele faz `fetchInstances`; `open` reutiliza, `close` pede conexão/QR na mesma,
  lista vazia permite `POST /instance/create` com o mesmo nome. Qualquer erro de comunicação
  encerra a tentativa sem criar. Chamadas concorrentes compartilham a mesma promessa no processo;
  entre processos, a unicidade do nome na Evolution faz só uma criação vencer e as demais
  reconsultarem `corretora`. A linha e o token continuam na tabela existente
  `whatsapp_instancias`; `observacao` preserva número original e normalizado, sem migration nova.
- **`ambiente` devolve só booleanos.** Nunca o valor de uma variável, nunca um pedaço dele, nem
  mascarado — mesma regra do token da instância. A pergunta que a tela responde é "está lá?", não
  "qual é". Ela existe porque variável esquecida não falha no build e não aparece em log nenhum
  até alguém USAR aquilo: o sintoma chegava pela pessoa errada (o corretor), depois de o trabalho
  ser interrompido, e chegava igual para "faltou a variável" e "o serviço caiu".

**O teto de IA (`ia_permissoes.teto_usd`) AVISA, não bloqueia.** Cortar a IA no meio do mês
transformaria um estouro de conta num incidente para o corretor, que não escolheu o teto e não pode
mudá-lo; o painel acende a linha e quem decide é quem opera. Ele entra em `saudeDoCorretor` **depois
do erro e antes da inatividade**: erro é algo quebrado e pede mais rápido; e quem gasta acima do
teto obviamente não está parado.

**A conexão entra na saúde, e foi o buraco mais caro do painel.** `saudeDoCorretor` só conhecia a
falta de CADASTRO, então instância cadastrada com o WhatsApp caído — o efeito é idêntico, nenhuma
mensagem sai — aparecia como "Ok". Hoje `desconectado` é **bloqueado**, no mesmo degrau de não ter
número, e vence erro recente (o erro no log é quase sempre a consequência da queda; mostrar a
consequência esconderia a causa). Duas ressalvas que caem daí: sem varredura o estado é `undefined`
e **ninguém é acusado** — não saber não é o mesmo que estar quebrado —, e `conectando` não acusa
nada, porque é o estado de quem acabou de ler o QR e "consertar" isso derrubaria o pareamento.

As métricas de uso são calculadas em **TypeScript**, sobre as colunas jsonb, e não por função SQL —
somar no banco seria mais barato, mas exigiria reescrever em PL/pgSQL a regra de "o que é resposta
do proprietário" (`ehNotaDeResposta`, com a sutileza da nota de encerramento que também começa com
`wa:`). Este projeto já tem um par de gêmeas TS/SQL, o `telefoneCanonico`, e o aviso dele vale:
divergir faz o casamento falhar **em silêncio**. Não vale criar o segundo par para economizar bytes
num painel que uma pessoa abre por dia.

## Garimpo automatizado: decisões e limites

O garimpo — achar o imóvel antes de ele virar cliente de outra imobiliária — é a parte do trabalho
que mais parece pedir automação, e é onde mais se gastou esforço à toa. O que segue foi **medido**,
não estimado. A Central/Radar atual reabriu somente a **coleta assistida**, com filtros, revisão
humana, deduplicação e limites de custo; ela não invalida os descartes de enriquecimento inventado,
captura incompleta ou contato automático. Cada item existe para não ser reaberto sem dado novo.

**As fontes reais são três, e são dois problemas diferentes.** Marketplace e OLX (anúncio de
proprietário, contato pelo chat do próprio portal) de um lado; sites de imobiliária, ZAP, Chaves na
Mão e Wimóveis/ImovelWeb do outro (anúncio de imobiliária, o dono não aparece). Note que "grupo
zap" na fala do corretor é o **Grupo ZAP**, os portais — não grupo de WhatsApp. Não há fonte de
garimpo dentro do WhatsApp; os grupos dele são internos da imobiliária.

- **Central autônoma imaginada em 2026-07-10** — o desenho antigo, descrito em
  [RADAR_CAPTACAO.md](RADAR_CAPTACAO.md), foi descartado. A implementação atual é outra: consulta
  quatro portais sob demanda por rota autenticada, usa Firecrawl em produção, mantém fallbacks
  controlados, oferece sempre o link original e só transforma anúncio em pré-cadastro após ação
  humana. O Radar monitora buscas salvas, não aborda proprietários nem cria imóveis sozinho.
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

## O super admin: operar o sistema ≠ usar o sistema

Tudo acima é o painel do **corretor**, e cada linha do banco pertence a um `user_id`. O que faltava
era a outra cadeira — a de quem **opera** o sistema para vários corretores. Ela nasceu de um
levantamento de "o que falta para começar a oferecer", em 2026-08-01, e ataca as duas coisas que
travavam a resposta: **conta nova não se destrava sozinha** e **quando quebra, ninguém fica sabendo**.

Antes disto, liberar a IA de alguém era inserir linha em `ia_permissoes` pelo Table Editor, e
cadastrar o número era inserir em `whatsapp_instancias` do mesmo jeito. Com um usuário isso
funciona. Com dez, o corretor novo entra, aperta "Enviar agora" e lê *"fale com o responsável pelo
sistema"* — uma frase que só faz sentido se o responsável tiver por onde responder. E o que quebra
(instância caída, token do Google expirado, transcrição falhando) ia para o `console.error` da
Vercel: um fluxo único, sem dono, que ninguém lê.

Três tabelas novas em [supabase-schema.sql](supabase-schema.sql), a view `/admin`, o núcleo puro em
`lib/calculo/admin.ts` + `lib/calculo/custoIa.ts`, e `lib/servidor/registro.ts` escrevendo de dentro
das rotas que já existiam.

- **`admins`** — quem tem o cargo. RLS ligada e **nenhuma política, nem de select** — e essa é a
  diferença para `ia_permissoes`, que deixa o dono ler o próprio flag. Lá é inofensivo (saber que
  você tem IA não dá IA a ninguém). Aqui, uma política de select devolveria ao browser a LISTA de
  quem manda no sistema, que é reconhecimento gratuito para quem quiser atacar a conta certa; e uma
  de escrita, ainda que "só na própria linha", seria autopromoção a administrador com a anon key.
  A UI pergunta ao servidor (`GET /api/admin/eu`). **O primeiro admin entra à mão** pelo Table
  Editor — não há admin para promovê-lo (ver [DEPLOY.md](DEPLOY.md)); do segundo em diante quem
  promove é a tela (`POST /api/admin/cargo`).
- **`ia_uso`** — o gasto, chamada a chamada. Grava o FATO (modelo + tokens, como a API devolveu) e
  **nunca o preço**: preço muda por decisão da OpenAI, e gravá-lo congelaria as linhas antigas em
  valores de meses atrás. A conta é feita na LEITURA, em `custoIa.ts` — mesma disciplina de
  `resultadoObservado.ts`, e é o que faz corrigir um preço errado ser a edição de uma constante,
  sem migração. `on delete set null`: conta encerrada não apaga a contabilidade do mês em que ela
  existiu.
- **`log_eventos`** — o que quebrou e na conta de quem. **Não** é trilha de auditoria: só o que
  alguém precisaria AGIR para consertar, mais os envios (o volume que explica a fatura). Registrar
  tudo encheria a tabela de ruído, e log que ninguém consegue ler é o mesmo que não ter log — o
  erro exato que matou a faixa de "imóvel parado" no termômetro.

### Cargo ≠ carteira (`admins.opera_carteira`)

O cargo e a carteira eram tratados como a mesma coisa, e o custo apareceu em 2026-08-06, quando a
conta de operação foi olhada por dentro: **1 imóvel, 0 tentativas, 0 abordagens, 0 protocolos e
nenhuma instância de WhatsApp**, com as dez telas do corretor no menu. Elas não abriam só vazias —
elas **mentiam**: uma caixa de respostas em branco diz "nada chegou" quando o que há é uma conta
que, por construção, nunca vai receber mensagem nenhuma. É a mesma morte da faixa de "imóvel
parado" no termômetro, aplicada ao app inteiro.

**A regra oposta ("admin não vê o painel do corretor") também está errada**, e é o erro fácil de
cometer: na mesma medição, o outro admin era o corretor real, com 201 imóveis — cortar por cargo
tiraria o Pipeline de quem trabalha a própria carteira. São dois eixos independentes, e por isso
duas colunas de significado e não uma.

- **Default `true`.** Quem já era admin quando a coluna nasceu estava usando o painel inteiro, e um
  default `false` o trancaria fora do próprio trabalho no primeiro deploy. A exceção se declara.
- **Quem não é admin opera carteira por definição** — o painel do corretor é o app inteiro para
  ele, e só a linha de `admins` pode dizer o contrário. Por isso mexer nisto para um não-admin é
  pedido inválido, e não um no-op silencioso que criaria a linha de admin como efeito colateral.
- **Os dois flags entram no store JUNTOS** (`setCargo`). Separados, um render pegaria `ehAdmin` já
  verdadeiro com `operaCarteira` ainda no padrão, e o menu do operador nasceria com as dez telas do
  corretor antes de se corrigir sozinho.
- **O corte tem três camadas, e nenhuma é controle de acesso**: a `BarraLateral` esconde os itens, o
  layout do painel redireciona a URL digitada para `/admin`, e a Topbar tira o sino (que contaria
  resposta de proprietário e evento do Sistema Principal — as duas coisas chegam a uma CARTEIRA).
  Não há o que proteger: as views do corretor são a carteira DELE, vazia.

Quatro regras ao mexer nisto:

- **`prompt_tokens` da OpenAI JÁ INCLUI os tokens cacheados.** O cache de entrada custa dez vezes
  menos ($0,075 contra $0,75 no `gpt-5.4-mini`), então `ia_uso` guarda as duas colunas — o total e
  a parte cacheada — e `custoDaChamada` **subtrai** uma da outra. Quem somar as duas parcelas
  fatura o mesmo token duas vezes, e o resultado continua parecendo plausível. Medido em
  01/08/2026 com duas extrações idênticas: a segunda chamada veio com **1.280 dos 1.814 tokens de
  entrada servidos do cache**, e ignorar isso inflaria aquela chamada em 55%. Guardar o total (e
  não um valor já líquido) é o que preserva o que a API disse e deixa a correção de preço ser a
  edição de uma constante.
- **`custoDaChamada` devolve `null` para modelo sem preço, nunca zero.** Zero somaria em silêncio e
  a tela exibiria um custo menor que o real com cara de exato. É a mesma lição da busca de endereço
  por IA: número com procedência aparente, e errado, é pior que a ausência do número — e aqui ele
  apareceria numa tela de dinheiro, que é onde menos se confere. Pelo mesmo motivo cada preço tem
  `conferidoEm`, e a tela avisa enquanto for `null`: sem isso a tabela envelhece sem ninguém notar,
  porque os números continuam plausíveis e a diferença só aparece na fatura.
- **A lista abre por quem PRECISA de você**, nunca por volume (`ordenarCorretores`). Ordenar por
  qualquer outra coisa deixa a maioria — que está bem — enterrar as duas linhas que pedem ação. É a
  armadilha da `rodadaDia` e do termômetro, de novo.
- **Nunca gravar no log o conteúdo da conversa nem o telefone do proprietário.** O log é lido por
  quem opera o sistema, que **não é o dono daquela carteira**. Motivo classificado
  (`sem-whatsapp`, `instancia-desconectada`) basta para agir e não expõe dado pessoal de terceiro
  que nunca aceitou nada. Pelo mesmo motivo o **token da instância nunca volta** ao browser — nem
  mascarado —, e salvar com o campo em branco MANTÉM o que já está gravado (limpar o token ao
  corrigir só o nome da instância deixaria a conta sem poder enviar, em silêncio).
- **O registro nunca lança e nunca atrasa.** `lib/servidor/registro.ts` escreve por `after()`,
  depois da resposta ir embora, e engole a própria falha. O chamador está sempre no meio de algo
  mais importante — mandar a mensagem, gravar a nota do proprietário —, e o mesmo contrato da
  transcrição vale aqui: log é o que se perde primeiro.

`lib/servidor/registro.ts` mora junto de `servidor/ia.ts` e **não** em `lib/calculo/`: lê a service
role e importa `next/server`, então é só-de-servidor por contrato. Nunca importe dele em componente
ou store.

## Termos, privacidade e o aceite

O sistema guarda dado pessoal de **terceiros que nunca aceitaram nada**: nome, telefone e endereço
do proprietário, mais o conteúdo das conversas de WhatsApp — inclusive áudios que saem da nossa
infra e vão para a OpenAI ser transcritos. Enquanto era uma pessoa usando o próprio sistema, isso
era um detalhe. Vendendo para outra imobiliária, deixa de ser.

Vivem em `web/lib/legal/`: `identidade.ts` (quem responde, e a `VERSAO_TERMOS`), `conteudo.ts` (o
texto dos dois documentos, estruturado) e `aceite.ts` (leitura e gravação). As páginas
`/termos` e `/privacidade` ficam **fora do grupo `(painel)`** — precisam ser lidas antes de existir
conta, e um proprietário que queira saber quem trata seus dados não tem (nem deve ter) login aqui.

> **Os textos precisam de revisão jurídica antes de contrato com cliente pagante.** Eles descrevem
> com precisão o que o sistema faz — a parte que um advogado não escreveria sozinho —, mas descrever
> o produto não é responder pela adequação à LGPD.

**A camada inteira está em STAND BY, e liga sozinha** (`legalPublicavel`). Enquanto faltar CNPJ,
endereço ou contato do encarregado, o portão não bloqueia, a caixa não aparece no cadastro e os
links somem do rodapé — as páginas seguem legíveis por URL direta, com o aviso de "não publicável".
O gatilho é derivado da própria identidade de propósito, e não um `LEGAL_ATIVO = false` que alguém
precisa lembrar de virar: a precondição e o interruptor são a mesma coisa. Exigir aceite de um texto
que não identifica quem responde é colher um "eu aceito" que não vale — e ainda trancaria o corretor
no meio do expediente por causa disso.

**A decisão que dá forma a tudo: são DOIS papéis, não um.** Os dados da conta do corretor (nome,
e-mail, senha, acessos, consumo de IA) têm a plataforma como **controladora**. Os dados do
proprietário têm o **corretor** como controlador e a plataforma como **operadora** — porque foi ele
quem obteve o contato e decidiu abordar aquela pessoa. Escrever os dois como se fossem um só é o
erro que faria a responsabilidade padrão sobrar para quem hospeda; por isso os termos atribuem
explicitamente ao corretor a base legal do dado que ele cadastra.

Quatro regras ao mexer:

- **Ligou integração nova que recebe dados? Declare na política.** Há teste falhando até que
  Supabase, Vercel, Evolution, OpenAI e Google apareçam nomeados — política que esquece um
  fornecedor não é texto incompleto, é informação errada ao titular.
- **Mudou o que se faz com os dados? Suba a `VERSAO_TERMOS`.** É ela que faz o aceite significar
  algo: sem versão, "o usuário aceitou" é uma afirmação sobre um texto que pode ter mudado três
  vezes. Subir a versão faz todo mundo reencontrar o `PortaoTermos` no próximo acesso.
- **O aceite não se edita nem se apaga.** `aceites_termos` tem select e insert, e **nem update nem
  delete**; uma linha POR VERSÃO, porque sobrescrever apagaria a prova de que a pessoa aceitou a
  anterior enquanto ela valia. Sem IP nem user agent de propósito — seriam mais dado pessoal para
  proteger num sistema cujo problema já é ter dado pessoal demais.
- **Falha ao CONSULTAR o aceite libera o app** (`aceitouVersaoAtual` devolve `true` em erro). É o
  oposto de `podeUsarIa`, que nega na dúvida, e a diferença é o que está em jogo: lá o erro
  permissivo gasta token de quem não devia; aqui o erro restritivo trancaria do lado de fora, no
  meio do expediente, um corretor que já aceitou — por causa de uma falha de rede nossa.

O aceite do **cadastro** viaja em `user_metadata.termos_versao`, e não numa inserção direta, por uma
limitação real: com confirmação por e-mail ligada, `signUp` não devolve sessão, e sem sessão o RLS
barra o insert. A linha durável nasce no primeiro acesso autenticado, em silêncio — quem marcou a
caixa há trinta segundos não pode ser recebido com um pedido para aceitar de novo.

## Convenções e regras (o que sempre / nunca fazer)

- **Tudo em pt-BR** — strings de UI, comentários, toasts, labels, mensagens de validação.
- **Invariante do `statusHistory`** — mudanças do cliente passam por `aplicarMudancaDeStatus()`;
  integrações usam o helper equivalente e nunca tentam contornar o trigger protetor do banco.
- **Datas só via `lib/datas.ts`** — proibido `new Date(` fora dele (regra de ESLint ativa).
- **Sem `dangerouslySetInnerHTML`** (regra do checklist; o escape do JSX é a defesa de XSS).
  Para HTML fora do React — ex.: popup do Leaflet — montar com nós do DOM e `textContent`.
- **Escritas primeiro no Supabase, depois no estado local.** O app chama o Supabase e só atualiza
  o store se a escrita deu certo; em falha, mostra `toast` de erro e o estado não muda. (Isto **não**
  é o otimismo com rollback que versões antigas da doc descreviam — ver achado A1 na §15 do
  MIGRATION_NEXT.) Estado central passa por `web/lib/mutacoes.ts`; features isoladas mantêm uma
  fronteira de escrita própria e explícita.
- **Novo dado user-scoped = RLS + tipo + adaptação banco/domínio** (ver "Modelo de RLS").
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
- **Núcleo sem dependências** — módulos de cálculo e contratos puros não importam
  React/Next/Supabase/store. `lib/servidor`, persistência, mutações e stores são fronteiras explícitas,
  não exceções escondidas. É o que mantém as views concordando e permite testar o domínio puro.
- **Chart.js / Leaflet** — instanciar em `useEffect` com cleanup; testar navegação repetida (sem
  `canvas` órfão nem `.leaflet-container` sobrando).
- **Novo modal** — encapsular o próprio estado e registrar no `ModalOverlay`/`uiModal.ts`; garantir
  que reabrir não herde estado do uso anterior.
- **Bibliotecas novas via npm** em `web/`, fixando a mesma major das existentes quando fizer sentido
  (Chart.js 4, Leaflet 1.9, Supabase JS 2, Zustand 5).
- **Sem segredo no cliente além da anon key.** Segredo mora no servidor (é o caso de credenciais da
  Evolution/Google, `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, `CRON_SECRET` e
  `SUPABASE_SERVICE_ROLE_KEY`); código que chega ao browser, nunca. Na prática: variável com
  `NEXT_PUBLIC_` é pública — se é segredo, não leva o prefixo.
- **A service role é a exceção mais perigosa do projeto.** Ela ignora a RLS por completo e só pode
  existir em código exclusivo do servidor. A regra que a segura: o dono/ator nunca é aceito de uma
  requisição não confiável. No webhook do WhatsApp nasce da instância; no envio, de `auth.getUser()`;
  no Sophia, da linha encontrada; em crons, da própria linha user-scoped reclamada. Toda consulta
  posterior é filtrada por esse id. A busca inicial do Sophia é a exceção deliberada porque existe
  justamente para descobrir o dono; ações administrativas podem receber um `userId` apenas como
  alvo, depois de autenticar e autorizar o admin que pediu.

## Validação

Depois de qualquer mudança: `npm test`, `npx tsc --noEmit`, `npm run lint` e `npm run build` verdes,
e validar exercitando a UI no browser com o console limpo. Para mudanças de cálculo/KPIs, conferir
que Dashboard, Metas, Insights e Relatórios continuam concordando entre si (divergência entre eles é
sinal de bug) e comparar com o [BASELINE_ETAPA0.md](BASELINE_ETAPA0.md) — que é também um teste
executável (`web/tests/baseline-etapa0.test.ts`).

Escolha também os testes direcionados do domínio alterado; há suítes específicas para Assistente,
IA/atendimento, WhatsApp bidirecional, Sophia, mensagens agendadas, marcos históricos, Central/Radar,
Foco do dia e segurança estrutural. Se a alteração for somente em Markdown, não é necessário rodar a
suíte: confira links/referências e execute `git diff --check`.
