# Vendas V1-B3: contrato do interessado

Estado: B3.1 (contrato TypeScript puro) publicado na branch. B3.2 (banco) implementado e provado
**localmente** (PGlite e Supabase local isolado); não aplicado em Production.

## Decisões do B3.0

1. `contatos.origem = 'vendas'` para pessoas criadas por Vendas.
2. Telefone em revisão (`telefone-alterado-legado` pendente) bloqueia contato novo com esse número.
3. Modo novo exige nome, mesmo com telefone.
4. `vendas_oportunidades.contato_id` é imutável no V1.
5. Nada é fundido automaticamente.
6. Contato existente nunca é renomeado.
7. O B3 não acrescenta telefone a contato existente.
8. Vendas guarda só `contato_id`, sem cópia de nome ou telefone.
9. Arquitetura híbrida: resolução só de leitura + `criar` evoluído de forma compatível.

## Contrato TypeScript (B3.1)

[`web/lib/persistencia/vendasInteressado.ts`](../web/lib/persistencia/vendasInteressado.ts), com
testes em `web/tests/vendas-v1-b3-1-interessado.test.ts` (unitários e casos A a J) e
`web/tests/vendas-v1-b3-1-paridade.test.ts` (PGlite local: telefone TS × SQL, fingerprint B2). O
resumo das regras está no `PROJECT.md`, seção "Vendas: contrato do interessado (V1-B3.1)".

## Catálogo de erros

Mesmo envelope do B2 (`detail = {contrato:"vendas-b2-v1",codigo,motivo}`), reconhecido por
`CODIGOS_ERRO_VENDA` e `decodificarErroVenda` desde o B3.2.

| Código | SQLSTATE | Origem |
| --- | --- | --- |
| `estrutura-invalida`, `contato-invalido` | PT422 | B2 |
| `conflito-transitorio` | PT503 | B2 |
| `nome-invalido`, `telefone-invalido`, `contato-fundido`, `contato-anonimizado` | PT422 | B3 |
| `telefone-ja-cadastrado`, `telefone-em-revisao`, `interessado-ambiguo`, `interessado-indisponivel` | PT409 | B3 |

`contato-invalido` continua sendo a única resposta para id inexistente ou de outra conta. Os
códigos de lápide e anonimização só são emitidos depois de confirmada a posse pela conta.

## B3.2: migration `20261006123603_vendas_v1_b3_2_interessado.sql`

Uma transação (`lock_timeout` 5 s, `statement_timeout` 60 s), espelhada literalmente no
`supabase-schema.sql` como bloco `VENDAS V1-B3.2` logo depois do B2. Ordem:

1. `create or replace private.vendas_b2_erro`: catálogo B2 intacto + 8 códigos do B3.
2. `create public.vendas_resolver_interessado(p_consulta jsonb) returns jsonb`: **SECURITY
   INVOKER**, STABLE, `search_path = ''`. É a única implementação da resolução. Não usa `private`
   (o `authenticated` não tem USAGE nesse schema) nem `auth.users`; exige `auth.uid()` (PT401) e
   o objeto fechado `{telefone: string}` (PT422). Todas as leituras filtram `user_id =
   auth.uid()`: chamada pelo navegador, a RLS de contatos vale junto; chamada pelo executor
   (owner), o filtro explícito é a barreira. Resposta `{contrato:"vendas-b3-resolucao-v1",
   status, …}` com só ids e marcas, na forma de `ResolucaoInteressadoVenda`. A lápide é percorrida
   com falha fechada (faltante, ciclo ou mais de 8 saltos); **não** reutiliza
   `private.resolver_contato_por_canal`, que para no oitavo salto sem falhar.
3. `create or replace private.vendas_b2_normalizar`: em `criar`, exatamente um entre
   `contatoId` (objeto normalizado e argumento do fingerprint idênticos ao B2) e `interessado`
   (`["existente",id]` ou `["novo",nome aparado,canônico|null]`).
4. `create or replace private.vendas_b2_executar`: muda só a identificação do contato em `criar`.
   - Legado e existente: `FOR SHARE` no contato da conta; lápide → `contato-fundido`,
     anonimizado → `contato-anonimizado`, outra conta ou inexistente → `contato-invalido`.
   - Novo com telefone: depois da trava da chave B2, trava
     `('vendas-b3-telefone-1', usuario, canônico)`, refaz a resolução num comando posterior e só
     cria quando ela é `nao-encontrado`. Novo sem telefone cria direto. Cria
     `contatos(origem='vendas')` e `contatos_telefones(motivo 'cadastro')`, sem `imoveis_contatos`.
   - Só a `unique_violation` de `contatos_telefones_ativo_unico_idx` vira `conflito-transitorio`;
     qualquer outra segue o caminho B2 (`falha-interna`).
   - Recibo, evento `oportunidade_criada` (só `contatoId`) e resposta `vendas-b2-v1` inalterados.
5. Owner postgres, `revoke all` de clientes nas funções substituídas e na resolução; EXECUTE da
   resolução só para `authenticated`.
6. Por último, `contatos_origem_check` recriado com `'vendas'` acrescentado (lock exclusivo só até
   o commit).

**Não muda:** `imoveis`, `imoveis_contatos`, `contatos_revisoes`, triggers, policies, views, as
outras seis portas, Retirados, Radar, WhatsApp, Agenda.

## Provas locais do B3.2

- `web/tests/vendas-v1-b3-2-banco.test.ts` (PGlite): recibo criado pelo B2 puro antes da
  migration repete igual depois dela; fingerprints legados idênticos antes/depois; resolução
  comparada caso a caso com a função TS do B3.1; todos os caminhos de `criar`; rollback sem
  contato órfão; idempotência; as duas unicidades; ACL; origem.
- `web/tests/vendas-v1-b3-2-schema.test.ts`: espelho literal, ordem, escopo e forma da resolução.
- `web/integration/vendas-v1-b3-2-supabase-local.test.ts` (opt-in, config própria): stack local
  isolada `vendas-b32-6774dce` (portas 558xx), baseline `6015984` + migrations até o B2, fase
  `pre` (recibo B2), `migration up --local` do B3.2, fase `pos`: recibo repetido igual, RLS A/B
  pelo PostgREST, ACL, nenhum efeito colateral com as triggers reais de Contatos, concorrência
  real com barreira (a segunda sessão vê o commit da primeira depois da trava, então a resolução
  STABLE fica), corrida com o cadastro de imóvel e a ordem inversa.

Aplicar em Production é gate separado. Como o SQL comita antes de o CLI gravar o ledger, o gate
confere ledger e catálogo depois do `db push`; schema aplicado sem ledger é HOLD crítico, sem
retry e sem `repair` automático.

## Riscos registrados

- Corrida entre Vendas e o cadastro de imóvel com o mesmo número novo: Vendas recebe
  `conflito-transitorio` (provado); no sentido inverso, o cadastro de imóvel pode receber violação
  de unicidade, como já acontece hoje entre dois cadastros.
- Interessado sem telefone não tem deduplicação; a chave idempotente deve nascer na abertura do
  formulário, não no clique.
- A forma canônica tira o nono dígito: fixo `43 3324-5678` e celular `43 9 3324-5678` colidem.
  Risco herdado, coberto por vetor de teste, não alterado aqui.
- Número estrangeiro não canoniza: o interessado entra sem telefone.
