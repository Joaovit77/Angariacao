# Resultado da tarefa independente: robustez do atendimento

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
