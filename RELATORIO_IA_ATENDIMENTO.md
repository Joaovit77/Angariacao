# Continuação: semântica do auditor de atendimento

**Sugerir com IA pronto para smoke.** A correção e as verificações desta continuação estão
descritas antes do registro histórico preservado abaixo. Não autoriza merge ou Production.

## Base e escopo

Worktree isolada: `angario-ia-atendimento-robustez`.
Branch: `astra/ia-atendimento-robustez-sugestoes`.
Após `git fetch origin`, HEAD e origin estavam em
`173bf4e36ed17c34cfa38edb1789176ffd5b7f4d`, com árvore limpa e divergência 0/0.
Os commits `79fa339` e `173bf4e` foram inspecionados; não foram alterados.
A worktree antiga na branch `codex/fase2-central-radar-investigador` foi preservada.

## Evidências anteriores e causa localizada antes da correção

O artefato privado da última execução anterior foi localizado e lido. Os quatro rascunhos
abaixo terminaram com auditoria `{ problemas: [] }` e HTTP 200:

| Caso anterior | Trecho aprovado indevidamente | Informação omitida ou extrapolação |
| --- | --- | --- |
| Histórico, repetição 1 | “Vou confirmar esse ponto pra te passar certinho. Se quiser, me diz se a sua dúvida é sobre comissão ou sobre a divulgação.” | Não comunica ausência de exclusividade, liberdade de anúncio próprio/com outras imobiliárias e ausência de custo antes da locação, apesar das fontes selecionadas. |
| Histórico, repetição 2 | “Claro — me fala qual parte você quer saber certinho, que eu te respondo sem passar informação errada.” | Substitui a resposta parcial possível por esclarecimento genérico. |
| Outra imobiliária, repetição 1, após regeneração | “Se a outra imobiliária alugar, tudo bem. Como a gente trabalha sem exclusividade, o imóvel pode seguir com a divulgação por lá também.” | Projeta permissão de divulgação anterior à locação para a situação após locação por terceiro. |
| Outra imobiliária, repetição 2 | “Se outra imobiliária alugar primeiro, tudo certo — como a gente trabalha sem exclusividade, você segue livre.” | Afirma permanência de liberdade após o evento sem fonte para esse momento; uma oferta vaga de confirmação no final não corrige a afirmação. |

A primeira candidata do terceiro caso tinha sido rejeitada com `informacao-sem-fonte`;
a segunda, também inadequada, recebeu lista vazia. Isso confirma falha de julgamento na
auditoria da segunda tentativa, não uma terceira geração ou ausência de auditoria.

O histórico de revisão registra protocolos selecionados, rascunhos e códigos, mas não o
raciocínio interno do auditor. Portanto, a explicação causal abaixo deriva do código e da
reprodução controlada, sem inventar justificativas internas do modelo.

- **Prompt:** proibição absoluta de repetir condições já explicadas coexistia com a obrigação
  de retomar a parte relevante; preferência genérica por confirmar informação ausente podia
  suprimir a resposta parcial. O auditor não operacionalizava a diferença entre cobertura da
  pergunta e mera ausência de invenção. Temporalidade aparecia especialmente em cobrança e
  contradição; faltava exigir evidência para a continuidade de qualquer fato, mesmo sem
  contradição posterior.
- **Contrato semântico:** o campo `problemas` tinha apenas enum/tamanho; uma lista vazia
  aprovava sem descrição explícita dos requisitos de cobertura e temporalidade.
- **Parser/normalização:** consumiam corretamente a lista vazia recebida. Não há evidência de
  que códigos de rejeição tenham sido apagados, de JSON inválido aceito ou de truncamento dos
  dados nos casos isolados. Permanecem intactos.
- **Critério determinístico:** não dispõe de fontes/contexto suficientes para julgar cobertura
  ou continuidade, e delega esse julgamento à auditoria já obrigatória. Não se acrescentou
  regex de palavras temporais, pois rejeitaria negações, perguntas e relatos qualificados.
- **Teste anterior:** mocks comprovavam a reação do handler a uma rejeição, mas não o julgamento
  real do auditor. A matriz nova fixa expectativas de produto antes da alteração.

A matriz usa fontes sintéticas e trechos genéricos dos quatro rascunhos, sem ID real nem
conversa completa. Preserva a questão e os fatos do caso de referência; não alega reproduzir
todos os prompts privados do ensaio anterior nem modifica o histórico atual daquele imóvel.

## Menor correção aplicada

No prompt existente, a auditoria confronta a pergunta com a parte conhecida e verifica o
momento de cada afirmação. Retomada relevante deixa de conflitar com repetição da oferta.
A confirmação cobre somente a lacuna. Histórico pode ser relatado como passado, mas não
convertido em presente por ausência de notícia de mudança.

A descrição do mesmo campo `problemas` explicita esses requisitos. O formato continua
`{ problemas: [...] }`, com os mesmos campos, enums, limites e parser estrito.
Omissão usa `omissao-parte-comprovada`; extrapolação usa `informacao-sem-fonte`, ou
`cobranca-sem-fonte` quando financeira. Os motivos existentes alimentam a regeneração.

A primeira correção eliminou as aprovações indevidas da matriz, mas rejeitou três respostas
válidas. O ajuste final esclarece que negar certeza não afirma continuidade, fatos tipados
do imóvel dispensam protocolo comercial, e confirmar B não invalida a resposta comprovada A.
As expectativas não foram alteradas para acomodar esses erros.

Não foi necessária nova camada, validação adicional ou refatoração: a fonte já chegava ao
auditor e o handler já reagia corretamente aos códigos. A suficiência está demonstrada nesta
matriz, não constitui garantia universal de julgamento de um modelo não determinístico.

## Arquivos alterados

| Arquivo | Função da alteração |
| --- | --- |
| [prompts.ts](web/lib/ia/atendimento/prompts.ts) | Critérios de cobertura/temporalidade e exceções que preservam respostas parciais, negações de certeza e fatos do cadastro. |
| [contratos.ts](web/lib/ia/atendimento/contratos.ts) | Descrição semântica do campo existente, sem mudança de forma ou enum. |
| [atendimento-semantico.ts](web/tests/fixtures/atendimento-semantico.ts) | 24 casos de produto, incluindo as quatro respostas anteriores, seis formas de presente/continuidade, positivos e domínio diferente. |
| [ia-auditor-semantico-real.test.ts](web/tests/ia-auditor-semantico-real.test.ts) | Auditor real, duas repetições, uma chamada por caso, sem banco ou mensagens; falhas mostram apenas códigos. |
| [ia-atendimento-robustez.test.ts](web/tests/ia-atendimento-robustez.test.ts) | Quatro regressões de recuperação/bloqueio, manutenção das fontes, diagnóstico e sanitização. |
| [PROJECT.md](PROJECT.md) | Regra permanente de cobertura e temporalidade. |
| [RELATORIO_IA_ATENDIMENTO.md](RELATORIO_IA_ATENDIMENTO.md) | Evidências, causa, evolução dos resultados e limites da validação. |

Total: **7 arquivos**, sendo somente **2 de execução**, **3 de testes/fixtures** e
**2 documentos**. Nenhuma alteração visual.

## Resultados exatos

| Conjunto | Arquivos | Aprovados | Falhos | Ignorados |
| --- | ---: | ---: | ---: | ---: |
| Auditor real antes da correção | 1 | 29 | 19 | 0 |
| Auditor real após primeira correção | 1 | 45 | 3 | 0 |
| Auditor real após ajuste final | 1 | 48 | 0 | 0 |
| Direcionados finais | 8 | 125 | 0 | 0 |
| Regressões finais | 47 | 681 | 0 | 0 |
| Suíte completa local final | 160 descobertos; 157 exercitados | 2.072 | 0 | 50 |

A suíte completa descobre **2.122 testes**. Seus 50 ignorados são os 48 casos do auditor
real, executados separadamente, e dois ensaios antigos que dependem de contexto real/comparação.
Considerando a suíte completa e o auditor final sem duplicar testes, **2.120 testes foram
aprovados em 158 arquivos**, com **2 testes em 2 arquivos não executados**.
Os conjuntos direcionado e de regressão são subconjuntos da suíte; não se somam a esse total.

A base produziu 16 aprovações indevidas, duas rejeições indevidas da resposta parcial e uma
rejeição pelo código errado. Não houve erro operacional/estrutural nessa rodada.
Modelo e esforço permaneceram `gpt-5.4-mini/low` nas três rodadas (48 chamadas de auditoria
por rodada, 144 no diagnóstico completo). Não houve geração no ensaio isolado do auditor.
A repetição após a primeira alteração foi inicialmente impedida pela revisão automática por
limite de uso; só foi retomada após o usuário confirmar a restauração do limite e autorizar.

TypeScript (`tsc --noEmit`), ESLint e build Next.js aprovados após o último ajuste.
Build com `next build --webpack`: 60 páginas geradas. Mesma escolha da verificação anterior
pela junction externa de dependências; nenhuma configuração de aplicação foi modificada.
`git diff --check`: aprovado. Aviso existente de formato da configuração do Vitest não
impediu execução; avisos Git de conversão LF/CRLF não representam erro de whitespace.

### Testes direcionados por arquivo

| Arquivo | Aprovados | Falhos |
| --- | ---: | ---: |
| `feedback-sugestoes-ia.test.ts` | 15 | 0 |
| `ia-atendimento-robustez.test.ts` | 57 | 0 |
| `ia-atendimento.test.ts` | 28 | 0 |
| `ia-executor.test.ts` | 2 | 0 |
| `ia-handler-atendimento.test.ts` | 5 | 0 |
| `ia-observabilidade.test.ts` | 3 | 0 |
| `ia-system-prompt.test.ts` | 4 | 0 |
| `protocolos.test.ts` | 11 | 0 |

### Regressões por arquivo

Abrangem atendimento, IA, WhatsApp (envio, recebimento, identidade e histórico), protocolos,
continuidade, Assistente, ações e autenticação. São validações automatizadas, sem efeitos reais.

| Arquivo | Aprovados | Falhos |
| --- | ---: | ---: |
| `api-whatsapp-enviar.test.ts` | 6 | 0 |
| `assistente-acesso.test.ts` | 3 | 0 |
| `assistente-acoes.test.ts` | 34 | 0 |
| `assistente-camadas.test.ts` | 4 | 0 |
| `assistente-capacidades.test.ts` | 11 | 0 |
| `assistente-cliente.test.ts` | 4 | 0 |
| `assistente-conhecimento.test.ts` | 7 | 0 |
| `assistente-contexto-tipado.test.ts` | 19 | 0 |
| `assistente-contexto.test.ts` | 8 | 0 |
| `assistente-continuidade.test.ts` | 16 | 0 |
| `assistente-ferramentas.test.ts` | 45 | 0 |
| `assistente-historico.test.ts` | 11 | 0 |
| `assistente-markdown.test.ts` | 3 | 0 |
| `assistente-mercado.test.ts` | 3 | 0 |
| `assistente-orquestrador-continuidade.test.ts` | 2 | 0 |
| `assistente-pedido.test.ts` | 3 | 0 |
| `assistente-posicao.test.ts` | 2 | 0 |
| `assistente-preferencia-flutuante.test.ts` | 4 | 0 |
| `assistente-protocolos.test.ts` | 3 | 0 |
| `assistente-somente-leitura.test.ts` | 2 | 0 |
| `assistente-superficies.test.ts` | 6 | 0 |
| `auth.test.ts` | 8 | 0 |
| `conexao-whatsapp.test.ts` | 19 | 0 |
| `feedback-sugestoes-ia.test.ts` | 15 | 0 |
| `historico-whatsapp-bidirecional.test.ts` | 17 | 0 |
| `ia-abordagem-anuncio.test.ts` | 11 | 0 |
| `ia-anuncio.test.ts` | 10 | 0 |
| `ia-atendimento-robustez.test.ts` | 57 | 0 |
| `ia-atendimento.test.ts` | 28 | 0 |
| `ia-classificacao.test.ts` | 31 | 0 |
| `ia-configuracao.test.ts` | 6 | 0 |
| `ia-dashboard.test.ts` | 15 | 0 |
| `ia-dispatcher.test.ts` | 3 | 0 |
| `ia-executor.test.ts` | 2 | 0 |
| `ia-gerar-anuncio.test.ts` | 17 | 0 |
| `ia-handler-atendimento.test.ts` | 5 | 0 |
| `ia-mapa.test.ts` | 1 | 0 |
| `ia-observabilidade.test.ts` | 3 | 0 |
| `ia-system-prompt.test.ts` | 4 | 0 |
| `ia.test.ts` | 25 | 0 |
| `identidade-whatsapp.test.ts` | 11 | 0 |
| `importacao-conversa-whatsapp.test.ts` | 10 | 0 |
| `piloto-automatico-assistente.test.ts` | 12 | 0 |
| `protocolos.test.ts` | 11 | 0 |
| `status-sem-resposta-assistente.test.ts` | 16 | 0 |
| `webhook-whatsapp.test.ts` | 78 | 0 |
| `whatsapp.test.ts` | 70 | 0 |

## Compatibilidade, segurança e limites

Na matriz final, resposta direta e parcial continuam permitidas; omissão relevante e
extrapolação são rejeitadas; histórico qualificado, incerteza e informação temporal incompleta
admitem resposta conservadora. Fonte irrelevante não precisa ser citada. Protocolos continuam
autoridade comercial; dados do imóvel continuam exigindo a fonte correspondente.
Detalhes financeiros desconhecidos não foram inventados nas respostas aceitas da matriz.

O handler e executor não mudaram: máximo de **1 geração inicial + 1 regeneração** e
**5 chamadas totais** por solicitação. Rejeição na segunda tentativa termina sem terceira
geração. As novas regressões verificam fontes mantidas nas tentativas e ausência do texto
rejeitado no pedido de regeneração e nos logs.

RLS, autenticação, isolamento por tenant/user_id e service role preservados. Nenhuma service
role nova, migration, consulta nova ao Supabase, escrita em Production ou mudança de conversa,
Pipeline/Agenda. Nenhuma mensagem enviada. Nenhum conteúdo privado novo em logs.
Somente a chave OpenAI local já configurada foi utilizada em memória para o ensaio sintético;
não foi copiada para arquivos, Git, outro ambiente ou relatório.

Não houve mudança de modelo/esforço, teste de Terra, embeddings, novas ferramentas/agentes,
nova autonomia, rebase, reset, stash, merge, alteração da main ou início da Fase 7.
O SHA inicial é o ponto de rollback. Commit/push desta continuação devem atingir somente a
feature branch, após estas verificações.

## Validação manual ainda necessária

**Validação automatizada concluída, mas o fluxo real não foi exercitado.**
**Aguardando smoke manual.** O usuário reservou o smoke autenticado para depois desta etapa.

Em ambiente autorizado e contato/contexto seguro, sem alterar o histórico de referência:

1. Clicar somente em **Sugerir com IA** para pergunta integral e para pergunta parcialmente
   conhecida; conferir rascunho editável usando os fatos e confirmando apenas a lacuna.
2. Em contexto com informação passada, conferir atribuição ao passado e ausência de
   continuidade presente inventada; com evidência atual, conferir reconhecimento compatível.
3. Conferir manutenção dos protocolos aplicáveis e mensagens de bloqueio seguras.
4. Não clicar em **Enviar mensagem**; verificar ausência de envio e de mudança de
   conversa, Pipeline ou Agenda.

O ensaio do auditor não valida sessão, UI, RLS entre usuários ou serviço WhatsApp real.
Esses limites permanecem mesmo com toda a matriz aprovada. Nenhum smoke autenticado novo
foi executado nesta continuação. Não fazer merge nem publicar Production nesta etapa.

Metodologia: casos com expectativas fixas e exemplos positivos/negativos, conforme
[orientações oficiais de avaliação](https://developers.openai.com/api/docs/guides/evaluation-best-practices).

---

## Registro histórico da tarefa anterior, até 173bf4e

As conclusões e pendências abaixo descrevem exclusivamente o estado anterior à continuação.

**Sugerir com IA bloqueado.** A correção de contrato e dos falsos bloqueios foi implementada,
mas a qualidade semântica ainda não atende à aceitação. Não publicar esta branch.

Base verificada após fetch: `origin/main = 41d9658be65d21807e53c66b31a525022a27f73c`.
Branch: `astra/ia-atendimento-robustez-sugestoes`, em worktree isolada.
A main local de outra worktree estava em `e53601c84f7fedfaafe1c64fe0e56ef4cb6ddce0`.
As alterações preexistentes da pasta original foram preservadas.

## Arquitetura e causas encontradas

Sugerir com IA → cliente envia ID e sessão → `/api/ia` verifica autenticação/permissão →
handler lê imóvel/notas sob RLS → seleciona conversa → separa informação comercial e conduta →
decisão estruturada → geração estruturada → barreiras locais → auditoria independente →
no máximo uma regeneração e nova auditoria → HTTP → rascunho editável na UI.
A UI e o fluxo de envio não foram alterados.

Antes: a decisão podia bloquear todo o atendimento por uma lacuna secundária; o validador
resumia diferentes problemas em contexto incompleto; parsers aceitavam saídas que o schema
proibia; textos/protocolos eram cortados silenciosamente em 600 caracteres. A expressão
regular de explicar condições rejeitava qualquer menção a taxa, inclusive uma promessa segura
de confirmar sua existência. Havia orientações conflitantes sobre repetir fatos já explicados.

Agora, na branch:

- Mensagens: atual + até 12 anteriores + 4 antigas relevantes; preserva ordem, autoria e IDs.
  Declara quantidade omitida; textos longos preservam início/fim e marcam o trecho ausente.
  A seleção continua limitada e lexical: não garante recuperar todo fato antigo importante.
- Protocolos: continuam autoridade comercial. Conteúdo inteiro até 4.000 caracteres por item,
  24.000 no catálogo e 40 itens, com até 5 selecionados pela decisão. Fontes excedentes são
  omitidas e contadas no diagnóstico; não se presume que regra ausente inexiste. Conduta
  excedente bloqueia explicitamente para evitar executar uma regra cortada.
- Fatos/ausência: cadastro atual tem envelope de origem e autoridade; campo ausente é desconhecido.
  Histórico é fala atribuída, não autorização de escrita. Mensagens recentes prevalecem sobre
  antigas; abordagem legada declara fidelidade limitada. Não foi criado timestamp por fato.
- Decisão: mantém o contrato existente, sem nova máquina de estados integral/parcial/bloqueada.
  Pode autorizar uma resposta limitada apesar de lacunas. Não deve substituir as fontes.
- Geração: usa a parte comprovada e confirma apenas o detalhe desconhecido; não pode extrapolar
  modalidade, agente ou momento para inferir cobrança, isenção, multa ou procedimento.
- Validação: códigos fechados para regra/cobrança sem fonte, contradição, entidade sem fonte,
  omissão relevante, desvio, protocolo indevido e incompatibilidade de ação/perfil/texto.
  Mencionar taxa não é executar ação: explicar condições passa pela auditoria semântica obrigatória.
- Regeneração: somente falha corrigível por reescrita; nunca erro estrutural ou intervenção terminal.
  Teto autorizado pelo usuário: duas gerações e cinco chamadas totais, incluindo decisão/auditorias.
  Retries automáticos do SDK desativados apenas no atendimento; timeout de 45 s por chamada.
- HTTP: 200 entrega rascunho aprovado; 422 termina sem sugestão por domínio; 500/502 preservam
  falhas operacionais/estruturais. Não foi introduzido catch-all 422.
- Logs: operação, etapa, tentativa, modelo/esforço, duração, tokens e código; distinguem validação
  aprovada/rejeitada/não executada/erro. Sem conversa, prompt, rascunho, headers ou credenciais.

Da Fase 6 foram reutilizados princípios de origem, autoridade, ausência e temporalidade.
Não foram importados orquestrador, ferramentas, loaders ou ações do Assistente.
A separação entre obrigatório e opcional permanece: robustez semântica é obrigatória;
comparação/ajuste de modelo é melhoria posterior, que não substitui a correção do fluxo.

## Todos os caminhos de 422 do handler

| Etapa | Código interno → resposta | Geração / validação | Recuperação e falso positivo |
| --- | --- | --- | --- |
| Contexto | imovel-nao-encontrado → historico-insuficiente | Não / não | Terminal na requisição; preserva ausência sob RLS sem revelar outro tenant |
| Contexto | historico-sem-mensagem-textual → historico-insuficiente | Não / não | Terminal; mídia, ausência de texto ou última fala do corretor podem impedir sugestão |
| Contexto | regras-conduta-excedem-limite → contexto-incompleto | Não / não | Terminal; limite explícito, pode impedir conversa simples em catálogo excessivo |
| Decisão | baixa-confianca | Não / apenas parse e decisão | Terminal; pode ser falso bloqueio do modelo |
| Decisão | contexto-incompleto | Não / apenas parse e decisão | Terminal; ainda depende do modelo aplicar corretamente a resposta parcial |
| Decisão | decisao-bloqueada → intervencao-humana | Não / apenas parse e decisão | Terminal; pode ser classificação excessiva |
| Geração | geracao-reprovada, protocolo-inadequado, resposta-longa, perfil-incompativel, informacao-sem-fonte, acao-incompativel, apresentacao-repetida | Sim / local, sem auditoria do candidato rejeitado localmente | Primeira reescrevível regenera; segunda termina. Heurísticas ainda podem produzir falsos positivos |
| Auditoria | informacao-sem-fonte, cobranca-sem-fonte, contradicao-protocolo, entidade-sem-fonte, omissao-parte-comprovada, desvio-de-assunto, protocolo-inadequado, acao-incompativel, perfil-incompativel, resposta-longa, apresentacao-repetida | Sim / local e modelo | Primeira regenera; segunda termina. Modelo pode rejeitar ou aprovar indevidamente |
| Auditoria | intervencao-humana → intervencao-humana | Sim / local e modelo | Terminal, mesmo acompanhada de problema recuperável |
| Fim defensivo do laço | geracao-reprovada | Caminho não alcançado no fluxo normal | Não cria terceira geração |

Os códigos sem representação própria na UI convergem para geracao-reprovada; protocolo-inadequado
mantém sua representação. O diagnóstico interno conserva a causa específica.
Erros de consulta retornam 500; falhas de SDK/estrutura retornam 502; falha de persistência opcional
da sugestão retorna 500. Requisição inválida e autenticação/permissão continuam 400/401/403.

## Contrato estruturado

O handler produz resposta-estrutural-invalida quando JSON.parse ou o parser estrito falha.
Não é enum solicitado ao modelo. Retorna falha-modelo/502, sem regeneração.
Decisão exige seus 14 campos e enums; geração exige mensagem string e protocolosUsados string[];
auditoria exige problemas com enum fechado. Todos os campos são obrigatórios e todos os objetos
proíbem propriedades adicionais. O parser recursivo usa o mesmo schema enviado ao OpenAI com
json_schema/strict. JSON null, campos ausentes, tipos/enums errados e propriedades extras são recusados.
Não se relaxou o schema para aceitar qualquer saída.

A incompatibilidade anterior entre schema e parser foi corrigida; corte de título no prompt foi
removido. Recusa/truncamento do provedor ainda chegam como texto vazio e falham estruturalmente.
Não houve saída estrutural inválida na última matriz do modelo atual. Isso não comprova
compatibilidade de Terra: sua chamada falhou antes de gerar.

## Ensaios reais e qualidade

A fotografia do LD-288 foi lida com tenant explícito. O histórico original de sete mensagens
foi reconstruído somente em memória até 04/09/2026 09:37:10, com protocolos atuais.
Hoje existem três mensagens posteriores do corretor; não há a mesma entrada pendente na UI.
A reprodução da base confirmou 422/contexto-incompleto na decisão, sem geração, em 6.473 ms.

A matriz usa uma fotografia única por execução, duas repetições e os mesmos contextos,
protocolos, perfil, schemas e limites para cada modelo. São ensaios exploratórios pequenos,
sem alegação estatística. O teste registra resultados e limites; passar o ensaio NÃO significa
que os textos passaram na revisão humana. As rodadas anteriores também foram consideradas:
a primeira tinha 3/10 sucessos HTTP; a segunda, 9/10. A variação não foi ocultada.

Última rodada, gpt-5.4-mini/low:

| Caso | HTTP 200 | Latência média | Revisão qualitativa / edição necessária |
| --- | --- | --- | --- |
| LD-288 histórico | 2/2 | 8,49 s | Insuficiente: uma resposta evasiva e outra pede esclarecimento sem retomar a parte comprovada; reescrita relevante |
| Ok | 2/2 | 5,92 s | Natural, objetivo, sem nova autorização; nenhuma edição necessária na amostra |
| Taxa de administração | 2/2 | 5,58 s | 10% e condição de administração completa corretos; uma resposta contém oferta opcional dispensável |
| Outra imobiliária / parcial | 2/2 | 10,42 s | Não atende: confirmação da consequência desconhecida insuficiente; uma resposta confunde divulgação após locação com permissão anterior; reescrita relevante |
| Sem protocolo | 2/2 | 6,87 s | Não inventou valor; linguagem pressupõe uma taxa em vez de confirmar sua existência e uma resposta menciona cadastro indevidamente; edição necessária |

Foram 32 chamadas, 11 gerações, uma rejeição em 11 candidatos (9,1%), uma regeneração em
10 pedidos e nenhuma rejeição terminal. Entrada: 111.588 tokens, dos quais 69.888 em cache;
saída: 9.321 tokens. Latência média total: 7,46 s. Contagens incluem decisão e auditoria.
A aprovação de 10/10 pelo fluxo NÃO representa aprovação de qualidade: o auditor deixou passar
omissão e extrapolação temporal. Esse é o bloqueio obrigatório remanescente.

O modelo atual foi confirmado pelo default de código, tabela ia_configuracoes vazia e registros
recentes de uso: gpt-5.4-mini, esforço low. Terra/low retornou 502/nao-configurado na primeira
chamada (181 ms, sem geração nem tokens reportados). As demais chamadas desse modelo foram
interrompidas para evitar custo e repetição de falha de acesso. Não é uma medição de sua latência
nem qualidade. Consumo relativo e vantagem de Terra não puderam ser medidos.

Recomendação exclusiva para atendimento: manter a configuração atual sem alteração de Production,
não publicar esta correção como pronta e não escolher Terra sem acesso e comparação válida.
Não há justificativa para medium ou Sol nesta tarefa. Classificação, operações e Assistente
não foram trocados. A causa observada não pode ser atribuída somente ao tamanho do modelo.

## Branch antiga, escopo e segurança

O SHA f85cafb18227e31ef24b02917ea5b47886187749 não está disponível localmente; fetch explícito
retornou not our ref e a branch remota não foi encontrada. Portanto não existe comparação de
código comprovada com ela. Não houve merge/cherry-pick nem importação presumida das suas camadas.
A implementação desta branch preserva o fluxo de três etapas da main e evita novos estados de
fatos essenciais, cobertura, entidades e decisão parcial que possam discordar entre si.

Nenhuma migration. Nenhuma alteração em schema, RLS, tenant, autenticação ou políticas.
Nenhuma conversa, Pipeline ou compromisso alterado; nenhuma mensagem enviada.
O ID excluído pelo usuário não foi usado para consulta ou alteração. Ensaios externos não
persistem sugestões, consumo ou logs no banco; rascunhos de revisão ficam somente em artefato
local privado, fora do Git. Nenhum secret foi copiado para Preview/Production.

## Verificações e pendências

- Direcionados após a correção final: 86 testes de atendimento.
- Regressões e suíte completa: 157 arquivos aprovados, 2.068 testes aprovados, dois ensaios
  externos ignorados por padrão; abrangem IA, WhatsApp, protocolos, continuidade, Assistente,
  ações e autenticação. Os ensaios externos foram executados separadamente.
- TypeScript, ESLint, build e diff check: consultar o fechamento abaixo.
- RLS/tenant: contratos e regressões automatizados preservados; não foi feito smoke entre
  dois usuários reais. O adaptador em memória com leitura privilegiada filtrada não comprova RLS.
- UI: ambiente local abriu; a sessão posterior voltou ao login. Não houve smoke autenticado
  completo até o editor. A rota de envio foi bloqueada no navegador de teste.

Validação automatizada concluída, mas o fluxo real não foi exercitado de ponta a ponta.
Aguardando smoke manual, além da correção semântica obrigatória. Roteiro antes de qualquer merge:
com sessão local/Preview autorizada, usar contexto controlado com entrada pendente; clicar somente
Sugerir com IA; conferir rascunho editável nos casos simples, taxa e parcialmente conhecido;
verificar diagnóstico sem conteúdo privado e ausência de escrita de conversa/Pipeline/agenda.
Nunca clicar em Enviar mensagem. O histórico atual do LD-288 não deve ser alterado para esse teste.

Não houve push, Preview, merge ou publicação em Production. Não foi iniciada Fase 7.
A implementação e o diagnóstico ficam em commits locais para revisão; a task permanece
independente do roadmap. Não iniciar outra cascata de correções sem nova decisão de escopo.

## Fechamento técnico

TypeScript separado: aprovado. ESLint: aprovado. Build Next.js com webpack: aprovado,
incluindo geração de 60 páginas e TypeScript do build. Webpack foi usado porque a worktree
isolada compartilha node_modules por junction externa; não foi feita alteração de configuração
da aplicação para contornar esse arranjo local. git diff --check: aprovado.
Novo fetch confirmou origin/main no SHA de base informado. Não houve divergência remota durante
a tarefa. A diferença da main local foi apenas informada; sua referência não foi movida.
