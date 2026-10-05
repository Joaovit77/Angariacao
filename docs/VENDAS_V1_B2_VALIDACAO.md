# Vendas V1-B2 — validação local e checkpoint de integração

Rodada de implementação local de 2026-10-05. O código permanece sem commit.
O checkpoint Supabase completo ainda depende de revisão específica: **não foi executado**.
Nenhuma migration, fixture, reset ou smoke B2 foi aplicado à stack `vendas-b1-5e58bded`.

## 1. Base e branch

Base exata: `5e58bdedeb9ad604dff39feed27bf380c2433b29`, de
`codex/vendas-v1-b1-estrutura`. Branch de trabalho: `codex/vendas-v1-b2-operacoes`,
em worktree dedicado `Angariacao-B2`. A branch B1 e seu worktree foram preservados.
A migration B1 conserva o SHA-256 físico aprovado
`B06DD967800894D94A6A71BCDD8F6869F6706ED3BEDC9A9DF9C4D53293DEB4A7`.

## 2. Lista exata de arquivos

Arquivos adicionados:

- `supabase/migrations/20261005160044_vendas_v1_b2_operacoes.sql`;
- `web/lib/persistencia/vendasComandos.ts`;
- `web/lib/persistencia/vendasDecodificacao.ts`;
- `web/lib/persistencia/vendas.ts`;
- `web/tests/vendas-v1-b2-fronteira.test.ts`;
- `web/tests/vendas-v1-b2-schema.test.ts`;
- `web/tests/vendas-v1-b2-banco.test.ts`;
- `web/vitest.vendas-v1-b2-supabase-local.config.ts`;
- `web/integration/vendas-v1-b2-supabase-local.test.ts`;
- `docs/VENDAS_V1_B2_VALIDACAO.md`.

Arquivos alterados:

- `supabase-schema.sql`: somente acréscimo literal do bloco B2;
- `web/tests/vendas-v1-b1-schema.test.ts`: remove somente o bloco B2 antes da
  comparação histórica, sem trocar o hash esperado ou enfraquecer asserções B1;
- `PROJECT.md` e `DEPLOY.md`: escopo e checkpoint pendente.

## 3. Migration

Uma migration aditiva, produzida pelo gerador da CLI Supabase e não aplicada a uma
stack. Ela cria funções e suas ACLs numa transação; não cria/altera tabelas, enums,
policies, defaults, grants de tabela, exposição de schemas ou extensões. Não há
backfill. O bloco `BEGIN VENDAS V1-B2` / `END VENDAS V1-B2` é espelhado literalmente
no schema. Retirar apenas B2 recupera o blob completo do schema do HEAD B1,
SHA-256 `5b54399f21bae4e189d24babaecfe2774fdcab060fef1089063913b3562fc64c`.

## 4. Helpers

As 14 funções privadas `vendas_b2_*` são `SECURITY INVOKER`, owner `postgres`,
`search_path = ''`: `erro`, `numero_js`, `numeric`, `trim`, `objeto`, `texto`,
`uuid`, `data`, `instante`, `codificar`, `normalizar`, `fingerprint`, `snapshot`
e `executar`. As primeiras validam/codificam; `snapshot` lê o retrato contratado
e `executar` coordena a transação chamada pelas portas públicas. Não há helper
administrativo exposto nem SQL dinâmico. O helper B1 de texto útil permanece intacto.

## 5. Sete RPCs e comandos fechados

Todas têm assinatura única `(p_comando jsonb) RETURNS jsonb`. Cada wrapper público
fixa a operação; o navegador não escolhe uma operação genérica.

| RPC | Campos específicos, além do cabeçalho |
| --- | --- |
| `vendas_criar_oportunidade` | `contatoId`; opcionais `imovelTratado`, `origem`, `valorNegocioPrevisto`, `receitaPrevista` |
| `vendas_transicionar_oportunidade` | `destino`: `em_atendimento` ou `em_negociacao` |
| `vendas_alterar_imovel` | `imovelTratado` obrigatório, nullable |
| `vendas_alterar_valores` | `valorNegocioPrevisto` e `receitaPrevista`, obrigatórios, nullable |
| `vendas_ganhar_oportunidade` | `confirmacaoExplicita`, `dataFato`, `registroFormalizacao`; opcional `valorNegocioFechado` |
| `vendas_perder_oportunidade` | `dataFato`, `motivo`; opcional `justificativa` |
| `vendas_arquivar_oportunidade` | nenhum |

Criação recebe `chaveIdempotencia`. As demais recebem também `oportunidadeId` e
`versaoEsperada`, inteiro JSON entre 1 e `9007199254740991`. UUIDs precisam de
formato completo com hífens; normalizam para minúsculas. Campos desconhecidos e
aliases são recusados em todos os objetos. `userId`, autoria, responsabilidade,
timestamps, fingerprint e snapshots de referência nunca vêm do comando.

Imóvel: `null`, `{modo:"referencia",imovelId}` ou modo manual com `endereco`,
`referencia`, `unidade`, `bloco`, `descricaoCurta`; exige endereço ou referência útil.
Origem tem `tipo` e descrição opcional; os sete tipos preservam V1-A. O tipo `outro`
não ganha exigência de descrição. Ausência e null equivalem somente nos opcionais.

## 6. ACL e grants

As sete RPCs são `SECURITY DEFINER`, owner explícito `postgres`, `search_path = ''`.
Revogam EXECUTE de `PUBLIC`, `anon`, `authenticated` e `service_role`, concedendo
novamente apenas a `authenticated`. Os 14 helpers revogam EXECUTE dos mesmos
clientes. O teste de catálogo verifica privilégios efetivos, inclusive defaults
hostis simulados. A escrita direta nas quatro tabelas continua bloqueada. Toda
referência a objeto da aplicação é qualificada. O UID deve existir em `auth.users`,
com lock de chave; nenhum dado de outra conta ou de um UUID inexistente é exposto.

## 7. CAS

Oportunidade própria é lida `FOR UPDATE`; sua versão é validada após o replay.
Uma alteração efetiva usa UPDATE condicionado por ID, conta e versão anterior,
com `ROW_COUNT = 1`. Incrementa exatamente uma versão. A versão máxima recusa
todo comando novo, inclusive no-op; replay antigo continua permitido. CAS e
unicidade de evento são comprovados sequencialmente no PostgreSQL embedded.
A prova de concorrência real com sessões distintas está preparada e pendente.

## 8. Idempotência

Ordem: autenticação → chave textual útil e exata → advisory lock transacional
da conta/chave → consulta do recibo → normalização → fingerprint → replay →
leitura/validação atual → execução. A chave não é trimada. Mesmo pedido devolve
`recibo.resposta` integral, sem reconstrução ou consulta da versão atual. Pedido
diferente, porta diferente ou comando inválido com a mesma chave já concluída
resulta em conflito de idempotência. Sucesso e no-op recebem recibo; erros fazem
rollback e não recebem recibo. Não há TTL. Ganho/perda usam o valor B1 `transicionar`
na coluna operação do recibo, enquanto o fingerprint distingue suas portas.

## 9. Fingerprint

SHA-256 calculado no banco sobre bytes UTF-8 de uma árvore tipada ordenada:
`["vendas-b2-fingerprint-1",uid,chave,porta,id-ou-null,versao-ou-null,argumentos]`.
O codec prefixa null `N`, booleanos `T/F`, string `S<bytes>:`, número
`D<bytes>:` e array `A<quantidade>:`. Objetos não são aceitos pelo codec.
Os argumentos são tuplas fixas por porta; decimal usa `['numeric',coeficiente+'e'+expoente]`.
Não usa concatenação ambígua, `jsonb::text` ou JSON.stringify como digest.

## 10. Vetores de fingerprint

Vetor fixo: UID `11111111-1111-4111-8111-111111111111`, chave ` chave `,
porta `criar`, ID/versão null, argumentos
`["33333333-3333-4333-8333-333333333333",null,null,null,null]`.
SHA-256 esperado:
`bb00dae503127ea2fbd2bfec604506707276f3cbf4837a3aaa1f5d0fdabe95b2`.
Codec independente em Node compara com o SQL. Outros vetores cobrem Unicode,
limites de campos, ordem das chaves JSON, UUID equivalente, trim comercial,
ausência/null opcional, decimal 1/1.0/1e0 e diferença de porta, conta, chave,
versão e argumento. Metadata gerada não entra na identidade do pedido.

## 11. Numeric

Valores atravessam a RPC como texto decimal ou null. O contrato exige número JS
finito, não negativo e identidade decimal preservada ao fazer Number → String.
Não há arredondamento monetário nem limite MAX_SAFE_INTEGER para valores;
esse limite vale para versões. Zero continua distinto de null, inclusive no-op.
O banco usa numeric sem precisão/escala e reconstrói binary64 pelos bits IEEE-754,
com aritmética numeric exata. Procura a representação decimal mais curta que
retorna ao mesmo float, escolhe a mais próxima e desempata pelo coeficiente par.
Não usa `float8::text` como oráculo de serialização JavaScript. A identidade é
coeficiente inteiro sem zeros finais + expoente, normalizando zero para `0e0`.

O decoder remoto aceita somente string/null; recusa number já convertido pelo
parser JSON, pois a precisão original pode ter sido perdida. Leituras futuras
pela Data API devem preservar numeric como texto numa projeção contratada antes
de usar os mapeadores brutos; B2 não instala view nem libera SELECT do recibo.

## 12. Vetores numeric e gate obrigatório

Há 44 vetores fixos mais centenas de binary64 determinísticos, potências de dois
e vizinhos, comparando SQL e TS: null, 0, -0, 1/1.0/1e0, 0.1, alta precisão,
`Number.MIN_VALUE` (`5e-324`), `Number.MAX_VALUE` (`1.7976931348623157e308`),
overflow, underflow, NaN, infinidades, negativos, limites de inteiros e notação
científica. Recusam `0.10000000000000001`, `1.23456789123456789`, `1e1000`,
`1e-1000`, `4e-324`, `9007199254740993` e formatos não decimais.

Durante implementação, a prova identificou escala textual residual de
`power(numeric,0)` ao medir o coeficiente inteiro; a correção foi truncar esse
inteiro antes da contagem. Os valores esperados não foram arredondados ou
relaxados. A execução final não contém divergência SQL/TS não explicada.
Qualquer nova divergência deste gate exige **HOLD NUMERIC**.

## 13. Datas

Dia comercial é calendário gregoriano estrito `YYYY-MM-DD`, anos 0100–9999,
sem parsing local implícito, ano 0000, BC, rollover ou campos incompletos.
O dia do fato não ultrapassa o dia de registro em `America/Sao_Paulo`.
Um único `clock_timestamp()` é obtido após os locks e truncado a milissegundos;
não avança versão/timestamp artificialmente e recusa regressão do relógio.
Snapshot, evento, encerramento, arquivamento, captura e recibo usam esse instante
quando produzidos na operação. No-op preserva os instantes da oportunidade.
Saída UTC estrita tem três casas e ano 0001–9999. Timestamp bruto do banco exige
offset explícito, calendário e precisão ≤3 antes de normalizar.
Testes cobrem anos-limite, bissexto, DST, UTC, Brasília e Pacific/Apia.

## 14. Resposta

Envelope fechado `{contrato:"vendas-b2-v1",ok:true,oportunidade,evento,noOp}`.
Numeric e versão são strings no wire;
decoders retornam números validados para o domínio. Oportunidade inclui
`encerradoEm` junto ao contrato V1-A. Eventos incluem ID, conta, oportunidade,
ator, instante, fato nullable, versão, chave, `versaoContrato:1` e dados fechados.
Toda entrada remota começa como unknown, com validação de forma, discriminante
e coerência entre evento/snapshot. Não há cast silencioso para o domínio.

## 15. Erros

DETAIL contratado: `{contrato:"vendas-b2-v1",codigo,motivo}`. SQLSTATE PT401
para autenticação; PT404 para oportunidade invisível/inexistente; PT409 para
CAS/idempotência; PT422 para validação; PT503 para deadlock/serialization/lock;
PT500 para falha interna ou dado persistido inválido. Os códigos fechados são
enumerados em `CODIGOS_ERRO_VENDA`; motivos fechados em `MOTIVOS_ERRO_VENDA`.
Mensagens humanas e nomes de constraint não são contrato nem vazam no retorno.
O cliente distingue `resposta-invalida` e `transporte-indisponivel`. Uma falha
de rede pode ocorrer depois do commit: não presume rollback, não repete sozinho
e não troca a chave. Uma repetição posterior deve reutilizar o mesmo pedido/chave.

## 16. Eventos

Exatamente sete tipos: `oportunidade_criada`, `etapa_alterada`, `imovel_alterado`,
`valor_alterado`, `oportunidade_ganha`, `oportunidade_perdida`,
`oportunidade_arquivada`. Payload `{versaoContrato:1,dados}` é fechado e preserva
os dados V1-A. Um evento por alteração efetiva e versão, nenhum por no-op.
Ganho/perda não produzem evento adicional de etapa. Decoder de linha histórica
também recusa data de fato futura e alteração em versão 1.

## 17. No-op

Valores iguais, identificação de imóvel igual e terminal já arquivada: sem
evento, sem incremento, sem alteração da oportunidade; gravam recibo e resposta
com `evento:null,noOp:true`. Uma versão obsoleta não vira no-op. Transicionar para
a própria etapa é erro. Na versão máxima, mesmo no-op novo é recusado.

## 18. Ganho e perda

Ganho somente em negociação, com imóvel tratado, confirmação literalmente true,
formalização útil e fato não futuro; valor fechado optional/null, sem inferir
receita. Perda pode partir de qualquer etapa aberta. Os cinco motivos são os de
V1-A; `outro` exige justificativa útil, e justificativa opcional nos demais é
preservada. Estados terminais impedem edição/transição e preservam encerramento.

## 19. Alteração de imóvel

Referencia requer imóvel vivo da mesma conta `FOR SHARE` apenas numa escolha
efetiva. Captura somente ID original, código, referência CRM, endereço, unidade
e bloco; dados de proprietário/conversa não são copiados. No-op de referência
histórica não exige ponteiro vivo. Selecionar A, trocar para B e voltar a A cria
captura nova de A; as capturas anteriores não mudam. Exclusão do imóvel mantém
UUID original, snapshot e `imovelId` de domínio. Em negociação não se remove o
imóvel tratado. Modo manual tem apenas os campos comerciais permitidos.

## 20. Valores

Altera somente previsto e receita em estado aberto. Valor fechado é exclusivo
do ganho, inclusive uma tentativa de enviá-lo no comando de criação/valores é
recusada. Não há comissão, repasse, soma derivada ou associação com locação.
Evento guarda anterior/atual e recibo conserva exatamente a resposta concluída.

## 21. Arquivamento

Somente ganha/perdida; preserva estado, encerramento, valores, referência e
histórico. Primeiro arquivamento incrementa versão e gera evento; nova chave
com versão corrente em arquivada é no-op. Nenhuma exclusão comercial foi criada.

## 22. Rollback

PGlite executa B1+B2 em banco efêmero. Constraints artificiais nas fixtures
forçam falha após UPDATE/captura, ao inserir evento e ao inserir recibo. Provas
verificam snapshot/versão/timestamps inalterados, nenhum evento/recibo novo e
nenhuma referência órfã; remover só a constraint de fixture permite o mesmo
pedido/chave ter sucesso. Não há trigger ou injeção de falha na migration.
As rejeições comerciais também verificam ausência de gravação parcial.

## 23. Testes locais

Banco utilizado: PostgreSQL 18.3, PGlite 0.5.8, WASM descartável. É prova local
de SQL/contratos/ACL/atomicidade, não prova de Supabase completo ou PG17 real.
Não foi instalado pacote nem alterado package.json/lockfile; dependências locais
existentes foram reutilizadas por junction.

Comandos a partir de `web/` (não acessam a stack):

```powershell
node node_modules/vitest/vitest.mjs run tests/vendas-v1-a-dominio.test.ts tests/vendas-v1-a-fronteira.test.ts tests/vendas-v1-b1-schema.test.ts tests/vendas-v1-b1-banco.test.ts tests/vendas-v1-b2-fronteira.test.ts tests/vendas-v1-b2-schema.test.ts tests/vendas-v1-b2-banco.test.ts tests/rls-obrigatoria-schema.test.ts --maxWorkers=3
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
git diff --check
```

Resultados finais ficam registrados no relatório local entregue junto ao diff.
Execução direcionada final: **377/377 testes aprovados em oito arquivos**.
Inclui 77 testes B2 de banco, decoders/cliente, schema/hashes e V1-A/B1/RLS.

## 24. Regressão V1-A/B1 e suíte ampla

O domínio puro e os arquivos de migration B1 não foram alterados. Testes V1-A/B1
continuam executando suas asserções. Só a comparação histórica retira a adição
B2; mantém ambos os hashes históricos esperados.

A execução ampla inicial teve 6.032 aprovados e 6 falhas (6.038 testes/334 arquivos).
Cinco falhas de Mensagens foram reproduzidas em cópia descartável dos arquivos
físicos do HEAD B1: assertions de comentário/grants não normalizam CRLF. Retirados
teve um timeout sob carga; os 47 testes passaram na base B1 e B2 com dois workers.
Nenhum arquivo de Mensagens/Retirados foi editado para contornar o problema.
A execução ampla final limitada a quatro workers teve **6.035 aprovados e cinco
falhas conhecidas**, 6.040 testes em 334 arquivos. Nenhuma falha B2, V1-A, B1 ou
Retirados permaneceu; apenas os cinco casos de Mensagens reproduzidos em B1.

## 25. TypeScript, lint e build

TypeScript passou, e o lint amplo terminou com zero erros. O único warning,
`_choices` em `tests/ia-contrato-requisicao.test.ts:657`, foi reproduzido na cópia B1.
O build padrão Turbopack falhou em B1 e B2 porque a junction node_modules aponta
para fora da raiz; não é diagnóstico de mudança B2. A alternativa local
`node node_modules/next/dist/bin/next build --webpack` não muda configuração
versionada. Esse build passou, incluindo TypeScript e geração de 66 páginas.

## 26. Limitações e gate Supabase pendente

PGlite não prova Auth/JWT/PostgREST reais, cache de schema, conexões concorrentes
independentes, comportamento das policies em Data API nem locks sob contenção real.
O arquivo `web/integration/vendas-v1-b2-supabase-local.test.ts` e sua config estão
preparados, **não executados**. Antes de fixtures, exigem opt-in, URL local exata,
label de projeto e ledger exato com B2 já aplicada em rodada autorizada. Não há
rotina no arquivo para aplicar migration ou resetar stack.

Futuro checkpoint, somente depois de revisão/aplicação B2 autorizada: conferir
HEAD/hashes, stack/portas/ledger/cache; carregar a chave anon local sem divulgar;
executar na pasta `web` com `VENDAS_B2_INTEGRACAO=EXECUTAR_APOS_REVISAO`,
`VENDAS_B2_LOCAL_URL=http://127.0.0.1:55721` e `VENDAS_B2_LOCAL_ANON_KEY` local:

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.vendas-v1-b2-supabase-local.config.ts
```

Config separada não carrega `.env.local` nem entra na suíte comum. Usa contas
artificiais geradas na execução, cliente anon autenticado, e conexão owner local
somente para fixtures/barreiras/provas. Cleanup limita-se aos UUIDs dessas contas
e às constraints temporárias; nunca reseta stack nem usa service role remoto.

Roteiro real preparado: A duas transições na versão N; B/C valores ou imóvel
contra ganho; D/E mesma chave concorrente igual/diferente; F/G no-op, MAX e replay
antigo após avanço; H rollback por constraint; Auth/Data API tenant/anon/escrita
direta; numeric no wire; perda/arquivamento. Contenção usa sessão owner com lock,
duas RPCs independentes e `pg_stat_activity` verificando espera por lock antes da
liberação, não apenas disparo simultâneo de Promises. Fixture/sessões e cleanup
também precisam de observação no checkpoint futuro.

## 27. Diff conceitual

O B1 fornece estrutura imutável para clientes; B2 adiciona sete portas comerciais
atômicas, um adaptador RPC autenticado e decoders fechados. Os mesmos contratos
V1-A orientam as regras. Não foram criadas UI, API Route, views, equipes, B3,
repasses, automações ou integrações externas. O schema antigo continua verificável
por hash; mudanças fora dos arquivos listados não pertencem a esta rodada.

## 28. Riscos a revisar

A canonização binary64 é código crítico e tem gate de paridade próprio; os vetores
não substituem a revisão matemática nem a execução no PostgreSQL da stack alvo.
Bloqueios em ordem diferente podem produzir conflito transitório, tratado por
rollback e repetição explícita da mesma chave. Advisory hash pode colidir e
serializar pedidos independentes, sem atribuir a eles o mesmo recibo/fingerprint.
Perda de conexão não comprova ausência de commit. Grants protegem clientes,
enquanto o owner continua tendo capacidade administrativa. Não há promessa de
concorrência real aprovada nesta rodada.

## 29. Estado Git

HEAD permanece na base B1; mudanças ficam exclusivamente no worktree B2, sem
commit/stage/push/merge/rebase/PR. Package e lockfiles preservados. Worktree B1,
stack B1 e Supabase remoto não foram modificados. O relatório registra status
final, hashes, lista completa e diff com arquivos novos incluídos.

## 30. Conclusão

**PASS LOCAL V1-B2**: gates específicos locais aprovados; suite ampla com os
cinco débitos B1 identificados acima. O gate Supabase real permanece **PENDENTE**, inclusive concorrência e
Auth/PostgREST. Não aplicar B2 à stack nesta rodada. Parar para revisão.
