# Instruções para agentes

## Documentação

[`PROJECT.md`](PROJECT.md) é a fonte canônica de contexto, arquitetura, regras e decisões permanentes
deste projeto.

Antes de implementar uma mudança relevante:

1. leia as partes pertinentes de `PROJECT.md`;
2. consulte a documentação específica do domínio alterado;
3. respeite as decisões e invariantes existentes, salvo quando a tarefa exigir explicitamente
   alterá-los;
4. ao entrar em uma subpasta, aplique também qualquer `AGENTS.md` mais específico encontrado nela.

Após uma mudança arquitetural ou permanente, atualize `PROJECT.md` somente quando necessário.
Mantenha-o objetivo, atual e neutro em relação a ferramentas. Não o transforme em changelog: não
registre correções visuais, ajustes de texto, bugs triviais, números de testes de cada commit nem
decisões temporárias.

Documentos de domínio continuam canônicos em seus próprios escopos:

- `supabase-schema.sql`: schema e políticas do banco;
- `DEPLOY.md`: deploy, configuração e runbooks;
- `INTEGRACAO_SOPHIA.md`: contrato externo da integração Sophia;
- `MIGRATION_NEXT.md` e `BASELINE_ETAPA0.md`: histórico e contrato da migração para Next.js;
- `PROTOTIPOS_LOCAIS.md`: limites de protótipos isolados.

## Regras de trabalho

- Preserve o escopo. Não altere módulos alheios à tarefa sem necessidade comprovada.
- Preserve autenticação, RLS e isolamento por `user_id`. A service role ignora RLS; toda operação
  privilegiada deve descobrir o usuário por uma fonte confiável e filtrar explicitamente por ele.
- Nunca publique `.env`, secrets, tokens ou dados pessoais. Variável `NEXT_PUBLIC_*` é pública.
- Não altere schema, políticas, dados ou serviços externos fora do escopo. Não execute operações
  destrutivas sem necessidade e autorização claras.
- Não inclua em commits arquivos locais, caches, credenciais ou experimentos. Não modifique, mova,
  apague nem integre `mapillary-facade-test` sem solicitação explícita; veja `PROTOTIPOS_LOCAIS.md`.
- Preserve os invariantes descritos em `PROJECT.md`, em especial `statusHistory`, datas por
  `lib/datas.ts`, núcleo de cálculo compartilhado e escrita no Supabase antes do estado local.
- Toda UI, mensagem e comentário novo deve usar português do Brasil.

## Qualidade visual do frontend

- Priorize boa aparência, legibilidade, hierarquia visual, consistência e responsividade em todas as
  telas do frontend.
- Ao identificar durante o trabalho um problema visual claro e semelhante ao que está sendo tratado,
  corrija-o proativamente quando o ajuste for seguro, localizado e não alterar o fluxo do produto.
- Sempre informe ao usuário os ajustes visuais feitos, inclusive os encontrados e corrigidos de forma
  incidental. Para mudanças amplas de UX, comportamento ou identidade visual, peça direção antes de
  implementar.

## Validação

Execute testes proporcionais ao risco e ao domínio alterado. Para mudanças de código em `web/`,
consulte a seção de validação de `PROJECT.md`; para mudanças somente em Markdown, confira links e
referências e execute ao menos `git diff --check`.
