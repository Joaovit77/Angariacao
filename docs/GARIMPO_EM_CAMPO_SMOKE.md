# Garimpo em Campo: roteiro final de smoke

Roteiro de validação manual do módulo, para rodar antes de promover a Production um deploy que
toque o Garimpo em Campo. Os contratos que ele exercita estão em
[`PROJECT.md`](../PROJECT.md), seção "Garimpo em Campo: contratos permanentes do módulo"; a
configuração de bucket, exclusão e IA está em [`DEPLOY.md`](../DEPLOY.md).

## Antes de começar

- Use uma **conta de teste** (hoje `claude@acesso.com`), nunca a carteira real. Tudo o que o roteiro
  cria é apagado no passo R.
- Em **Preview** a Deployment Protection da Vercel exige um link `_vercel_share` (o MCP da Vercel
  gera um, válido por 23 h). O login do app é o de sempre.
- Em Preview e em desenvolvimento a **IA real está bloqueada** (`docs/IA-AMBIENTES.md`): a análise
  da observação responde "indisponível" e o registro funciona inteiro. Os passos H, I e J só
  produzem etiquetas em Production; nos demais ambientes confira apenas que "Precisa de atenção"
  diz que não foi possível analisar e oferece "Tentar de novo", e que o registro salvou normalmente.
- Faça a parte de captura **no celular**, em frente a um imóvel real se possível. Desktop entra só
  nos passos marcados.
- Anote o `id` de cada registro criado (o link "Investigar na web" o carrega na URL) para conferir
  no banco quando o passo pedir.

## A. Captura no celular

1. Abrir `/garimpo-em-campo`. O topo mostra o nome do módulo e um botão de registrar; nada mais
   compete com ele.
2. Tocar em **Registrar imóvel visto** (ou **Registrar novo local**). O modal abre com uma frase de
   abertura, a foto primeiro, depois localização e endereço, observação, tipo "se souber", data e
   hora já preenchidas, e "Mais detalhes do imóvel (opcional)" recolhido.
3. Confirmar que **só data e horário são obrigatórios**: observação, tipo e endereço podem ficar
   vazios. O tipo nasce em "Não definido" e não é preenchido sozinho.
4. Confirmar que o navegador **não** ofereceu "Salvar endereço?" ao salvar (campos com
   `autocomplete="off"`). Se oferecer, registrar o navegador e a versão no relatório.

## B. Foto

1. Tocar em **Fotografar fachada** (câmera na página) e fotografar. A prévia aparece reduzida; o
   rodapé diz "Registrar e enviar foto".
2. Salvar. A foto sobe depois da passagem (reserva, original, miniatura, finalização) com barra de
   progresso; ao terminar o modal fecha.
3. Alternativas a exercitar uma vez: **Usar a câmera do aparelho** (câmera nativa; voltar da câmera
   não pode perder o rascunho) e **Escolher da galeria**.
4. Falha simulada: desligar a rede antes de "Registrar e enviar foto". A passagem salva, a tela diz
   que a foto ficou pendente e, ao reabrir o app, oferece **Retomar** sem preencher tudo de novo.

## C. Localização

1. Com permissão de GPS: a linha de status diz "GPS · precisão aproximada: N m" antes de salvar.
2. Sem permissão: a linha explica que a posição virá do endereço; ao digitar rua e escolher a
   sugestão do ViaCEP, o status muda para "Aproximada pelo endereço".
3. Registrando longe do imóvel (GPS a mais de alguns quilômetros do endereço digitado): aparece o
   aviso de distância e a escolha "Onde estou agora / No endereço informado", com o endereço
   marcado por padrão; a escolha do humano vence.
4. Depois de salvar, o painel mostra a localização com a precisão declarada; a de menor raio entre
   as passagens é a da identidade.

## D. Mapa recolhido

1. Com GPS bom, o mapa **não** aparece sozinho na captura: só a linha de status e "Ver no mapa ou
   ajustar o ponto". Tocar abre; "Ocultar o mapa" fecha.
2. Com GPS impreciso (carro, prédio, GPS frio) o mapa abre sozinho com o aviso de leitura
   imprecisa e sem botão de esconder.
3. Com GPS longe do endereço (passo C.3) o mapa abre sozinho junto da escolha de fonte.
4. Arrastar o pino: o status vira "Marcada no mapa" e o mapa fica aberto.

## E. Confirmação pós-salvamento

1. Ao salvar, a primeira coisa na tela é **Imóvel registrado** (ou **Passagem registrada**), com o
   endereço, data e hora, "Foto registrada"/"Sem foto nesta passagem" e "Localização registrada"/
   "Sem localização nesta passagem", antes da lista.
2. **Concluir** fecha a confirmação e a seleção; a tela volta à lista e dá para guardar o celular.
3. Registrar de novo e usar **Ver detalhes**: a confirmação some e a página rola até o painel.
4. **Investigar na web** na confirmação leva ao Investigador com o endereço preenchido (passo M).

## F. Segunda passagem

1. Abrir o registro e tocar em **Nova passagem**. O modal não pede endereço de novo ("Nova
   passagem por …"), só foto, observação, data e hora.
2. Salvar com outra foto e outra observação. A lista mostra "2 passagens"; o painel, "2 passagens
   registradas".

## G. Memória longitudinal

1. Abrir **Histórico de passagens** (no celular está recolhido; um toque abre). As duas passagens
   aparecem, cada uma com a própria data, foto e observação; a mais recente marcada como
   "Passagem mais recente"; a anterior como "Registro anterior".
2. Registrar uma terceira passagem com **data retroativa** (anterior às duas). Ela entra no histórico
   na posição certa e **não** vira a passagem corrente: "O que sabemos agora" continua refletindo a
   mais recente por data do evento.
3. No banco: `avistamentos_total = 3`, `avistamento_corrente_id` é a passagem de maior
   `observado_em`, as três linhas de `_avistamentos` existem e nenhuma foi alterada.

## H. Classificação (Production)

1. Registrar uma passagem com observação de campo ("placa de aluga-se na janela, casa fechada, mato
   alto"). Em segundos, **O que sabemos agora** mostra etiquetas com a marca "sugestão" e apoio no
   texto; "Precisa de atenção" conta as sugestões não confirmadas.
2. **Confirmar** uma etiqueta: vira "confirmado", com data. **Marcar como incorreta**: vira
   "incorreta" e sai do estado atual, mas continua no histórico da passagem.
3. Se a IA sugeriu tipo, "Confirmar que é Casa" marca o tipo como confirmado sem trocar a origem.
4. Nenhuma tela mostra modelo, token ou custo. Em `/admin`, o consumo aparece no tipo
   `classificar-imovel-identificado`.

## I. Revisão de observação (Production)

1. Em **Ações**, **Corrigir o texto da última passagem** e trocar o texto por algo diferente.
2. As etiquetas antigas daquela passagem viram "texto mudou" (desatualizadas) e a análise é refeita
   sobre o texto novo; a etiqueta que você confirmou continua confirmada.
3. Se o texto novo contradiz a confirmação, "Precisa de atenção" mostra o conflito de revisão,
   nomeando o que foi confirmado, sem botão de resolver automático.
4. No banco: `observacao_revisao` subiu 1, `revisao_conflito_em` preenchido quando há conflito, e as
   etiquetas antigas continuam na tabela com `estado='desatualizada'`.

## J. Reuso (Production)

1. Registrar duas passagens com **exatamente o mesmo texto** (no mesmo registro ou em outro). A
   segunda é analisada por reuso: "Já tínhamos analisado uma observação igual", sem nova chamada.
2. As duas passagens têm etiquetas e execuções próprias; em `/admin` só a primeira consumiu tokens.

## K. Dedupe

1. Registrar um novo local com o **mesmo endereço** de um registro existente. Ainda no modal aparece
   "Pode ser um local já registrado" com o grau ("Mesmo endereço") e, quando há GPS, a distância e
   as precisões. O botão de salvar continua habilitado: o aviso não bloqueia.
2. No painel do novo registro, "Pode ser o mesmo que…" lista o candidato com o motivo. Se o
   endereço também existe no Pipeline, aparece "Já está na carteira" com o código.
3. Registro já promovido: a própria oportunidade vinculada **não** aparece como duplicata; outras
   parecidas continuam aparecendo.

## L. Merge

1. No card de duplicidade, **É o mesmo** abre o diálogo de união com a contagem de passagens e
   fotos dos dois lados e a pergunta de qual sobrevive.
2. Confirmar. O absorvido some da lista (está em "Mostrar ocultos" como unido a outro registro) e o
   sobrevivente passa a ter todas as passagens e fotos, com as datas originais.
3. No banco: o absorvido está `fundido` com `fundido_em_imovel_id` apontando o sobrevivente; as
   passagens trocaram de `imovel_identificado_id` mantendo `id` e `created_at`; agregados dos dois
   lados recalculados; nenhuma linha de `imoveis` criada ou alterada.
4. Tentar unir com um registro promovido: a RPC recusa com mensagem própria.

## M. Investigador

1. **Investigar na web** abre `/investigador-imoveis?imovelIdentificado=<id>` com a consulta
   "Rua, número, bairro, cidade, UF" (e tipo, se houver). A observação e qualquer nome ou telefone
   que tenham sido digitados **não** aparecem na consulta nem na resposta da API.
2. Voltar ao Garimpo: a situação do registro não mudou e nenhum `Imovel` foi criado.
3. Se a pesquisa for concluída, o painel passa a dizer quando foi investigado
   (`ultima_investigacao_em`).

## N. Promoção

1. Em **Próximas ações**, **Transformar em oportunidade**. O modal "Nova angariação" abre
   preenchido com endereço, bairro, cidade, UF, origem e a observação da passagem corrente; o
   painel atrás já mostra "Desistir do vínculo" (o registro está `promovendo`).
2. Registro sem tipo: o seletor abre em "Selecione o tipo" e "Cadastrar imóvel" recusa até a
   escolha; com tipo conhecido, o seletor abre nele.
3. Cadastrar. O painel diz "Já é uma oportunidade no Pipeline desde …"; a lista mostra o selo
   PROMOVIDO; o Pipeline tem o imóvel novo.
4. No banco: `imoveis` com `status = 'Novo contato'`, `status_history = []`, `data_angariacao` =
   hoje, `origem_imovel` mapeada; `imoveis_identificados` com `situacao = 'promovido'`, `imovel_id`
   e `promovido_em`. Fotos, passagens e etiquetas continuam nas tabelas do Garimpo.
5. Cancelar o modal sem salvar: o registro volta a `identificado` e nenhum `Imovel` é criado.

## O. Recuperação parcial

1. Tocar em Transformar em oportunidade e, com o modal aberto, recarregar a página. O registro
   aparece "EM PROMOÇÃO"; o painel mostra "Oportunidade criada, vínculo pendente" com a lista de
   candidatas vazia e apenas "Desistir do vínculo". **Não** há botão de criar outra oportunidade.
2. Simular o vínculo perdido (uma oportunidade no Pipeline com o mesmo endereço e sem vínculo,
   criada por SQL na conta de teste). Recarregar: a candidata aparece com código, status e data;
   **Concluir vínculo da oportunidade** liga o registro a ela.
3. No banco: `imovel_id` aponta para a candidata escolhida, `situacao = 'promovido'`, e a contagem
   de `imoveis` da conta não aumentou.
4. Desistir do vínculo (noutro registro `promovendo`): volta a `identificado` e a oportunidade já
   criada permanece no Pipeline.

## P. Exclusão

1. **Descartar**: o registro sai da lista e volta em "Mostrar ocultos"; nada é apagado.
2. **Excluir permanentemente** num registro com foto: o diálogo conta fotos e arquivos ("1 foto — 2
   arquivos"); confirmar. O registro some de vez.
3. No banco: nenhuma linha do registro nas cinco tabelas; a rota respondeu
   `{ removidos: 2, pendentes: 0, prefixoVazio: true, concluido: true }` (Network).
4. Excluir um registro em exclusão pendente (rede caiu no meio): ao reabrir, o painel oferece
   retomar ou cancelar; retomar termina do ponto em que parou.

## Q. Storage

1. Depois do passo P, o bucket `fachadas` não tem objeto sob o prefixo
   `{user_id}/{identificado}/` do registro excluído (Storage no painel do Supabase ou
   `storage.objects`).
2. Durante o passo B, os objetos existem exatamente nos caminhos `caminho` e `caminho_miniatura`
   da linha de `_fotos`, e a linha está `ativa`.
3. Tentar subir um arquivo num caminho inventado com a anon key: a policy recusa.

## R. Apagar todos os dados

1. Em Configurações, **Apagar todos os meus dados** na conta de teste.
2. O Garimpo fica vazio; o bucket não tem nenhum objeto sob `{user_id}/`; as cinco tabelas do
   módulo não têm linha da conta; `imoveis` da conta também está vazia.
3. Se a rota devolver `prefixoVazio: false`, a limpeza não terminou: repetir até o prefixo ficar
   vazio antes de encerrar o smoke.

## S. Memória de identidade do imóvel (C13)

Pré-requisito: a migration `20260915190000_prospeccao_memoria_identidade` aplicada no ambiente
(tabelas `imoveis_identificados_investigacoes` e `_atributos`, RPCs
`registrar_investigacao_identificado` e `confirmar_atributo_identificado`, passo 4b em
`fundir_imoveis_identificados`).

1. **Leitura (C13C).** No detalhe de um identificado, a seção **Memória do imóvel** abre sem IA e
   sem escrita: lista as afirmações com rótulo amigável, **Hipótese**/**Confirmado** em texto, fonte
   como domínio e data de observação. Sem afirmação, a seção fica neutra (nada inventado).
2. **Confirmação humana (C13C).** **Confirmar informação** pede `window.confirm` e chama
   `confirmar_atributo_identificado`; a linha vira `confirmada` com `confirmado_por`/`confirmado_em`
   e nada mais muda (atributo, valor, fonte, `observado_em`). Repetir é idempotente.
3. **Investigador → memória (C13B).** **Investigar na web** a partir do identificado e concluir UMA
   pesquisa. A tela informa quantas informações estruturadas foram salvas com a fonte. No banco:
   uma linha em `_investigacoes` para a execução (`resultados_total`, `atributos_total`,
   `recusados_total`), atributos só do catálogo fechado, todos `hipotese`, `confianca` **null**,
   nenhum `valor_anunciado`; `ultima_investigacao_em` igual a `concluida_em`; `situacao` intacta;
   `imovel_id` nulo. A consulta digitada não existe em coluna nenhuma.
4. **Merge e exclusão.** Fundir dois identificados move investigações e atributos para o
   sobrevivente com os mesmos ids; excluir o identificado (passo P) apaga a memória em cascata,
   sem órfão em `_investigacoes` nem em `_atributos`.

### Registro de fechamento do C13 (Production)

- Migration aplicada em Production em 2026-09-15, antes do merge do C13 em `main`; ledger em dia.
  Estrutura validada no banco: tabelas com RLS e policies de leitura própria, grants mínimos
  (`authenticated` só lê; `service_role` grava; RPC de registro só `service_role`, RPC de
  confirmação só `authenticated`), sem coluna nem parâmetro de consulta, passo 4b presente.
- **C13C comprovado em 2026-09-15**, na conta de teste: leitura da memória pela tela e duas
  confirmações humanas via `confirmar_atributo_identificado` (HTTP 200), com releitura em seguida.
- **C13B comprovado em 2026-09-16**, na conta de teste, com um identificado sintético sem foto e
  endereço fictício: uma investigação real pela UI → `registrar_investigacao_identificado`
  (HTTP 200) → 1 investigação (18 resultados, 11 atributos salvos, 0 recusados) e 11 atributos
  (`area_m2`, `quartos`, `vagas`, `condominio`; nenhum `valor_anunciado`; `confianca` null em
  todos; estado `hipotese`); `ultima_investigacao_em = concluida_em`; `situacao = identificado`;
  `imovel_id = null`; nenhuma consulta livre persistida.
- Limpeza: identificado removido pelo fluxo coordenado
  (`iniciar_exclusao_imovel_identificado` → `concluir_exclusao_imovel_identificado`); a cascata
  zerou investigações e atributos; 0 órfãos nas duas tabelas; conta de teste sem identificado,
  passagem, foto, objeto no bucket ou imóvel no Pipeline.

## UX de campo (C10.1), no celular

- Abrir o Garimpo e registrar um imóvel sem precisar entender o resto da tela.
- A captura é curta e na ordem foto, localização e endereço, observação, tipo, data.
- O tipo continua opcional e não é inventado.
- Aparece "Imóvel registrado" (ou "Passagem registrada") e dá para encerrar ali com **Concluir**.
- No detalhe, o histórico e a localização nascem recolhidos; um toque abre, nada falta.
- O mapa não domina o formulário; com GPS bom dá para seguir sem abri-lo.
- Precisão ruim ou conflito GPS × endereço abre o mapa sozinho.
- **Desktop**: histórico e localização abertos, descrição do topo visível, painel em duas colunas.

## Ao terminar

Relatar por passo: ambiente (Preview ou Production, deployment), o que passou, o que divergiu,
navegador e aparelho usados no celular, e confirmar que o passo R deixou a conta de teste vazia.
