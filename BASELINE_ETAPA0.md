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

## Mapa

- **8 imóveis localizados** (8 marcadores Leaflet) · aviso: "**6** imóvel(is) sem localização definida".
- Legenda com 3 categorias: Locado (conseguiu) / Em andamento / Tentado, sem sucesso.

## Relatórios

**Mensal — Julho de 2026:** Novos contatos **1** (▼2) · Angariações **1** (▼2) · Locados **1** (▲1) · Conversão **100%** · Comissão recebida **R$ 1.800** (▲ R$ 300) · Comissão estimada no período **R$ 1.800** · Tabela "angariados no período" com 1 linha: KT-006 (Ref. CRM "—", Kitnet/Studio, Angariado, R$ 1.900).
(Nota: a conversão do relatório usa definição própria de período — 100% aqui convive com 33% no Dashboard; comportamento atual a preservar.)

**Semanal — 06/07/2026 a 12/07/2026:** Novos contatos **0** (▼1) · Angariações **0** (▼1) · Locados **0** (▼1) · Conversão **0%** · Comissão recebida **R$ 1.800** (▲ R$ 1.800) · Estimada no período **R$ 0** · "Nenhum imóvel chegou na etapa Angariado neste período."

## Roadmap (Integrações & IA)

Página estática — título "Integrações & IA", seções de integrações planejadas (CRM, OLX Pro / Canal Pro, WhatsApp, Google Agenda…). Sem números; paridade é de conteúdo/estrutura.

---

*Console do browser durante toda a navegação: sem erros e sem warnings. Navegação entre todas as views sem degradação.*
