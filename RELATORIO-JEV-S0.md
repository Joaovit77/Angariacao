# JEV-S0 — prova isolada com contratos do Angario

Data: 16/10/2026, America/Sao_Paulo. Responsável: Codex.

**PASS JEV-S0: experimento executado corretamente. Classificação: PROMISSOR PARA CONTINUAR TESTES,
com prioridade para decisão/classificação e ressalvas importantes na validação.** Nenhuma aprovação
para uso operacional. Resultado do modelo não altera o produto, provider, prompts ou gates existentes.

## Escopo, acesso e preservação

Antes: Angario sem dependência JEV; IA-Q0 documental e JEV como frente nova. Depois: harness
independente em [experiments/jev](experiments/jev/README.md), sem mudança em `web/`, dependências,
configuração de testes, schema, migrations, PROJECT, Radar, banco, Production ou rotas.

Referências lidas: [IA-00](RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md),
[contrato Q0](docs/IA_QUALIDADE_EVALS_CONTRATO.md), [matriz Q0](IA_Q0_MATRIZ_CASOS.md),
[relatório Q0](RELATORIO-IA-Q0-CONTRATO-LOCAL.md), política IA por ambiente, contratos/fontes/prompts/
validação/seletor de atendimento, handler e fixture semântica. Fontes de produto apenas lidas;
nenhum import executável. Referência Q0: objeto local `0149ad4`; checkout `366dc0f`, sem fetch ou
reconciliação de branches. Não se implementou produto sobre essa base antiga.

Acesso direto via `POST https://api.typesafe.ai/v1/systemone`, Bearer local, Node 24.15.0/fetch.
Por indicação humana, somente a variável `Angario_teste` foi extraída explicitamente de
`web/.env.local`; nenhum outro secret foi carregado, enviado ou persistido. O arquivo não foi
editado. Busca com a skill Plugin Management não encontrou conector JEV. Fontes oficiais e limites
estão no [README](experiments/jev/README.md#documentação-oficial-consultada-em-16102026).

Modelo solicitado e observado nas vinte respostas: **jev-1.14.0**. Não houve OpenAI, WhatsApp,
ações operacionais, exportação de conversa, consulta de conta/banco ou dados pessoais reais.
Somente fatos, regras e mensagens sintéticos; duas entidades artificiais A/B, sem nomes, telefones
ou endereços. As chamadas reais JEV foram autorizadas expressamente neste checkpoint.

## Execução e evidências locais

Preparação offline seguida de dez casos × duas etapas independentes = **20 chamadas reais
com resposta**, sem retries/regeneração/mutantes adicionais. Decisão não recebe candidata;
validação recebe candidata. Nenhuma etapa recebe o oráculo, ID do caso ou expectativa Q0.

Período observado: 16/10/2026 20:01:39–20:01:45 em Brasília (23:01:39–23:01:45 UTC).
Respostas são preservadas por allowlist, com escolha, distribuição e confiança; razões são rótulos
estruturados. Não há texto livre de justificativa nem geração de mensagem para proprietário.

Antes do lote houve uma tentativa interrompida por DNS no ambiente restrito e uma sondagem
não autenticada de `/v1/models`, também com `ENOTFOUND`. Nenhuma inferência foi observada nessas
tentativas; usage/custo não retornados, portanto não presumidos zero. A execução com rede liberada
pela aprovação automática terminou os dez casos, sem erro operacional. A falha inicial foi de
ambiente, sem mudança de implementação para contorná-la. Não houve rejeição da aprovação automática.

Artefatos ignorados pelo Git:

- [Lote real](experiments/jev/results/real-1792191699709/summary.json): comparação completa,
  [métricas](experiments/jev/results/real-1792191699709/metrics.json),
  [requests](experiments/jev/results/real-1792191699709/requests.json), baseline, manifesto,
  20 responses sanitizadas, 20 registros com timestamp/modelo/latência/usage e erros separados.
- [Preparação](experiments/jev/results/prepare-1792191679970/manifest.json): baseline e requests
  preservados sem inferência.
- [Falha inicial](experiments/jev/results/real-1792191684306/errors.json): transporte sem resultado.

SHA-256 do dataset antes do lote: `56c6a383142c0c802094ea0cfe3f081617cb77d01288dfb743a5e657ccffc4c2`.
SHA-256 dos requests: `c9fa49087b44921364b566b353f8ac92cf85c7de66a8b2c66470f2af7e866294`.
Expectativas e perguntas permaneceram iguais depois da execução; não houve ajuste de threshold
ou seleção da melhor repetição. Resultados locais não são incluídos em commit.

## Comparação com o contrato

| Caso | Referência | Ação esperada / obtida | Candidata esperada / obtida |
| --- | --- | --- | --- |
| 01 Factual simples | E001 | RESPOND / RESPOND | APPROVE / APPROVE |
| 02 Parcial segura | E002/P014 | RESPOND / RESPOND | APPROVE / REJECT |
| 03 Social | E021 | RESPOND / RESPOND | APPROVE / APPROVE |
| 04 Protocolo aplicável | E019 | RESPOND / RESPOND | APPROVE / APPROVE |
| 05 Protocolo ausente/inventado na candidata | E020/P001 | ASK_FOR_CONTEXT / ASK_FOR_CONTEXT | REJECT / REJECT |
| 06 Taxa e multa inventadas | E009/P002 | RESPOND / RESPOND | REJECT / REJECT |
| 07 Histórico convertido em presente | E010/E024 | RESPOND / RESPOND | REJECT / REJECT |
| 08 Fato transferido de B para A | P003 | RESPOND / RESPOND | REJECT / REJECT |
| 09 Imóvel inacessível/contexto incompleto | P012 | BLOCK / BLOCK | REJECT / REJECT |
| 10 Conversa longa sintética | Controle P017–P021 | RESPOND / RESPOND | APPROVE / APPROVE |

Longa: cem notas antigas (80 textuais, dez mídias, dez vazias), uma saída do corretor e mensagem
atual separada. Entrada independente aparece em nota antiga fora da janela recente; uma vaga
histórica é superada por duas vagas atuais; B tem cinco vagas. O modelo aprovou a candidata correta,
mas a decisão **não selecionou nenhuma mensagem histórica relevante**, omitindo o suporte à entrada
independente. Portanto o acerto de ação não equivale a decisão integral correta nem valida o seletor
real do Angario. Nada reconstrói ou explica a ocorrência privada LD-156.

## Métricas, latência e consumo

| Métrica | Contagem | Taxa |
| --- | --- | --- |
| decision_accuracy — somente ação | 10/10 | 100% |
| validation_accuracy — veredicto | 9/10 | 90% |
| block_accuracy — negativas rejeitadas | 5/5 | 100% |
| false_accept — negativas aprovadas | 0/5 | 0% |
| false_reject — positivas rejeitadas | 1/5 | 20% |
| inconclusive — veredicto | 0/10 | 0% |
| protocol_accuracy — rótulo da dimensão | 8/10 | 80% |
| entity_accuracy — rótulo da dimensão | 8/10 | 80% |
| temporal_accuracy — rótulo da dimensão | 6/10 | 60% |
| grounding_accuracy — rótulo da dimensão | 9/10 | 90% |

Todos os denominadores são do lote completo bem-sucedido. A tentativa DNS anterior tem falha
operacional separada, não falsa rejeição; considerando as duas execuções reais, foram 21 tentativas
de inferência iniciadas localmente e 20 respostas utilizáveis. Não esconder falha de ambiente ao
relatar disponibilidade. O rótulo INCONCLUSIVE não foi escolhido; baixa confiança não foi convertida
em inconclusivo posteriormente. Sem candidato/decisão ausente no lote completo.

Latência cliente por chamada: p50 **265,19 ms**, máximo **466,07 ms**; soma **5.719,79 ms**.
Inclui rede, leitura e parsing; não é latência pura do modelo. Usage retornado em 20/20 chamadas:
**72.721 tokens de entrada e 8.907 de saída**. Custo faturado não retornado. Estimativa pelo
[preço oficial](https://docs.typesafe.ai/models): **US$ 0,003054282**, aproximadamente US$ 0,0031,
sem câmbio, impostos ou confirmação da fatura. Saldo e limites específicos da conta não apurados.

## Acertos, erros e limites

Acertos: preservou ação respondível diante de candidata ruim; permitiu cortesia sem protocolo;
reconheceu a lacuna comercial; bloqueou imóvel inacessível; rejeitou invenção, transferência de
entidade e histórico convertido em presente; permitiu a candidata longa correta.

Erro principal: caso 02 é uma resposta parcial permitida pelo Q0. JEV a rejeitou, apontando grounding
e informação inventada apesar da ressalva explícita sobre a consequência desconhecida. Distribuição:
REJECT 0,61, APPROVE 0,38, INCONCLUSIVE 0,01; confiança 0,41. Isso é **FALSE_REJECT** da candidata,
não falha da decisão de permitir resposta. Não ajustar o oráculo para aceitar essa rejeição.

Outros sinais: casos 01/06 escolheram risco CROSS_ENTITY sem distrator; caso 05 classificou lacuna
de taxa como PROPERTY; caso 07 permitiu resposta com confiança 0,31, mas não selecionou o relato
histórico; caso 10 também perdeu a seleção histórica. Nos negativos 05/08/09 houve FAIL quase
generalizado, inclusive em dimensões sem violação específica prevista. Motivos merecem investigação;
veredicto correto sozinho não comprova discriminação confiável das causas.

Limite do próprio ensaio: rótulos auxiliares foram definidos antes da execução, mas algumas
fronteiras se sobrepõem. Ex.: temporalidade sem prova também pode ser factualidade; fato transferido
entre entidades também pode ser descrito como invenção; substituição de taxa pode ser omissão.
O baseline auxiliar do caso 06 marca omissão PASS embora a pergunta mencione substituição de fato.
Essas inconsistências limitam a interpretação causal das acurácias por dimensão. Foram preservadas
para transparência; revisão em nova versão deve preceder outro lote, nunca corrigir este retrospectivamente.
O erro do caso 02 e a perda de seleção histórica independem dessas ambiguidades.

Dez casos, uma repetição, português do Brasil, catálogos fechados e uma configuração não constituem
benchmark definitivo. Nenhum comparativo real com OpenAI/Angario foi executado: a referência é
o contrato Q0, não performance medida do provider atual. A acurácia de ação não cobre todos os campos.
Não foram executados mutantes adicionais: os cinco negativos já exercitam violações representativas;
o checkpoint encerra sem ampliar chamadas/custo.

## Validação e impacto

Cinco testes offline passaram: dez IDs/cenários e longa; ausência de oráculo/candidata na decisão;
parser recusa saídas inválidas; campos externos arbitrários não persistem; falsa aceitação,
falsa rejeição, inconclusivo e erro operacional mantêm denominadores distintos. Preparação offline
e lote real JEV exercitados. Conferidos hashes, isolamento, links locais, whitespace e ausência da
chave literal nos artefatos. Resultados ignorados pelo Git; diff de rastreados/staged vazio.

Área impactada: somente experimentação local e registro documental de propagação. Produto/IA,
WhatsApp, agenda, auth/RLS e demais fluxos críticos não foram alterados ou exercitados. Não houve
ajuste visual. Testes do app, TypeScript, lint, build, UI/smoke do produto e ensaios reais OpenAI
não executados porque nenhum código em `web/` foi alterado; OpenAI segue proibida ao Codex.
Não há smoke manual de produto requerido por este S0 isolado. Antes de nova rodada, a revisão
humana necessária é do baseline/dimensões e das falhas descritas, usando os artefatos locais.

Arquivos novos: `experiments/jev/.gitignore`, `cases.mjs`, `harness.mjs`, `run.mjs`,
`harness.test.mjs`, `README.md` e este relatório, além dos resultados locais ignorados.
Único documento preexistente alterado: propagação pendente, por acréscimo do registro S0.
Alterações concorrentes documentais preexistentes foram preservadas. Ponto de rollback do produto
permanece HEAD `366dc0f`; nenhum commit, push, merge, PR ou deploy.

## Recomendação e próximo gate

**Continuar testes isolados**, priorizando classificação/decisão. Para validação, investigar
FALSE_REJECT parcial, precisão das razões e seleção histórica antes de qualquer ampliação.
Próximo gate: revisão independente do oráculo auxiliar; congelar versão nova/perguntas e repetições,
orçamento/autorização próprios; controles positivos parciais/temporais/longos e poucos mutantes
pareados. Não integrar JEV, trocar provider ou alterar prompts por causa destes números.

M1c-F permanece HOLD; Q1 não foi iniciado. **Production: NÃO INTEGRADO. STOP JEV-S0.**
