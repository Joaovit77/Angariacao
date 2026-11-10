# Contratos offline de falha, privacidade e persistência da IA

Checkpoint: **IA-CONTRATOS-OFFLINE-00**. Data: 16/10/2026. Versão documental: 1.0.

**Auditoria estática e especificação documental, sem implementação ou execução de casos.** Q1 não iniciado; IA-M1c-F HOLD; JEV planejado/frente nova, fora deste checkpoint. Nenhuma mudança de prompt, modelo, produto, Radar, migrations, banco ou integração.

Referências: [IA-00](../RELATORIO-IA-00-ESTADO-E-PROXIMA-FRENTE.md), [contrato Q0](IA_QUALIDADE_EVALS_CONTRATO.md), [matriz Q0](../IA_Q0_MATRIZ_CASOS.md), [relatório Q0](../RELATORIO-IA-Q0-CONTRATO-LOCAL.md), [matriz desta auditoria](../IA_CONTRATOS_OFFLINE_MATRIZ.md), [relatório](../RELATORIO-IA-CONTRATOS-OFFLINE-00.md) e [política por ambiente](IA-AMBIENTES.md).

## 1. Base, método e evidência

Base de leitura: `origin/main` local em `0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883`; checkout documental `codex/b3-2-auditoria`, HEAD `366dc0f1b8c7ec5794d880de6f038b0698e25598`, 73 commits atrás. Não houve fetch ou movimentação Git. Não implementar produto sobre essa branch antiga.

Reutilizou-se IA-00/Q0, complementando a leitura dos módulos e testes do domínio. Não reabrir a auditoria completa. “Comportamento atual” neste documento significa comportamento deduzido da árvore local de referência e asserções existentes, não resultado executado hoje nem estado atual de Production.

Graus de evidência:

- **Código:** ramo, guarda ou escrita identificado estaticamente.
- **Teste existente:** expectativa localizada, com indicação se mock, estrutural ou composição. Não foi executada nesta tarefa.
- **Lacuna:** cenário não localizado no conjunto inspecionado ou cobertura insuficiente para a fronteira pretendida; não prova inexistência em todo o projeto.
- **Risco:** consequência possível do contrato/ramo; não declarar vazamento, perda ou duplicação real sem evidência de ocorrência.

O catálogo contém 36 contratos C001–C036, 12 propostas de casos O001–O012 e 14 mutantes U01–U14. Um contrato pode agrupar variações; nenhuma dessas contagens representa testes executados. A matriz diferencia reaproveitamento de cobertura de criação futura necessária.

Fontes proibidas não foram consultadas: Production, banco remoto, secrets, conversa real, áudio ou export de feedback. F13 foi examinado **pelos testes `ia-embeddings-f13.test.ts` e IA-00**; `embeddingsImoveis.ts` e os consumidores de comparáveis/Radar não foram abertos nem alterados nesta etapa.

## 2. Separação de fatos e eventos

| Fato | Evidência esperada | O que não significa |
| --- | --- | --- |
| Provider respondeu com usage | Chamada do registrador de uso; eventual linha `ia_uso` | Não comprova persistência bem-sucedida nem qualidade/uso da resposta |
| Provider lançou/retornou erro de transporte | `ia-chamada-falhou`, categoria fechada, sem usage fictício da tentativa | Não é rejeição pelo validador nem feedback humano |
| Aplicação recusou resposta recebida | `ia-resposta-rejeitada` nos fluxos instrumentados para esse evento | Não apaga usage já observado; F3 tem eventos próprios |
| Atendimento F3 bloqueou/reprovou | `ia-atendimento-validacao`, `ia-atendimento-bloqueado`, eventos de etapa correlacionados | Não duplicar em evento genérico de rejeição |
| Pessoa rejeitou/editou sugestão | Estado atual de `ia_feedbacks`, user-scoped | Não é provider failure, diagnóstico automático ou autorização de aprendizado |
| Telemetria não persistiu | Console técnico sanitizado do registro, quando disponível | Não transforma resposta válida em ruim nem prova consumo zero |
| Sugestão obrigatória não persistiu | Falha de entrega quando coleta ativa | Não autoriza devolver sucesso com sugestão perdida |
| Feedback falhou após envio confirmado | Pendência de feedback com retry próprio | Não significa mensagem não enviada; não autoriza reenviar |

Os quatro eixos permanecem separados: **falha funcional**, **falha de telemetria**, **falha de persistência de negócio** e **falha de qualidade**. Uma resposta correta pode ter telemetria incompleta. Uma candidata errada pode ter usage e metadata perfeitos. Um erro de banco não deve produzir `ia-chamada-falhou`.

F3 compartilha `execucao_id` entre chamadas/diagnósticos, mas não emite `ia-resposta-rejeitada`; a suíte `ia-metadados-atendimento` já verifica isso. Rejeição genérica contém sete chaves técnicas e vocabulário fechado; falha de provider contém onze chaves técnicas e nível aviso. Não somar o evento do fluxo ao evento de provider como duas tentativas externas.

## 3. Provider e transporte — resultados por fronteira

| Situação | Resultado funcional caracterizado | Logging e persistência | Experiência esperada |
| --- | --- | --- | --- |
| Timeout/erro SDK no executor | Exceção original sobe ao chamador; F3 converte falha da etapa em 502 com código local | Um evento de provider por chamada lógica que lançou; nenhum uso dessa chamada; usos anteriores permanecem | Erro seguro, sem rascunho fantasma ou nova geração ilimitada |
| HTTP 401/403/429/4xx/5xx | Categorias fechadas: autenticação, limite, requisição recusada, erro do provider; retorno final depende do fluxo | Status numérico permitido; erro/headers/body não vão ao evento | Não mostrar mensagem bruta do SDK; não confundir indisponibilidade com bloqueio semântico |
| Erro inesperado dentro do transporte | Categoria desconhecida quando não há status/classe comprovada; exceção preservada | Ainda é evento de provider se veio do ponto de transporte; não inventar status | Falha local segura pelo chamador |
| Exceção antes/depois do transporte | Não deve ser reclassificada como provider failure | Nenhum evento de provider indevido; usage anterior preservado se já observado | Falha de aplicação identificada como tal; não prometer resultado que não foi entregue |
| Recusa/truncamento/vazio em Chat | Executor interpretado devolve vazio para recusa/length; parsers/chamadores aplicam contrato próprio | Usage registrado antes do julgamento, quando existe; C registra rejeição onde aplicável | F3 não entrega vazio; estrutura inválida é erro, não sugestão aceita |
| Structured Output inválido F3 | Schema/parser rejeita na etapa; HTTP 502 de estrutura, sem regeneração para ocultar problema estrutural | Usage/evento da etapa já obtida não são apagados; diagnóstico de estrutura, sem conteúdo | Erro seguro; não chamar de 422 de qualidade se é estrutura inválida |
| Usage inteiramente ausente | Resposta funcional pode continuar; registrador retorna antes de inserir | Zero inserts de consumo; metadata sozinha não cria uso | Não anunciar consumo zero, apenas consumo não observado |
| Usage parcial | Helpers Chat/Responses atuais preenchem tokens ausentes com zero quando o objeto existe | É comportamento atual, distinto de usage inteiramente ausente | Limite contábil a caracterizar, sem inventar correção nesta fase |
| Request ID ausente/inválido | Campo null, resposta funcional preservada | Não fabricar identificador nem derrubar insert por esse campo | Nenhum efeito direto para o usuário |
| Metadata parcial | Nulls próprios do fluxo são válidos; outros campos são saneados ou ficam ausentes | Não confundir ausência legítima com instrumentação quebrada | Qualidade textual e telemetria avaliadas separadamente |

**Retry não é uniforme.** F3 usa até uma regeneração por conteúdo recuperável, máximo duas gerações/cinco chamadas lógicas, retries SDK desativados e timeout de 45 s por chamada. Retry de transporte não é regeneração. Outros fluxos SDK conservam sua configuração própria; retries internos não são eventos separados e não foram medidos nesta tarefa.

**F10:** até cinco chamadas lógicas por turno; uma linha de uso por rodada com usage. Falha numa rodada posterior conserva usos anteriores e o mesmo ID do turno. Texto vazio com `output` válido recebe fallback já caracterizado; resposta sem `output` pode lançar na leitura e não vira erro de provider. Testes existentes explicitam essa diferença. Não promover fallback a resposta de qualidade apenas por HTTP 200.

**F2, pelos testes atuais:** até três tentativas; esperas de 1,5 s e 3 s. 403/429/5xx são retentáveis; 400/401/404/422 não. Fetch que lança termina como `sem-conexao` após tentativas. Corpo JSON ilegível vira `vazio`, sem uso/novo retry/evento de provider; texto vazio com usage grava uso antes do julgamento. Falha de download/ambiente não é falha OpenAI. Cada tentativa de transporte falha gera evento; sucesso com usage gera uso, com mesmo ID do áudio.

**F13, pelos testes atuais:** lotes de até 100, uso por lote bem-sucedido com usage e correlação entre lotes. Falha posterior preserva usos anteriores, sem lote adicional. Lote incompleto pode ter uso registrado e lançar depois; não gera evento de provider só por rejeição posterior. Isso já tem caracterização e não exige nova suíte equivalente.

## 4. Metadata e correlação

| Campo | Contrato observado / restrição | Limite importante |
| --- | --- | --- |
| `execucao_id` | UUID local da execução; F3 etapas, F10 rodadas, F13 lotes e F2 tentativas compartilham seu ID | Request ID do provider não é ID de execução; uma nova execução tem outro ID |
| Operação/tipo/rota | Nome técnico local; rota textual de configuração quando aplicável | Tipos livres de chamador não tornam texto privado autorizado |
| Modelo pedido | Configuração/default controlados pelo chamador | Não deduzir modelo servido a partir do pedido |
| Modelo servido | Texto curto até 120 caracteres quando observável | Limite de tamanho não é anonimização nem validação semântica de nome |
| Request ID | String de 1–200 caracteres do conjunto `word`, ponto, dois-pontos e hífen; inválido vira null | Regex de forma não prova ausência semântica de dado pessoal; não registrar body/headers para “recuperar” o ID |
| Duração | Inteiro não negativo; janela depende do fluxo | F13 mede create; F2 sucesso inclui leitura do corpo, não espera; F10 inclui montagem do corpo conforme caracterização |
| Tokens/cache | Valores observados e mapeados por API; reasoning é parcela da saída, cache pertence à entrada | Objeto parcial recebe defaults atuais; não alegar precisão além do que o provider informou |
| Motivo/recusa | Chat lê choice; Responses mapeia status/output para vocabulário existente | `null` pode significar não observável; não é sempre false/stop |
| Configuração | Origem/versão/esforço textuais quando aplicáveis | F2/F13 não usam essas rotas; null nesses campos não é defeito |

Contrato de F10: rota assistente e esforço da configuração; F2/F13: rota/esforço/configuração null. Modelo servido não é fornecido pelo F2. Campos devem permanecer vinculados à rodada/tentativa certa, não apenas ao mesmo ID global.

A cobertura já testa execução única por turno/lote/áudio, sequência de rodadas e novas execuções com ID diferente. **Interleaving de duas execuções concorrentes**, com persistência completando fora de ordem, não foi localizado nos testes selecionados. Caso O005 propõe essa composição, sem duplicar o teste sequencial existente.

Não há atomicidade demonstrada entre `ia_uso` e `log_eventos`: são escritas assíncronas distintas. Se uma falha, o conjunto pode ficar parcial. Consumidor não pode completar uma relação por proximidade de horário nem concluir ausência de consumo de uma linha ausente. `usage + eventos de falha` tem os limites documentados do baseline: chamadas sem usage/JSON F2 ilegível e inserts perdidos podem escapar dessa observação. Esta auditoria **não muda métricas ou gates de M1c-F**.

## 5. Persistência — fail-open/closed, devolução e retry

“Fail-open” aqui significa preservar o resultado funcional diante de falha de registro opcional; não significa liberar autenticação/RLS. “Fail-closed” significa não confirmar a operação cujo requisito falhou. Classificar sempre a fronteira: geração pode ter ocorrido mesmo quando a entrega da sugestão fecha.

| Falha | Modo atual/esperado | Resposta ainda pode ser devolvida? | Retry de evento/operação | Uso fictício proibido |
| --- | --- | --- | --- | --- |
| Insert retornou erro em `ia_uso` | Fail-open de telemetria; console sanitizado | Sim, resultado do fluxo é preservado | Não há retry/outbox no módulo; não repetir geração para refazer log | Não inventar linha ou zero porque insert falhou |
| Insert/rejeição de promise em `log_eventos` | Fail-open de telemetria via tarefa assíncrona/catch | Sim | Não há retry durável ou garantia de entrega | Não criar uso de consumo para representar evento perdido |
| Metadata inválida faz insert recusar | Fail-open do registro; diagnóstico seguro | Sim, se registro chegou à tarefa assíncrona | Sem retry automático do módulo | Não apagar uso anterior nem fabricar nova chamada |
| `after()` indisponível antes de agendar | Fallback para promessa local protegida por catch | Sim | Uma tentativa de insert nesse caminho; não outbox | Não duplicar insert por retry externo improvisado |
| Configuração do cliente de registro lança antes da tarefa | Limite atual: criação está fora da proteção de `depois()` | Não há garantia total de fail-open para essa exceção | Não há retry previsto | Não chamar esse erro de provider failure |
| Sugestão ativa retorna erro ou falta de ID | Fail-closed da entrega; helper retorna null e F3 retorna 500 | Erro seguro sim; sucesso com rascunho não | Sem retry interno da sugestão; nova geração não é retry de insert | Uso já observado continua válido; falha de sugestão não é consumo zero |
| Promise de insert de sugestão lança | Limite atual: helper/F3 não cercam esse await com tratamento local equivalente ao caso error | Resposta controlada não é garantida por essa fronteira | Sem retry local; não afirmar que nada persistiu se resposta se perdeu | Não registrar chamada de modelo que não ocorreu |
| Feedback retorna erro de upsert | Fail-closed do feedback; rota 500, cliente recebe erro local | Sugestão/envio já ocorrido não são desfeitos | Retry humano do mesmo feedback é idempotente por sugestão; cliente usa transporte não repetível automaticamente | Feedback falho não deve causar novo envio/modelo |
| Feedback falha depois de envio confirmado | Fail-closed do feedback e guarda contra novo envio | Informar pendência de feedback, preservando envio conhecido | Retry exclusivo do feedback, sem WhatsApp | Não transformar envio em “não enviado” nem criar nova tentativa |
| Confirmação de ação perde resposta do banco | Cliente recebe falha; commit pode ter acontecido antes de perder a resposta | Erro não comprova rollback | Reconciliação/retry da mesma ação congelada; nunca criar ação nova para “tentar de novo” automaticamente | Não inventar resultado nem negar efeito já ocorrido |

`registro.ts` chama `cliente()` antes de `depois()`. O módulo protege recusa/rejeição do insert e falha ao agendar `after`, mas não cerca toda a inicialização com try/catch. Isso é uma **limitação estática verificável**, não demonstração de que uma requisição real tenha falhado. O002 caracteriza a fronteira em tarefa futura autorizada. F2/F10/F13 têm testes que mostram que um registrador mockado lançando pode propagar; esses testes não são garantia de que o módulo real nunca lança em qualquer ambiente.

`registrarSugestaoIa` retornando null e promise lançando são cenários diferentes. O primeiro tem tratamento funcional local; o segundo pode escapar do handler antes de gerar resposta controlada. Não prometer um status exato do framework para exceção não tratada sem exercício; não corrigir aqui.

Inserts de consumo/eventos não têm dedupe durável geral nesta camada; “um evento por falha lógica” é contrato de emissão, não idempotência global de entrega. Não recomendar retry automático desses inserts sem chave/semântica revisada. Não criar migration/outbox nesta frente.

## 6. Privacidade: campos permitidos e proibidos

| Destino | Permitidos quando necessários | Proibidos / não necessários |
| --- | --- | --- |
| `ia_uso` | Tenant confiável no servidor, tipo, modelo pedido, tokens/cache, metadata técnica saneada | Prompt, conversa, nome pessoal, telefone, áudio, resposta integral, segredo, raciocínio interno |
| Eventos IA estruturados | ID de execução/request saneado, operação/etapa, modelo, duração, status, enums, contagens e IDs técnicos autorizados | Erro completo, message/stack/cause externos, headers, body, conteúdo WhatsApp, credenciais |
| Console de erro externo | Objeto local de allowlist com provider/operation/error_code/status | `error.message` cru ou objeto externo completo; truncamento não prova segurança |
| Sugestão/feedback | Texto necessário ao negócio e contexto compacto, sob tenant autenticado | Tratar esse texto como log público/anônimo; copiar dataset de Production sem revisão/autorização |
| UI do corretor | Mensagem local segura e projeção de atividade da própria conta | Modelo/tokens/custo/IDs privados/erro bruto fora das superfícies autorizadas |

`user_id`, IDs de entidade/ação e request ID são dados técnicos com escopo; não são automaticamente públicos ou anônimos. Permissão para guardar um ID no evento do servidor não autoriza expô-lo ao browser ou dataset. Service role é segredo, nunca campo de log ou retorno.

O helper `sanitizarErroExterno` lê somente status HTTP validado e combina contexto fechado; não serializa message, stack, cause, request/response ou callbacks. Os módulos de falha/rejeição emitem campos fechados. **O registrador genérico não sanitiza o conteúdo de `detalhe` que recebe:** os emissores continuam responsáveis por não enviar texto privado. Teste de sanitização do erro do insert não prova sanitização do payload que foi inserido.

Request ID/modelo servido recebem validação de forma/tamanho; isso não equivale a remoção semântica de PII. IDs reais do provider costumam ser opacos, mas esta tarefa não consultou exemplos reais. Robustez adicional contra formato semanticamente contaminado é P2, sem afirmar vazamento ou alterar a regex agora.

## 7. `error.message`: alcance e risco real

Todos os caminhos abaixo foram confirmados na base por leitura. Não há chamada a `sanitizarErroExterno` nesses pontos específicos. Isso é achado de código; **não houve observação de vazamento remoto**.

| Caminho / linhas na base | Dados que chegam ao erro | Comportamento funcional atual | Risco e cobertura |
| --- | --- | --- | --- |
| `web/app/api/ia/atividades/route.ts:56–61` | Erro Supabase de SELECT de usos/eventos, após autenticação e filtro de tenant | Duas consultas falham: 500; uma falha: 200 com fonte sobrevivente | Message pode conter diagnóstico técnico/texto externo; não é o conteúdo das linhas por definição. Testes atuais cobrem sucesso e falta de sessão, não erro/console parcial |
| `web/lib/servidor/ia/configuracao.ts:83` | Erro Supabase de consulta global de configuração, com seleção fixa | Retorna padrão de código; não preset recomendado | Sem campo de conversa solicitado; conteúdo arbitrário do erro ainda é não confiável. Suíte cobre sem banco/linha inválida, não esse ramo com erro externo hostil |
| `web/lib/servidor/ia/sugestoes.ts:50` | Erro de INSERT cujo payload inclui texto sugerido/contexto do negócio | Retorna null; F3 impede sucesso se ativa | Payload do insert é sensível; não se pode presumir que message contenha ou não esse payload. Falta ensaio sintético do erro e da entrega ativa |
| `web/lib/servidor/assistente/acoes.ts:518,547,564,579,594,856` | Erros de RPC de preparo/confirmar/cancelar/acompanhamento, com parâmetros de negócio | Mensagens locais ao chamador; console recebe message | Fase própria de logs/RPC e resultado incerto é necessária; testes existentes focam parâmetros/sucesso e contratos estruturais |

A origem externa pode devolver apenas código/mensagem técnica ou pode incluir texto diagnóstico influenciado por dados. Não concluir que uma SELECT fixa “vaza conversa”; também não aceitar message externo como seguro por faltar conversa no SELECT. O001 propõe sentinela sintética no erro de cada fronteira, sem provider/banco real.

**Recomendação P1:** frente própria e localizada de caracterização/sanitização desses caminhos, após autorização; preservar fallback, status, retorno parcial, tenant e ações. Sanitizador é compartilhado com outras integrações; alteração nele é **CONFLITO POTENCIAL com Radar**. Corrigir consumidores sem ampliar o helper só poderá ser decidido em tarefa posterior. Se um ensaio autorizado comprovar dado sensível no log/retorno, elevar achado a P0 e bloquear liberação do caminho afetado. Não registrar incidente de Production com base apenas em um mock.

## 8. Cobertura existente e o que não duplicar

| Referência | Arquivo de teste, na base Git | Cobertura estática relevante |
| --- | --- | --- |
| T01 | `web/tests/ia-falha-provedor.test.ts` | Classes/status, exceção original, request ID hostil/ausente, duração, privacidade, falha do evento e bloqueio antes do transporte |
| T02 | `web/tests/ia-resposta-rejeitada.test.ts` | Categorias/motivos, sete chaves, getter hostil, códigos permitidos, conteúdo ausente do log, registrador que lança |
| T03 | `web/tests/ia-uso-metadados.test.ts` | Mapeamento de colunas Chat/Responses, sem usage, insert recusado, campos inválidos, uso antes do parse |
| T04 | `web/tests/ia-metadados-assistente.test.ts` | Cinco chamadas, rodadas, correlação, falhas posteriores, metadata, privacidade e erro não-provider |
| T05 | `web/tests/ia-embeddings-f13.test.ts` | Lotes/ordem, falha parcial, metadata e privacidade, erro posterior sem falsa falha de provider |
| T06 | `web/tests/ia-transcricao-f2.test.ts` | Retries/status, JSON ilegível/vazio, sem usage, correlação, logging e privacidade |
| T07 | `web/tests/feedback-sugestoes-ia.test.ts` | Flag, idempotência, tenant simulado, feedback com erro e guardas estruturais de UI/envio |
| T08 | `web/tests/ia-executor.test.ts` | Requisição/Structured Output, ambiente bloqueado, recusa/length |
| T09 | `web/tests/registro-logs-externos.test.ts` | Insert com error/rejeição e fallback fora de request; console sanitizado e uma tentativa |
| T10 | `web/tests/assistente-acoes.test.ts` | Preparo/confirmar/cancelar com IDs congelados e guardas SQL estruturais; não prova commit/timeout real |
| T11 | `web/tests/assistente-rota-log-seguro.test.ts` | Exceções do chat/análise convertidas em erro local, sem conteúdo externo no console |
| T12 | `web/tests/api-atividades-ia.test.ts` | Tenant/projeção sanitizada no sucesso e ausência de sessão |
| T13 | `web/tests/ia-configuracao-servidor.test.ts` | Default versus recomendado/banco e ausência de banco configurado |
| T14 | `web/tests/ia-metadados-atendimento.test.ts` | Correlação de etapas F3, falha na geração após decisão e ausência de rejeição genérica duplicada |
| T15 | `web/tests/ia-atendimento-robustez.test.ts` e `ia-handler-atendimento.test.ts` | Schemas, transporte, omissão/regeneração/limites e diagnóstico seguro |

As referências T são um índice de evidência, não novos testes. Para cenários já cobertos, reutilizar a suíte existente em etapa futura autorizada. Não propor uma segunda suíte de “timeout 500”, “403 F2 repete”, “request ID com espaço vira null” ou “um uso por rodada” apenas para aumentar contagem.

“COBERTO” na matriz é relativo ao contrato offline indicado; não equivale a RLS/banco real validado. “PARCIAL” explicita fronteira faltante (por exemplo, UI dinâmica versus inspeção textual). Nenhum teste existente foi alterado, enfraquecido ou executado.

## 9. Relação com M1c e Q0

| Marco | Estado de cobertura no recorte offline | O que já existe | Lacuna proporcional |
| --- | --- | --- | --- |
| M1c-A | PARCIAL | T03/T08/T14: metadata/uso e erro de insert | Inicialização do logger, usage parcial e gravações independentes |
| M1c-B | COBERTO para contrato unitário principal | T01/T14: falha lógica, causa, privacidade, sem uso fictício | Composição da falha específica da segunda geração: parcial, sem duplicar categorias unitárias |
| M1c-C | COBERTO para emissão e correlação principal | T02/T14: rejeição separada, enum/ID; F3 sem duplicação | Entrega durável de evento não é prometida pelo marco; não inventar dedupe global |
| M1c-D1 | PARCIAL | T03/T04: Responses, cinco rodadas, motivos, ID por turno | Interleaving concorrente e persistência fora de ordem |
| M1c-D2 | COBERTO para contrato unitário principal | T04/T11: falhas de primeira/rodadas posteriores e log seguro da rota | Falha de banco/RPC interna não é evento de provider |
| M1c-E1 | COBERTO no recorte dos testes existentes | T05: lote, metadata, falha parcial e privacidade | Nenhuma alteração permitida na cadeia compartilhada; qualidade vetorial NÃO APLICÁVEL |
| M1c-E2 | COBERTO no recorte dos testes existentes | T06: tentativa, retry, uso e falha | Corpo ilegível sem usage é limite já caracterizado, não ausência de teste |
| Feedback/ações | NÃO APLICÁVEL como implantação de novo marco M1c | T07/T10 dão contratos próprios | Persistência de negócio/tenant/UI exigem recorte separado |
| IA-M1c-F | NÃO APLICÁVEL à aprovação documental desta auditoria | HOLD anterior preservado | Nenhuma métrica/cohort/fechamento reavaliado |

Esta tabela não reclassifica publicação ou fechamento de checkpoints. Qualidade, disponibilidade, telemetria e privacidade continuam eixos separados do Q0. Referência de slices: S22 provider, S23 estrutura, S24 regeneração, S25 auditor, S26 logging e S27 persistência. Casos P022–P034 do Q0 são ponto de partida; a matriz atual esclarece quais deles já têm cobertura e quais composições faltam. Nenhuma definição Q0 foi modificada.

## 10. Priorização e conflito

**P0 — integridade/privacidade crítica:** preservar bloqueio de tenant errado, impedir novo envio quando só feedback falhou e impedir nova ação quando confirmação perdeu resposta. Há testes unitários/estruturais, mas a composição dinâmica está parcial; O007/O008/O011 propõem caracterização segura. Isso é prioridade de risco, **não afirmação de bug, envio duplicado ou violação RLS ocorrida**. Vazamento comprovado em ensaio futuro de log sensível também entra em P0.

**P1 — cobertura necessária antes de Q1:** error.message nas quatro fronteiras; inicialização do registro fora do catch; sugestão ativa com error/null ID/promise rejeitada; usage parcial; metadata de execuções intercaladas; persistência parcial sem recomposição fictícia; segunda geração que falha sem apagar uso. Reaproveitar os testes já existentes para a parte coberta.

**P2 — melhoria posterior:** getters hostis em metadata de sucesso Chat, sem presumir que JSON real tenha getters; endurecimento semântico de identificadores/modelo; estudo de durabilidade/dedupe/retentativa de eventos. Nenhum desses estudos autoriza alterar schema, outbox ou Radar.

CONFLITO se uma futura correção exigir executor, registro, sanitizador genérico, infraestrutura de teste, banco ou fontes de embeddings/comparáveis que também sirvam Radar. Nesta tarefa todos esses arquivos foram somente lidos quando permitidos; nenhuma correção é recomendada para execução paralela automática. O manifesto de alterações da outra máquina continua indisponível.

## 11. Próximo gate e limites

PASS deste checkpoint significa contratos/lacunas documentados e conferidos. Não significa suíte ou integração validada. Os casos O e mutantes U são conceitos de fixtures/mocks futuros, não código executável.

Para uma próxima tarefa de testes offline, obter decisão humana explícita sobre o subconjunto de lacunas, base e manifesto isolado; ela não inicia Q1 nem altera produto implicitamente. Se a próxima tarefa for Q1, continuam necessários fechamento formal de M1c-F (duas semanas completas UTC, pelo menos 200 chamadas F1 instrumentadas de C1, metadados/cobertura e demais regras), revisão humana e overlap Radar resolvido. Primeiro limite temporal: 19/10/2026 00:00 UTC, equivalente a 18/10/2026 21:00 em Brasília, necessário e não suficiente.

Codex/CI continuam proibidos de OpenAI real; Preview bloqueada para IA real. Não consultar Production/banco para fechar esta documentação. Sem commit, push, PR, merge ou deploy.

**STOP: auditoria e matriz offline, sem mudanças de comportamento.**
