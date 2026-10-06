# Vendas V1-B3: contrato do interessado

Estado: B3.1 (contrato TypeScript puro) implementado localmente. B3.2 (banco) não existe:
nenhuma migration, RPC ou alteração em `public.contatos` foi feita.

## Decisões do B3.0

1. `contatos.origem = 'vendas'` para pessoas criadas por Vendas (entra no B3.2).
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
`web/tests/vendas-v1-b3-1-paridade.test.ts` (PGlite local: telefone TS × SQL, fingerprint B2,
recusa do formato B3 pelo B2 em vigor). O resumo das regras está no `PROJECT.md`, seção
"Vendas: contrato do interessado (V1-B3.1)".

## Catálogo de erros proposto

Mesmo envelope do B2 (`detail = {contrato:"vendas-b2-v1",codigo,motivo}`).

| Código | SQLSTATE | Origem |
| --- | --- | --- |
| `estrutura-invalida`, `contato-invalido` | PT422 | B2 |
| `conflito-transitorio` | PT503 | B2 |
| `nome-invalido`, `telefone-invalido`, `contato-fundido`, `contato-anonimizado` | PT422 | B3 |
| `telefone-ja-cadastrado`, `telefone-em-revisao`, `interessado-ambiguo`, `interessado-indisponivel` | PT409 | B3 |

`contato-invalido` continua sendo a única resposta para id inexistente ou de outra conta. Os
códigos de lápide e anonimização só são emitidos depois de confirmada a posse pela conta.

## Proposta para o B3.2 (não implementada)

**Migration única**, com timestamp maior que `20261005160044` e que qualquer migration aplicada
antes dela (inclusive a R6.1 reemitida, se chegar primeiro; se o B3.2 chegar antes, a R6.1 é que
precisa de timestamp posterior e do teste `.at(-1)` ajustado).

1. `public.contatos`: recriar `contatos_origem_check` com `'vendas'` acrescentado. Os registros
   atuais já satisfazem a lista; espelhar em `supabase-schema.sql`.
2. `private.vendas_b3_resolver_interessado(p_usuario uuid, p_telefone text) returns jsonb`:
   implementação única da resolução, usada pela porta de leitura e pelo `criar`. Lê só a conta
   recebida: canais ativos com o mesmo canônico (`public.telefone_canonico` do texto aparado),
   revisões `telefone-alterado-legado` pendentes com `evidencia->>'canonico_novo'` igual, e a
   cadeia de lápide até 8 saltos com detecção de ciclo. **Não reutiliza
   `private.resolver_contato_por_canal`**: aquela para no oitavo salto e devolve o contato em que
   parou, sem falhar; aqui cadeia longa, quebrada ou circular é `indisponivel`. EXECUTE revogado
   de clientes.
3. `public.vendas_resolver_interessado(p_consulta jsonb) returns jsonb`: objeto fechado
   `{telefone}`; usuário sempre de `auth.uid()`; resposta só com status, ids e avisos, na forma de
   `ResolucaoInteressadoVenda`. SECURITY DEFINER com owner postgres e `search_path = ''`, como as
   portas B2, para que a resolução tenha uma só implementação. (Alternativa a decidir: INVOKER com
   RLS, ao custo de duplicar a lógica no `criar`.)
4. `private.vendas_b2_normalizar` e `private.vendas_b2_executar` (`create or replace`, mesmas
   assinaturas): na porta `criar`, exatamente um entre `contatoId` e `interessado`.
   - Legado: argumento do fingerprint inalterado (o id). Passa a recusar lápide
     (`contato-fundido`) e anonimizado (`contato-anonimizado`), além do `contato-invalido` de hoje.
   - Existente: argumento `["existente", id]`; mesmas checagens do legado.
   - Novo: argumento `["novo", nome aparado, canônico|null]`. Com telefone, toma
     `pg_advisory_xact_lock` sobre `(usuario, canônico)`, refaz a resolução e só cria quando ela
     é `nao-encontrado`; sem telefone, cria direto. Cria `contatos(user_id, nome, origem='vendas')`
     e, se houver número, `contatos_telefones(telefone digitado aparado, principal, motivo
     'cadastro')`. Nenhuma ligação em `imoveis_contatos`.
   - `unique_violation` passa a virar `conflito-transitorio` (corrida com o cadastro de imóvel,
     que não usa o lock).
   - Recibo, evento `oportunidade_criada` (só `contatoId`) e resposta `vendas-b2-v1` sem mudança de
     forma. Tudo na mesma transação: falha na oportunidade desfaz o contato.
5. Grants: EXECUTE da nova porta só para `authenticated`; nenhum grant de escrita em tabela.

**Não muda:** `imoveis`, `imoveis_contatos`, triggers de Contatos, webhook, mensagens,
Retirados, eventos e recibos do B1. Inserir contato e telefone sem ligação não dispara projeção
nem efeito algum.

**Provas do B3.2:** PGlite com o schema real (criação, reaproveitamento por id, lápide,
anonimizado, revisão, rollback, replay exato, chave conflitante, fingerprint legado igual ao B2,
`unique_violation`); Supabase local (Docker manual) para RLS de duas contas, duas sessões
concorrentes com o mesmo número, PostgREST e grants. Aplicar em Production é gate separado.

## Riscos registrados

- Corrida entre Vendas e o cadastro de imóvel com o mesmo número novo: um dos lados recebe
  violação de unicidade (no cadastro de imóvel isso já existe hoje entre dois cadastros).
- Interessado sem telefone não tem deduplicação; a chave idempotente deve nascer na abertura do
  formulário, não no clique.
- A forma canônica tira o nono dígito: fixo `43 3324-5678` e celular `43 9 3324-5678` colidem.
  Risco herdado, coberto por vetor de teste, não alterado aqui.
- Número estrangeiro não canoniza: o interessado entra sem telefone.
