# Vendas V1-B1: estrutura e validação

Este checkpoint cria somente a fundação local. A migration não foi aplicada remotamente.
O domínio puro V1-A permanece o contrato comercial; B1 não oferece operações de negócio.

## Base e arquivos canônicos

Base aprovada: faecf960a2ebaf95d6575fa5fcad7f220350a086.
Migration única: [20261005003257_vendas_v1_b1_estrutura.sql](../supabase/migrations/20261005003257_vendas_v1_b1_estrutura.sql).
Espelho literal entre os marcadores BEGIN/END VENDAS V1-B1 em
[supabase-schema.sql](../supabase-schema.sql). O teste compara os blocos e verifica por hash que
todo o schema anterior permaneceu intacto. A migration é incremental, transacional, aditiva,
sem backfill ou alterações de tabelas legadas. Deve ser aplicada uma vez pelo histórico de migrations;
o bloco não é um script de reaplicação em tabelas de Vendas já criadas.

## Reauditoria de dependências

A inspeção do schema/migrations e a consulta somente de catálogos confirmaram:

- imoveis e contatos possuem UNIQUE (id, user_id), necessário às FKs compostas.
- contatos_telefones, imoveis_contatos e contatos_revisoes já usam vínculos por conta.
  As quatro tabelas de contatos têm SELECT próprio e nenhum grant de escrita para authenticated.
  imoveis conserva seu padrão de CRUD próprio. B1 não altera essas tabelas/policies/grants.
- private existe e sua ACL observada concede USAGE/CREATE somente ao owner postgres.
  Os defaults de public concedem privilégios amplos a anon, authenticated e service_role;
  por isso o B1 revoga explicitamente todos os privilégios das tabelas novas antes do SELECT.
- Funções privilegiadas existentes usam SECURITY DEFINER, search_path vazio e ACL restrita.
  O B1 não cria função privilegiada: o único helper é uma função SQL IMMUTABLE que verifica
  texto útil com os mesmos caracteres de trim do JavaScript, sem consultar outras linhas.
- ensure_rls é uma event trigger legada que habilita RLS em public. B1 habilita RLS explicitamente
  nas quatro tabelas, inclusive private, e os testes executam sem essa trigger.
  As triggers de grants de pg_cron, pg_net e pg_graphql se restringem à instalação dessas extensões;
  B1 não instala extensão nem modifica essas triggers.

Nenhuma exposição global da Data API, default privilege ou ACL de schema é modificada.
O CREATE SCHEMA IF NOT EXISTS somente acomoda a existência do namespace; a segurança do recibo
depende também de REVOKE explícito na própria tabela e ausência de policies/grants de cliente.
O teste adversarial concede temporariamente USAGE no banco descartável e comprova que a tabela
continua inacessível. Não houve leitura de contatos/imóveis comerciais nessa reauditoria.

## Modelo final

| Tabela | Conteúdo e autoridade |
| --- | --- |
| public.vendas_oportunidades | Snapshot com todos os campos conceituais aprovados, contato obrigatório, estado, versão, identificação do imóvel, origem, valores, autoria, encerramento e arquivamento |
| public.vendas_imoveis_referencias | Identidade mínima congelada; ponteiro vivo nullable e UUID original obrigatório sem FK para o registro apagável |
| public.vendas_oportunidades_eventos | ID, conta, oportunidade, tipo, ator, instante, dia do fato, versão, payload objeto e chave |
| private.vendas_comandos | ID, conta/chave única, operação, fingerprint SHA-256 em hexadecimal minúsculo, oportunidade, evento opcional, resposta objeto, criação e conclusão |

Os tipos de linhas brutas estão em [vendasTipos.ts](../web/lib/persistencia/vendasTipos.ts).
JSON recebido é unknown até decodificação futura. Numeric/bigint de transportes podem ser
texto ou número; isso não é autorização para coerção automática. Não há mapper ou cliente B1.

### FKs e exclusão

- Todas as tabelas pertencem a auth.users, com ON DELETE CASCADE da conta.
- Referência: (imovel_id, user_id) → imoveis(id, user_id), ON DELETE SET NULL (imovel_id).
  A cláusula com coluna evita tentar anular user_id NOT NULL. imovel_id_original não é FK.
- Oportunidade: (contato_id, user_id) → contatos(id, user_id), ON DELETE NO ACTION.
  Contato não vira NULL. A FK preserva a cascata de remoção da conta ao final da instrução.
- Oportunidade: (imovel_referencia_id, user_id) → referências(id, user_id), NO ACTION.
- Evento: (oportunidade_id, user_id) → oportunidades(id, user_id), NO ACTION.
- Recibo: (oportunidade_id, user_id) → oportunidades; (evento_id, oportunidade_id, user_id)
  → eventos(id, oportunidade_id, user_id), ambos NO ACTION.

UNIQUE (id, user_id) existe em oportunidade e referência; UNIQUE (id, oportunidade_id, user_id)
em evento atende à FK do recibo. UNIQUE (oportunidade_id, versao) impede dois eventos da mesma
versão. UNIQUE (user_id, chave_idempotencia) reserva identidade de recibo sem implementar retries.

Ao apagar um imóvel vivo, referência, oportunidade, versão, encerramento, eventos e recibo
sobrevivem; somente o ponteiro vivo é anulado. O identificador original será mapeado ao
imovelId conceitual no B2. O teste utiliza a função legada literal
excluir_imovel_com_dependencias, com tabelas auxiliares mínimas descartáveis de agenda/fila.
Isso prova a interação de sua instrução DELETE com a FK nova, sem alegar smoke de WhatsApp/Agenda.

### CHECKs

O banco impõe os cinco estados, sete origens, cinco motivos de perda e sete tipos de evento
do V1-A, versão bigint inclusiva 1–9007199254740991, autoria individual do V1,
modo do imóvel exclusivo e identificação manual útil. Negociação e ganho exigem imóvel tratado.
Ganho exige confirmação true, formalização útil, dia/instante e nenhum motivo de perda.
Perda exige motivo, dia/instante e justificativa útil para outro; não aceita campos de ganho.
Estado aberto não aceita encerramento. Valor fechado pertence somente ao ganho.
Arquivamento exige terminalidade. Instantes são finitos e coerentes dentro da própria linha;
dia civil fica em 0100–9999. CASE/IS TRUE evitam o bypass de CHECK por resultado NULL.

Valores são NULL ou numeric finito não negativo. Payload/resposta devem ser objetos JSON;
chaves não podem ser só whitespace. Fingerprint exige 64 caracteres hexadecimais minúsculos.
A implementação do algoritmo/canonicalização e da resposta de negócio permanece no B2.

Transições dependentes do snapshot anterior, início operacional em versão 1, incremento,
imutabilidade terminal, monotonicidade perante a versão anterior, no-op, CAS, construção do
payload, não-futuro em Brasília, atomicidade e idempotência operacional não são implementados.
Nenhum cliente tem grant/policy capaz de explorar essa ausência.

### Índices

| Tabela | Índices explícitos |
| --- | --- |
| oportunidades | (user_id, estado, created_at, id); (user_id, created_at, id); (user_id, encerrado_em, id); (user_id, contato_id); (user_id, imovel_referencia_id) |
| referências | (user_id, imovel_id); (user_id, imovel_id_original) |
| eventos | (user_id, oportunidade_id, registrado_em, id) |
| recibos | (user_id, oportunidade_id); (evento_id, oportunidade_id, user_id) |

PKs e UNIQUEs também geram índices B-tree. Os dois índices de recibo cobrem verificações das
FKs nas filhas. Não há GIN, particionamento ou índice especulativo.

### RLS e grants

RLS é ligada explicitamente nas quatro tabelas. As três públicas têm somente FOR SELECT TO
authenticated USING ((SELECT auth.uid()) = user_id); private não tem policy.
REVOKE ALL ON TABLE das quatro remove PUBLIC, anon, authenticated e service_role.
A concessão final é somente SELECT das três públicas para authenticated.
EXECUTE do helper privado também é revogado dessas roles.
Não há UPDATE/DELETE/INSERT, função administrativa genérica, trigger comercial ou API B1.
Owner conserva autoridade administrativa; esta é uma fronteira do navegador, não um log
criptográfico contra administradores. Escrita futura exige operações restritas e auditadas.

## Prova PostgreSQL de numeric e da FK

O catálogo remoto informou PostgreSQL 17.6. Localmente foram executados motores PostgreSQL
17.5 (PGlite 0.3.14 isolado no diretório temporário) e 18.3 (PGlite 0.5.8 já usado pelo projeto).
O motor 17 foi adicionado somente fora do repositório; nenhuma dependência/lockfile foi alterada.

Os dois motores aplicaram a migration inteira em baseline descartável mínimo com definições
literais de imoveis/contatos extraídas do schema canônico e a migration da chave composta de
imoveis. Os testes executaram constraints, FKs, roles, RLS, grants e exclusão.
ON DELETE SET NULL (imovel_id) foi aceito e anula somente essa coluna.

| Entrada numeric | Resultado |
| --- | --- |
| NULL, zero | Preservados; NULL não é convertido em zero |
| -0.001 | Recusado |
| NaN, Infinity, -Infinity | Recusados nos três campos |
| 1.23456789123456789 | Preservado sem escala/arredondamento imposto |
| 1.7976931348623157e308, 5e-324 | Preservados, incluindo extremos representáveis do domínio JS |
| 1e1000 | Numeric consegue armazenar; além de Number, exige recusa/decodificação segura no B2 |

No PostgreSQL, NaN e Infinity passam em >= 0; NaN ordena acima de Infinity.
Por isso a condição é valor >= 0 AND valor < 'Infinity'::numeric, sem supor isfinite(numeric).
Numeric sem precisão/escala declarada mantém limites internos do PostgreSQL, sem inventar teto
monetário. A precisão decimal do banco não altera o contrato de números JS do núcleo; B2 terá
de recusar conversão não finita e tratar o transporte sem perdas silenciosas.

Referências: [numeric PostgreSQL 17](https://www.postgresql.org/docs/17/datatype-numeric.html)
e [FKs/CHECKs PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-constraints.html).

## Execução local reproduzível

Em web, os testes normais usam o motor instalado nas dependências do projeto:

~~~powershell
node node_modules/vitest/vitest.mjs run tests/vendas-v1-b1-schema.test.ts tests/vendas-v1-b1-banco.test.ts tests/rls-obrigatoria-schema.test.ts tests/vendas-v1-a-dominio.test.ts tests/vendas-v1-a-fronteira.test.ts
~~~

Para repetir com o motor 17 já instalado fora do repositório, apontar VENDAS_PGLITE_MODULE para
o caminho absoluto de @electric-sql/pglite 0.3.14/dist/index.js e rodar apenas o teste de banco.
O teste verifica que o motor alternativo realmente é PostgreSQL 17. Depois, remover a variável
da sessão. Não carregar .env.local ou credenciais em testes.

Os testes estruturais enumeram tabelas/colunas/constraints, verificam equivalência do espelho,
ausência de alterações legadas, RLS e grants. O teste geral de RLS passou a verificar também
private.vendas_comandos; outras tabelas privadas continuam exigindo aprovação explícita.
Os testes de banco usam somente contas/dados artificiais descartáveis.

## Limitações e gate de integração

Não há Docker/Supabase local completo, Auth real, PostgREST, Storage ou PostgreSQL nativo nesta
máquina. PGlite executa o PostgreSQL, mas uma sessão e auth.uid de teste não comprovam login,
exposição da Data API, configuração global do serviço, concorrência ou o baseline inteiro.
Não foi aplicada migration no PostgreSQL remoto 17.6. A leitura remota foi apenas de catálogos.

O baseline completo possui uma limitação anterior documentada em [DEPLOY.md](../DEPLOY.md):
o schema canônico inteiro não substitui por si só a sequência histórica de bootstrap e não é
uma reaplicação universal. Isso não foi corrigido no B1. O teste mínimo deixa essa diferença explícita.

Prova local estrutural aprovada não libera integração/deploy: HOLD para o smoke completo.
Aguardando smoke manual em Supabase descartável, após autorização específica para esse ambiente.
Roteiro da validação estrutural restante:

1. Preparar baseline completo descartável conforme DEPLOY.md, sem secrets/dados de Production.
   Confirmar PostgreSQL 17 e as chaves compostas, ACL de private, defaults e event triggers.
2. Aplicar somente esta migration nesse ambiente autorizado. Conferir catálogos de colunas,
   constraints, FKs, índices, relrowsecurity, policies, ACLs e função; comparar com o espelho.
3. Criar fixtures pelo owner, com contas A/B artificiais; autenticar via Auth e consultar via Data API.
   A lê somente suas três tabelas, B não lê A, anon não lê, nenhum navegador escreve.
4. Tentar INSERT/UPDATE/DELETE e chamadas diretas ao helper/recibos; todos devem ser negados.
   Recibos permanecem inacessíveis mesmo se outro módulo conceder USAGE em private.
5. Pelo owner, tentar vínculos cruzados, snapshots incoerentes, especiais numeric, versões inválidas,
   evento/versão duplicados e recibo ligado a evento de outra oportunidade; todos devem falhar.
6. Apagar imóvel artificial pela função existente; conferir que só o ponteiro vivo foi anulado.
   Contato e referência usados não podem ser apagados. Conferir filas/agenda/históricos legados
   desse imóvel e cascata administrativa da conta artificial.
7. Registrar evidências e remover somente o ambiente/fixtures descartáveis.

Não testar criação comercial, CAS, retries, transições de negócio, UI ou concorrência de RPC no B1;
essas capacidades ainda não existem. Não usar Production, aplicar remotamente ou promover como
parte deste roteiro sem autorização posterior.

## Rollback e riscos

Antes de aplicação, rollback local é retirar apenas os arquivos/bloco desta alteração.
Não há dados migrados ou commit/push nesta rodada. Depois de aplicação futura, não remover
tabelas populadas sem plano específico: referências/eventos/recibos constituem histórico.
A migration obtém locks normais para criação/FKs e usa lock_timeout 5s e statement_timeout 60s.

Os riscos remanescentes são integração Supabase completa pendente e as fronteiras operacionais
deliberadamente adiadas ao B2. Não há escrita exposta enquanto elas estão ausentes.
A execução com owner continua possível por desenho e não deve ser apresentada como API de negócio.

## Registro da validação local

Na revisão B1 de 04/10/2026:

| Verificação | Resultado |
| --- | --- |
| Vendas V1-A + B1 + teste geral de RLS | 238 testes aprovados |
| Banco B1 no motor PostgreSQL 17.5 | 53 testes aprovados; mesma migration integral |
| Banco B1 no motor PostgreSQL 18.3 | 53 testes aprovados |
| Suíte completa final, 2 workers | 5896 aprovados, 5 falhas em 5901; 330 arquivos aprovados de 331 |
| TypeScript | Aprovado |
| Lint completo | Sem erro; 1 aviso preexistente em ia-contrato-requisicao.test.ts:657 |
| Build padrão Turbopack | Limitação do worktree: node_modules é vínculo fora da raiz de filesystem do compilador |
| Build alternativo webpack | Aprovado, sem modificar configuração do projeto |
| git diff --check e links locais novos | Aprovados |

As cinco falhas finais estão em mensagens-agendadas.test.ts e se reproduziram numa exportação
descartável da mesma base aprovada, com SQLs nos mesmos finais CRLF do checkout Windows:
duas expectativas do parser de claim encontram conteúdo adicional já existente no baseline;
três expectativas de texto da ACL não normalizam CRLF.
Não foram alterados o código dessas funções, essas migrations nem o teste para acomodar falhas.

Na execução ampla inicial também houve timeouts externos ao escopo e uma expectativa de
temporização do Garimpo que mediu poucos milissegundos abaixo da tolerância.
As verificações direcionadas e a suíte final passaram nesses arquivos.
O teste de equivalência C13 inicialmente detectou o bloco de Vendas acrescentado após seu
espelho terminal; a seção B1 foi reposicionada antes do C13, preservando seu teste e toda a
sequência legada. Nenhum teste C13 foi alterado.

A inspeção somente de catálogos identificou os schemas auth, cron, extensions, graphql,
graphql_public, net, private, public, realtime, storage, supabase_migrations e vault.
Não há USAGE de private para anon, authenticated ou service_role.
A configuração pgrst.db_schemas não apareceu em pg_db_role_setting; isso não comprova a
exposição efetiva configurada no serviço, que continua no gate de integração completa.

Arquivos da alteração, exclusivamente:

- [PROJECT.md](../PROJECT.md)
- [supabase-schema.sql](../supabase-schema.sql)
- [migration B1](../supabase/migrations/20261005003257_vendas_v1_b1_estrutura.sql)
- [contratos de linhas](../web/lib/persistencia/vendasTipos.ts)
- [testes estáticos B1](../web/tests/vendas-v1-b1-schema.test.ts)
- [testes PostgreSQL B1](../web/tests/vendas-v1-b1-banco.test.ts)
- [teste geral de RLS](../web/tests/rls-obrigatoria-schema.test.ts)
- Este roteiro de validação.

São 4 tabelas, 6 FKs compostas (além de 4 vínculos à conta), 29 CHECKs, 5 UNIQUEs, 10 índices
explícitos, 4 habilitações de RLS e 3 policies de SELECT. O conteúdo anterior do schema é
preservado integralmente, descontando somente a inserção nova e normalização de finais de linha.

Resultado: PASS LOCAL estrutural; HOLD para integração Supabase completa.
Validação automatizada concluída, mas o fluxo real não foi exercitado.
Aguardando smoke manual do roteiro acima, em ambiente descartável autorizado.
Não houve commit, push, backfill, aplicação remota, deploy ou promoção.
