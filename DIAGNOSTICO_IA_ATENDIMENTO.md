> Registro histórico da base, anterior à implementação. O teto de cinco chamadas foi posteriormente autorizado. Resultado e pendências atuais: [relatório da tarefa](RELATORIO_IA_ATENDIMENTO.md).

# Diagnóstico de robustez do atendimento

Investigação independente do roadmap. Base: `41d9658be65d21807e53c66b31a525022a27f73c`.
Branch: `astra/ia-atendimento-robustez-sugestoes`. Não autoriza merge nem publicação em Production.

## Estado observado

Após fetch, `origin/main` corresponde à base esperada. A referência `main` local está em
`e53601c84f7fedfaafe1c64fe0e56ef4cb6ddce0`, em outra worktree. A pasta original tem alterações
não commitadas, preservadas. Esta investigação usa uma worktree isolada.

O objeto `f85cafb18227e31ef24b02917ea5b47886187749` não está disponível localmente e o remoto
respondeu `not our ref` ao fetch explícito. A branch remota `codex/fase5b1-sanitizacao-logs`
também não foi encontrada. Não houve merge, cherry-pick nem comparação presumida desse código.

## Fluxo real

`CentralMensagensView.sugerirComIa` chama `lib/ia.ts:rascunharResposta` com ID e origem.
O cliente acrescenta a sessão ao POST `/api/ia`. A rota valida ambiente, usuário e permissão,
carrega a configuração global e despacha para `handlers/atendimento.ts`.

O handler lê imóvel e notas com o cliente autenticado sujeito a RLS; seleciona a conversa;
consulta protocolos ativos e perfil; usa abordagem legada apenas sem saída textual registrada;
compõe governança central e regras de conduta; chama decisão estruturada; aplica bloqueio
prévio; seleciona protocolos comerciais; gera; verifica texto e referências; chama validação
independente. Reprovação de conteúdo permite uma regeneração e a mesma validação.

Sucesso retorna 200 com rascunho editável e protocolos usados. Se o feedback estiver habilitado,
persiste a sugestão antes do sucesso. Não envia WhatsApp, não muda Pipeline e não cria agenda.
A UI apenas preenche o editor; falha exibe mensagem segura.

## Caminhos de 422 no atendimento

| Etapa / origem | Código interno → HTTP | Geração de rascunho | Validação | Recuperação / falso positivo |
| --- | --- | --- | --- | --- |
| Imóvel ausente sob RLS | `imovel-nao-encontrado` → `historico-insuficiente` | Não | Não | Terminal; inclui ID inexistente ou de outro tenant, sem revelar existência |
| Sem entrada textual atual | `historico-sem-mensagem-textual` → `historico-insuficiente` | Não | Seleção local | Terminal; inclui última fala do corretor e histórico só de mídia |
| Decisão global sem segurança | `baixa-confianca`, `contexto-incompleto`, `decisao-bloqueada` → `baixa-confianca`, `contexto-incompleto`, `intervencao-humana` | Não; houve chamada de decisão | Normalização e bloqueio locais | Terminal hoje; lacuna secundária pode impedir resposta parcial segura |
| Segunda geração vazia ou com título não permitido | `geracao-reprovada`, `protocolo-inadequado` | Duas | Local, sem auditoria do segundo texto | Primeira falha regenera; segunda termina. Título cortado no prompt pode não casar com catálogo |
| Segunda geração viola barreira local | `informacao-sem-fonte`, `resposta-longa`, `perfil-incompativel`, `acao-incompativel`, `apresentacao-repetida` → `geracao-reprovada` | Duas | Local; não chama auditoria após bloqueio local | Regex por texto inteiro pode rejeitar pergunta ou ressalva; presença de protocolo não prova cada afirmação |
| Segunda auditoria reprova | `protocolo-inadequado`, `informacao-sem-fonte`, `desvio-de-assunto`, `contexto-incompleto`, `baixa-confianca`, `geracao-reprovada` | Duas | Local + modelo | Primeira falha regenera; segunda termina. Campos booleanos genéricos não distinguem omissão, contradição ou entidade inventada |

O retorno `geracao-reprovada` após o laço é defensivo: no fluxo atual cada execução chega a
sucesso, erro ou retorno na segunda tentativa. Não é um caminho adicional alcançável normalmente.
Os demais 422 de `/api/ia` pertencem a operações diferentes e não são executados após o dispatcher
retornar a resposta do atendimento. Autenticação/permissão retornam 401/403, sem geração.

## Contratos e falhas estruturais

`resposta-estrutural-invalida` é um diagnóstico produzido pelo handler, não um enum devolvido pelo
modelo. O retorno ao cliente é `falha-modelo`, HTTP 502, nas etapas de decisão, geração e validação.

Os três JSON Schemas têm `additionalProperties: false` e todas as propriedades em `required`.
A decisão contém 14 campos: intenção, objeção, estado, contexto, informações já explicadas, ação,
próximo passo, ações proibidas, protocolos, evidências, lacunas, confiança e dois booleanos de
segurança. Geração exige `mensagem: string` e `protocolosUsados: string[]`. Validação exige oito
booleanos. O executor usa Chat Completions, `json_schema`, `strict: true` e limite de 4.000 tokens.

Há divergência local: o parser da decisão só exige confiança e os dois booleanos, preenchendo
outros campos ausentes; o parser da geração faz cast após JSON.parse, aceita propriedades extras
e transforma alguns tipos inválidos em texto vazio/lista vazia. JSON `null` pode causar acesso a
propriedade fora do tratamento de parse. O parser da validação exige os oito booleanos, mas aceita
propriedades extras. Títulos são cortados para 200 caracteres no prompt e comparados com títulos
originais no código. Recusa e término por limite retornam texto vazio no executor, perdendo a
distinção no parser seguinte. Não há evidência de que incompatibilidade de modelo explique o
evento histórico: os logs não guardam conteúdo privado, corretamente.

## Conversa, protocolos e temporalidade

- Até 17 mensagens: atual + 12 anteriores + 4 antigas, ordenadas por data e ID.
- Mensagem atual é a última fala legível somente se for do proprietário. Mídia sem texto é ignorada.
- Notas completas vêm do banco; cada mensagem, inclusive a atual, é cortada silenciosamente em
  600 caracteres no prompt. Pode perder a pergunta final ou uma ressalva.
- Até 40 protocolos comerciais, por criação crescente, e até 5 selecionados pela decisão.
  Cada conteúdo comercial e de conduta também é cortado em 600 caracteres sem sinalização.
- Histórico recente e antigo não se sobrepõem por seleção; o prompt central possui marcador para
  evitar composição duplicada. Contexto e protocolos são repetidos entre chamadas separadas.
- Não existe memória persistida adicional do atendimento. Há notas antigas selecionadas e,
  excepcionalmente, texto da abordagem legada, que pode não reproduzir a mensagem efetivamente enviada.
- Prompts mandam priorizar mensagens recentes e dados atuais, mas os fatos do imóvel são strings
  sem envelope de fonte, ausência e data. A classificação `historico_completo` não informa se
  a janela ou os textos foram cortados.
- Protocolos são autoridade comercial; respostas sociais e perguntas seguras já dispensam protocolo.
  A falta de regra específica não bloqueia por teste determinístico de catálogo vazio. O bloqueio
  global produzido pela decisão é que pode impedir uma resposta útil com confirmação de lacuna.

## Evidência do caso autorizado

Consulta somente de leitura confirmou o contexto LD-288, diferente do ID protegido pelo usuário.
Logs desse contexto registram: decisão bloqueada por contexto incompleto, sugestão aprovada,
validação bloqueada por contexto incompleto e decisão com saída estrutural inválida. São eventos
históricos; não permitem atribuir todos à mesma versão nem reconstruir o texto gerado.

Os protocolos atuais sustentam ausência de exclusividade, anúncio próprio ou com outras
imobiliárias, custo anterior à locação e condições de administração/intermediação. Não extrapolar
essas regras para afirmar multa, isenção ou cobrança após locação por terceiro.
Há uma regra de conduta que orienta consultar o setor responsável: isso não autoriza inventar
um departamento nem sua responsabilidade específica.

## Modelo e custo

A tabela `ia_configuracoes` está vazia no banco do projeto. O fallback de código é
`gpt-5.4-mini`, esforço `low`; os registros recentes de uso confirmam esse modelo no atendimento.
O executor prefere o esforço da configuração ao `low` escrito em cada etapa do handler.

São três chamadas no sucesso e até cinco com regeneração. O SDK tem dois retries automáticos
por requisição por padrão; o fluxo atual não os desativa. Logo o teto de duas gerações não é
um teto de duas requisições HTTP ao provedor. Telemetria atual contém tokens de entrada, saída e
cache, mas o diagnóstico de atendimento não registra duração/modelo/tentativa por etapa.

## Menor correção proposta

Obrigatório: preservar autorização e contexto sob RLS; alinhar parsers aos schemas; distinguir
estrutura de domínio; explicitar que lacunas limitam afirmações e não toda a resposta; auditar
regra/cobrança inventada, contradição, entidade sem fonte e omissão da parte comprovada; sinalizar
cortes sem transformar fragmento em fonte completa; limitar regeneração a falhas reescrevíveis;
registrar tentativa, modelo, duração e código sem conteúdo privado. Nenhuma migration prevista.

Reutilizar da Fase 6 o princípio de origem, autoridade, ausência e temporalidade; não importar o
orquestrador, ferramentas ou seleção por capacidade do Assistente para interpretar WhatsApp.

Qualidade opcional após estabilidade: comparar modelo atual e Terra com os mesmos contextos,
protocolos, perfil, contratos e limites. Não alterar configuração global nem outras operações.

Há uma decisão de contrato pendente: teto absoluto de duas chamadas ao modelo versus até duas
gerações com decisão e validação independente. A arquitetura atual não cumpre ambos ao mesmo
tempo. Remover a auditoria independente para caber no teto seria mudança de governança, não
uma otimização mecânica.

## Matriz de aceitação

| Caso | Comportamento esperado |
| --- | --- |
| Taxa cadastrada | Responder taxa e condição exatas do protocolo |
| LD-288 / outra imobiliária | Usar a parte comprovada e confirmar consequência desconhecida, sem isenção/multa/departamento inventado |
| Pergunta comercial sem protocolo | Confirmar informação ausente de forma natural, sem inventar |
| Ok após explicação | Encerramento/reconhecimento natural, sem nova autorização |
| Regra ou cobrança sem fonte | Reprovar; regenerar apenas se removível sem perder segurança |
| Entidade interna sem fonte | Reprovar ou reescrever sem entidade inventada |
| Omissão de fato relevante comprovado | Reprovar com código específico e permitir uma reescrita |
| Saída estrutural inválida | 5xx seguro, sem disfarçar como 422 |
| Primeira aprovada | 200, sem regeneração |
| Primeira rejeitada, segunda aprovada | 200 com fallback, mesmo contexto |
| Duas rejeitadas | 422, sem terceira geração |
| Conversa longa | Preservar autoria, ordem, atual e sinalização de cortes |
| ID de outro tenant / falha de autorização | Não gerar nem revelar dados |

## Validação até o diagnóstico

Base sem alteração de implementação: 76 testes iniciais em oito arquivos; regressão ampliada
com 562 testes em 42 arquivos aprovada (inclui atendimento, IA, WhatsApp, protocolos, continuidade,
Assistente, ações e autenticação). Isso não comprova qualidade real do modelo nem RLS em execução.
Smoke real, comparação, suíte completa, TypeScript, lint, build e diff check ainda pendentes.
Nenhuma mensagem enviada, conversa alterada, operação de Pipeline ou agenda executada.

## Reprodução local confirmada

O LD-288 atual já possui três mensagens posteriores do corretor. Sem recorte histórico, a seleção
não encontra entrada pendente e nenhuma geração ocorre. Isso é comportamento atual intencional,
não evidência de falha de contexto da pergunta original.

O ensaio opt-in `web/tests/ia-atendimento-reproducao.test.ts` lê a fotografia do imóvel e protocolos
com filtro explícito pelo tenant autorizado. As consultas são somente de leitura; o handler recebe
um adaptador em memória sem métodos de escrita. Registro de eventos, consumo e persistência de
sugestão estão desativados no ensaio. Esse adaptador não valida RLS real nem substitui a UI.

Reproduzindo apenas em memória as sete mensagens até `2026-09-04T09:37:10`, mantendo os protocolos
atuais, o fluxo da base retornou **422**, etapa **decisão**, motivo **contexto-incompleto**. Modelo
`gpt-5.4-mini`, esforço `low`, duração total 6.473 ms, decisão 6.467 ms, entrada 3.739 tokens,
saída 842 tokens. Não houve geração de rascunho nem validação pós-geração. É uma observação real,
sem amostra suficiente para taxa de rejeição ou recomendação comparativa de modelo.

O ensaio não salva conversa, prompt nem resposta completa. Exporta opcionalmente apenas métricas
sanitizadas para caminho local indicado. A execução normal da suíte ignora esse teste externo;
a ativação exige variável explícita e identificadores autorizados. O ID excluído pelo usuário é
rejeitado antes de qualquer leitura. Um resultado 422/5xx é registrado pelo diagnóstico e não é
interpretado como aprovação de qualidade.

TypeScript e ESLint do ensaio passaram; `git diff --check` passou. A reprodução falhou inicialmente
por ausência de mensagem atual no histórico de hoje, depois confirmou o bloqueio do instante original.
O navegador integrado permaneceu indisponível por erro de inicialização/ACL. Não houve smoke do
editor autenticado, comparação com Terra, build ou suíte completa após implementação, pois a
implementação ainda depende da definição do teto de chamadas. Nenhuma migration, push ou Preview.
