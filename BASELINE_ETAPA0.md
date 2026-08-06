# BASELINE_ETAPA0.md — Baseline de paridade (Etapa 0 da migração)

> Capturado em **2026-07-09** no app estático atual (commit `f2a56ba` da branch `migracao-next`),
> logado como o usuário de teste `claude@acesso.com` (user_id `08bcf286-c972-4541-98a3-19b6fe0a2b73`),
> com o dataset semeado por `seed-teste.mjs` (14 imóveis / 3 metas / 8 itens de agenda / comissão 50%).
>
> **Este arquivo é o contrato de aceitação das Etapas 5–7 do [MIGRATION_NEXT.md](MIGRATION_NEXT.md).**
> Cada view do app Next.js, com o mesmo usuário e os mesmos dados, deve reproduzir exatamente
> os números abaixo. Console do devtools no momento da captura: **zero erros e zero warnings**.
>
> ⚠️ Vários números dependem da data corrente (mês "Julho de 2026", badges de stale, atrasados
> da agenda). Ao comparar em outra data, re-capturar o baseline no app antigo no mesmo dia,
> com o mesmo seed — o script é idempotente e regenera o estado exato.
>
> 🔁 **Divergência intencional pós-baseline (regra de "parado").** O app antigo marcava como
> "parado" (stale) qualquer imóvel com 7 dias no mesmo status. A partir da migração, **Angariado**
> e **Publicado** só contam como parado após **60 dias** (imóvel já captado, aguardando locação —
> a cobrança dessa fase é o lembrete de disponibilidade). Onde este documento marca CA-007
> (Angariado, 29d) e AP-008 (Publicado, 24d) como stale, o app Next.js **não** os marca mais.
> Efeitos no baseline: badges de stale passam a ser só **CA-002** e **SO-004**; o card "mais parado"
> vira **CA-002 (12 dias)**; e o card "N imóveis estagnados" (mínimo 3) deixa de existir, caindo de
> **9 → 8** insights aqui listados (12 → 11 na contagem interna do `buildInsights`). O teste
> executável [`web/tests/baseline-etapa0.test.ts`](web/tests/baseline-etapa0.test.ts) já reflete
> os valores novos.

> 🔁 **Divergência intencional pós-baseline (etapa "Autorização assinada", 2026-08-05).** O funil
> ganhou uma etapa entre **Angariado** e **Publicado**, com a integração com o Sistema Principal
> (Sophia): é lá que o proprietário assina a Autorização de Locação, e é o evento dessa assinatura
> que move o imóvel para a etapa nova. Ver o bloco em [`web/lib/constantes.ts`](web/lib/constantes.ts)
> e a seção "Integração com o Sistema Principal" do [CLAUDE.md](CLAUDE.md).
>
> Efeito no baseline: **um só, e ele é estrutural, não numérico**. A série do gráfico de funil passa
> de **7 para 8 posições**, com **zero** na nova (`[2, 1, 1, 1, 2, 0, 1, 2]`) — o seed é anterior à
> integração, então nenhum imóvel dele passou por essa etapa. Nenhum outro número deste documento
> muda: KPIs, conversões, coortes, tempo médio e stale continuam idênticos, porque a etapa nova
> entrou junto em `STATUS_STALE_LENTO` (senão todo imóvel autorizado nasceria com selo de
> estagnação em 7 dias) e em `DISPONIBILIDADE_STATUS_ALVO`.
>
> Uma mudança de leitura que não aparece em número nenhum aqui, mas vale registrar: `conversaoCaptacao`
> e o balde do mapa passaram a usar `captacaoGanha` em vez de `foiAngariado`. A ressalva que já valia
> para "Locado" (contar como captação ganha mesmo sem a etapa no histórico) agora vale também para
> "Autorização assinada" — necessária porque o Sistema Principal escreve esse status sem saber se o
> corretor chegou a marcar "Angariado" aqui.

## Dataset de referência (resumo do seed)

| # | Código | Status atual | Particularidade |
|---|--------|--------------|-----------------|
| 1 | AP-001 | Novo contato | criado hoje, sem lat/lng |
| 2 | CA-002 | Novo contato | **stale** (desde 27/06), com lat/lng |
| 3 | AP-003 | Visita agendada | histórico 2 etapas |
| 4 | SO-004 | Em negociação | **stale** (desde 28/06), 3 etapas |
| 5 | AP-005 | Documentação | 4 etapas |
| 6 | KT-006 | Angariado | angariado 05/07 (mês corrente), verificação 03/09 |
| 7 | CA-007 | Angariado | angariado 10/06, **stale**, verificação 09/08 |
| 8 | AP-008 | Publicado | angariado 05/06, publicado 15/06, **stale**, verificação 04/08 |
| 9 | AP-009 | Locado | funil completo, locado 02/07, comissão R$ 1.800 recebida 06/07 |
| 10 | CA-010 | Locado | locado 28/05, comissão R$ 1.500 recebida 01/06 |
| 11 | AP-011 | Sem resposta | saída lateral |
| 12 | SO-012 | Perdido | motivo "Optou por outra imobiliária" |
| 13 | AP-013 | Cancelado | motivo "Proprietário desistiu de alugar" |
| 14 | GA-014 | Perdido | motivo "Outro" + texto livre, sem quartos (Galpão) |

Metas: 2026-05 (3/1/R$ 3.000), 2026-06 (4/2/R$ 4.000), 2026-07 (5/2/R$ 5.000). `comissao_percent` = **50**.

---

## Dashboard (Julho de 2026)

| KPI | Valor | Comparativo |
|---|---|---|
| Novos contatos no mês | 1 un. | ▼ -2 vs. mês anterior |
| Angariações no mês | 1 un. | ▼ -2 vs. mês anterior |
| Imóveis locados no mês | 1 un. | ▲ +1 vs. mês anterior |
| Taxa de conversão | 33% | (Locado ÷ processos fechados) |
| Tempo médio até locação | 23 dias | |
| Em andamento agora | 8 imóveis | |
| Comissão estimada (mês) | R$ 1.800 | |
| Comissão recebida (mês) | R$ 1.800 | |
| Valor médio de aluguel | R$ 4.107 | |

### Dados dos gráficos (labels → valores)

- **Angariações por mês** (fev→jul/26): `[0, 0, 0, 1, 3, 1]`
- **Locados vs. Angariados por mês**: Angariados `[0, 0, 0, 1, 3, 1]` · Locados `[0, 0, 0, 1, 0, 1]`
- **Pipeline por bairro** (top 8): Pinheiros 4, Vila Madalena 2, Jardim Paulista 2, Cerqueira César 2, Sumarezinho 1, Vila Mariana 1, Consolação 1, Brás 1
- **Tipos no pipeline**: Apartamento 7, Casa 2, Sobrado 2, Kitnet/Studio 1, Casa de Condomínio 1, Galpão 1
- **Comissão estimada vs. recebida** (fev→jul/26): Estimada `[0, 0, 0, 1500, 0, 1800]` · Recebida `[0, 0, 0, 0, 1500, 1800]`
- **Funil atual**: Novo contato 2, Visita agendada 1, Em negociação 1, Documentação 1, Angariado 2, Publicado 1, Locado 2

## Pipeline

- Cabeçalho: **"14 imóveis cadastrados"** · filtro de cidade mostra "São Paulo" · contador "14 de 14".
- Badge do menu lateral: **8** (em andamento).
- **Lista** — 14 linhas; badges "parado" (stale) em: **CA-002, SO-004, CA-007, AP-008**. Coluna CADASTRO preenchida só para quem tem `data_angariacao` (KT-006 05/07, CA-007 10/06, AP-009 08/06, AP-008 05/06, CA-010 06/05); demais "—".
- **Kanban** — colunas e contagens: Novo contato **2**, Visita agendada **1**, Em negociação **1**, Documentação **1**, Angariado **2**, Publicado **1**, Locado **2**, Sem resposta **1**, Perdido **2**, Cancelado **1**.

## Metas (Julho de 2026)

| Meta | Progresso | Realizado / Meta | Faltam |
|---|---|---|---|
| Angariações | 20% | 1 / 5 un. | 4 un. |
| Imóveis locados | 50% | 1 / 2 un. | 1 un. |
| Comissão recebida | 36% | R$ 1.800 / R$ 5.000 | R$ 3.200 |

Histórico: Julho/26 → 5|1, 2|1, R$ 5.000|R$ 1.800 · Junho/26 → 4|**3**, 2|**0**, R$ 4.000|R$ 1.500 · Maio/26 → 3|**1**, 1|**1**, R$ 3.000|**R$ 0**.
(Observação: "realizado" de angariações usa a data de entrada em Angariado; locados idem para Locado; comissão pela data de recebimento — por isso maio mostra R$ 0 e junho R$ 1.500.)

## Agenda

- Badge do menu: **7** · Resumo: **7 pendentes, 1 atrasado, 1 para hoje**.
- Atrasadas (1): "Follow-up com proprietária da CA-002" (03/07, vencido).
- Hoje (09/07): "Visita ao sobrado da Rua Harmonia".
- Futuras visíveis: 10/07 "Retornar ligação — proprietário do AP-003", 12/07 "Cobrar certidão negativa pendente", "+ 3 compromissos futuros" (as 3 verificações de disponibilidade).
- Por tipo: Follow-up **4**, Retorno ao proprietário **1**, Visita **1**, Pendência **1**.
- Item concluído ("Enviar minuta do contrato…", done) não aparece em Pendentes.

## Insights (9 cards, nesta ordem)

1. 📍 Pinheiros concentra tentativas — **4 de 14 (29%)**.
2. ✅ Apartamento: melhor conversão — **33%** (7 cadastrados).
3. 📞 "Ligação telefônica" converte melhor — **50%** (3 contatos).
4. 🔎 Prospecção ativa: principal fonte — **3** angariados.
5. 📈 Julho/26 melhor mês — **1** locado.
6. 🚧 Gargalo em "Novo contato" — **1** parado há mais de 7 dias.
7. 🔄 **4** imóveis estagnados no pipeline.
8. 🔍 Principal motivo de perda: "Optou por outra imobiliária" — **1 de 3 (33%)**.
9. 🎯 Taxa de conversão geral: **33%** (6 processos encerrados).

> 🔁 **Divergência intencional pós-baseline (eixo de captação, 2026-07-25).** Os rankings de
> tipo/bairro/canal mediam conversão em **locação** — o fim de um funil longo — num painel cujo
> trabalho medido é a **angariação**. Com isso a amostra ficava minúscula (no fixture, 6 processos
> encerrados contra 9 captações decididas; na carteira real do usuário, 2 locações contra 15
> angariações) e a atribuição ficava errada: um imóvel captado que não aluga por causa do preço não
> diz nada sobre a qualidade daquele canal de captação. O eixo primário desses cards passou a ser a
> taxa de angariação (`conversaoCaptacao` em `web/lib/calculo/motor.ts`), com a locação como leitura
> secundária. A conversão em locação **não** foi removida: segue com card próprio e com o KPI do
> Dashboard.
>
> Efeitos neste baseline:
> - **entra** 🤝 "Taxa de angariação: **56%**" (5 angariadas × 4 perdidas antes do sim, 5 em disputa);
> - o card **2** passa a ler angariação: Apartamento **50%** (**2 de 4** decididas), não 33%;
> - o card **1** ganha o contraponto de retorno: em Pinheiros, **33%** de angariação (1 de 3);
> - **sai** o card **3** ("Ligação telefônica"): a amostra mínima agora é de captações **decididas**,
>   e nenhum canal do fixture chega a 3 — o card antigo se sustentava em 3 imóveis apenas
>   cadastrados, exatamente o tipo de afirmação sem lastro que `MIN_SAMPLE` existe para barrar.
>
> A contagem interna do `buildInsights` segue em **11** por coincidência (um entrou, um saiu). O
> teste executável já reflete os valores novos.

> 🔁 **Divergência intencional pós-baseline (silêncio não é derrota, 2026-07-31).** O app usava
> `STATUS_TERMINAL_NEGATIVE` para responder **duas perguntas diferentes**: "este registro está
> fechado?" (que `isStale`, o termômetro, o mapa e o desdobramento precisam saber) e "este processo
> foi **decidido**?", que é o que as taxas de conversão precisam. "Sem resposta" é sim terminal para
> o funil, mas não é decisão de ninguém: é silêncio, e é exatamente o público que o follow-up em
> lote trabalha (`FOLLOWUP_STATUS_ALVO`). O app dava por perdido quem a outra metade dele mandava
> cutucar hoje.
>
> Na carteira real de 31/07/2026 isso custava caro: a conversão de captação marcava **13,7%** porque
> 29 silêncios estavam no denominador como derrota; sem eles, **19,7%**. A mesma incoerência já havia
> aparecido na seção "Onde perdemos" do relatório completo, onde diluía "chegamos tarde" de **58%
> para 37%**.
>
> Nasce `STATUS_PERDA_DECIDIDA` (só Perdido/Cancelado) e `ehPerdaDecidida` no motor, usados por
> `conversaoCaptacao`, `metricsForRange`, `relatorios.ts`, `idadeAnuncio.ts` e `relatorioCompleto.ts`.
> `STATUS_TERMINAL_NEGATIVE` fica intacto para quem pergunta "está fechado?".
>
> **O silêncio não fica em aberto para sempre**, e essa ressalva é o que impede a taxa de virar
> otimismo silencioso: passadas `MAX_TENTATIVAS_SEM_RETORNO` (4) tentativas sem retorno, o próprio
> app desistiu de cutucar e o silêncio **é** a resposta. O limite é o mesmo dos dois lados de
> propósito — a conversão passa a dar por perdido exatamente quem o follow-up parou de trabalhar.
>
> Efeitos neste baseline (as fixtures têm 2 locados e 4 terminais, um deles "Sem resposta"):
> - KPI do Dashboard: conversão **33% → 40%** (2÷6 vira 2÷5), e o card 🎯 acompanha, de 6 para
>   **5 processos encerrados**;
> - 🤝 taxa de angariação **56% → 63%** (5 angariadas × **3** perdidas antes do sim, **6** em disputa);
> - card **2**: Apartamento **50% → 67%** (**2 de 3** decididas);
> - card **1**: o contraponto de retorno de Pinheiros **some** — com 2 captações decididas em vez de
>   3, o bairro caiu abaixo de `MIN_SAMPLE`. É a rede de segurança funcionando: denominador menor é a
>   contrapartida conhecida desta mudança, e o app prefere calar a afirmar taxa sem lastro.
>
> Os relatórios mensal e semanal do fixture não mudaram de número (não há terminal "Sem resposta"
> dentro dos períodos medidos).

## Mapa

- **8 imóveis localizados** (8 marcadores Leaflet) · aviso: "**6** imóvel(is) sem localização definida".
- Legenda com 3 categorias: Locado (conseguiu) / Em andamento / Tentado, sem sucesso.

## Relatórios

**Mensal — Julho de 2026:** Novos contatos **1** (▼2) · Angariações **1** (▼2) · Locados **1** (▲1) · Conversão **100%** · Comissão recebida **R$ 1.800** (▲ R$ 300) · Comissão estimada no período **R$ 1.800** · Tabela "angariados no período" com 1 linha: KT-006 (Ref. CRM "—", Kitnet/Studio, Angariado, R$ 1.900).
(Nota: no app antigo a conversão do relatório usava definição própria — locados ÷ angariados —, por isso 100% aqui convivia com 33% no Dashboard. **Alterado pós-migração** (achado A3, MIGRATION_NEXT.md §15): a conversão do relatório foi alinhada à fórmula do Dashboard (locados ÷ processos fechados), escopada ao período — Julho passou a mostrar **50%**. Divergência intencional deste baseline.)

**Semanal — 06/07/2026 a 12/07/2026:** Novos contatos **0** (▼1) · Angariações **0** (▼1) · Locados **0** (▼1) · Conversão **0%** · Comissão recebida **R$ 1.800** (▲ R$ 1.800) · Estimada no período **R$ 0** · "Nenhum imóvel chegou na etapa Angariado neste período."

## Roadmap (Integrações & IA)

Página estática — título "Integrações & IA", seções de integrações planejadas (CRM, OLX Pro / Canal Pro, WhatsApp, Google Agenda…). Sem números; paridade é de conteúdo/estrutura.

---

*Console do browser durante toda a navegação: sem erros e sem warnings. Navegação entre todas as views sem degradação.*
