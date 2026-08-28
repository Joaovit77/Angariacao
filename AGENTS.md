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

# Política obrigatória de regressão do Angario

## Princípio principal

Uma alteração NÃO é considerada concluída apenas porque:

- testes unitários passaram;
- TypeScript passou;
- lint passou;
- build passou.

Preservar comportamentos que já funcionavam é requisito da tarefa.

Antes de modificar um fluxo existente, determine qual é o comportamento atual e quais funcionalidades relacionadas podem sofrer regressão.

---

## Fluxos críticos

Considere os seguintes fluxos críticos:

1. envio de mensagens WhatsApp;
2. recebimento de mensagens WhatsApp;
3. persistência e recuperação do histórico;
4. resolução de telefone/JID/LID;
5. sugestão de resposta por IA;
6. protocolos e política de evidência da IA;
7. execução e confirmação de ações da IA;
8. agenda e visitas;
9. autenticação e RLS;
10. Pipeline e mudança de estado dos imóveis;
11. operações destrutivas ou transacionais.

Uma alteração que tocar código compartilhado por esses fluxos deve ser tratada como potencial regressão mesmo que o pedido do usuário não mencione explicitamente o fluxo.

---

## Antes de alterar

Para qualquer fluxo existente:

1. identifique como funciona atualmente;
2. identifique os testes existentes;
3. procure dependências e consumidores;
4. registre os comportamentos que precisam continuar funcionando;
5. quando houver bug/regressão, compare com a última versão conhecida como funcional usando git diff/histórico.

Não substitua comportamento funcional por uma implementação teoricamente mais correta sem verificar compatibilidade.

---

## Regra de compatibilidade

Se algo funcionava antes da tarefa e deixa de funcionar depois da tarefa, isso é uma REGRESSÃO.

Não classifique como conclusão bem-sucedida.

Não responda "concluído".

Investigue e corrija ou informe explicitamente o bloqueio.

---

## Testes

Novos testes não podem simplesmente reproduzir a nova implementação.

Sempre que possível, crie testes baseados no comportamento esperado do produto.

Para correções de regressão, deve existir um teste que:

1. falhe com a implementação quebrada;
2. passe após a correção;
3. represente o cenário que realmente sofreu regressão.

---

## Integridade dos testes

- Não altere, enfraqueça ou remova testes existentes apenas para acomodar uma nova implementação.
- Quando um teste anteriormente válido passar a falhar, primeiro determine se houve mudança legítima de requisito ou regressão.
- Mudanças de expectativa em testes devem refletir uma decisão real de produto ou contrato, não apenas fazer a suíte voltar a ficar verde.
- Para fluxos críticos, mocks não substituem validação do contrato real da integração quando esta puder ser feita com segurança.


## Fluxos críticos precisam de regressão

Se arquivos relacionados ao WhatsApp forem alterados, valide pelo menos:

- conversa existente continua podendo enviar;
- mensagem recebida continua chegando;
- histórico continua consistente;
- JID/LID existente continua sendo reconhecido;
- destinatário incorreto continua bloqueado;
- falha não cria mensagem fantasma;
- envio não duplica.

Se arquivos relacionados à IA forem alterados:

- respostas anteriormente permitidas continuam permitidas;
- informações proibidas continuam bloqueadas;
- protocolos continuam funcionando;
- ações não são executadas sem a confirmação exigida.

Aplicar a mesma lógica aos demais fluxos críticos.

---

## Smoke test

Quando a tarefa alterar um fluxo crítico de interface ou integração, testes automatizados não são suficientes por si só.

Execute o maior smoke test possível no ambiente disponível.

Se não for possível realizar um teste real por falta de credenciais, dados, conexão ou risco de efeito externo:

NÃO escreva simplesmente "validado".

Declare explicitamente:

"Validação automatizada concluída, mas o fluxo real não foi exercitado."

E forneça ao usuário um roteiro de smoke manual antes do merge.

---

## Critério de conclusão

Para fluxos críticos, uma tarefa só pode ser considerada concluída quando houver:

1. implementação concluída;
2. regressão automatizada proporcional ao risco;
3. validação do fluxo real, quando esta puder ser executada com segurança.

Se o fluxo real não puder ser exercitado por falta de credenciais, dados, conectividade ou risco de efeito externo, não declare a tarefa como concluída.

Nesse caso, informe explicitamente:

"Aguardando smoke manual."

e forneça o roteiro necessário para a validação.

Testes unitários, TypeScript, lint e build não substituem essa etapa quando o comportamento real depende de integração, interface ou serviço externo.



## Integrações externas

Nunca envie mensagens, altere dados de produção ou execute ações externas reais apenas para validar uma tarefa sem autorização explícita.

Quando for necessário smoke real, prepare o sistema e solicite que o usuário teste com um contato/dado seguro.

---

## Ambientes

Diferencie falha de código de limitação ou configuração de ambiente.

Quando uma funcionalidade funcionar em um ambiente e falhar em outro, antes de alterar a implementação verifique:

- variáveis de ambiente;
- secrets;
- autenticação;
- conectividade;
- serviços externos disponíveis;
- diferenças entre desenvolvimento, Preview, staging e Production.

Não trate automaticamente uma falha de ambiente como regressão de código.

Não copie secrets de Production para Preview ou desenvolvimento apenas para fazer uma validação passar.

Quando determinada capacidade não estiver configurada em um ambiente, prefira representá-la explicitamente como indisponível em vez de gerar um erro técnico obscuro para o usuário.

Secrets privilegiados, incluindo service role, devem permanecer exclusivamente no servidor e ter o menor escopo de ambiente possível.






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

## Auto-merge do Git não significa ausência de conflito

Após merges relevantes, inspecione também conflitos semânticos que o Git possa ter auto-mesclado.

Procure por:

- exports duplicados;
- imports duplicados;
- funções equivalentes coexistindo;
- implementações antigas e novas no mesmo arquivo;
- seletores CSS duplicados;
- mudanças de comportamento incompatíveis sem marcador de conflito.

Um arquivo sem `<<<<<<<` ainda pode estar semanticamente conflitado.


## Preservação de contexto

Durante tarefas longas:

- seja econômico nas mensagens intermediárias;
- não peça autorização para conflitos mecânicos ou de baixo risco quando a solução estiver coberta por estas regras;
- pare apenas diante de decisão de produto, risco de dados, segurança, schema, autenticação, RLS, integração externa ou comportamento incompatível;
- mantenha relatórios intermediários curtos;
- preserve contexto para concluir a tarefa.

## Git

Não faça merge na main sem solicitação explícita.

Não faça push quando o usuário pedir revisão antes da integração.

Preserve um ponto claro de rollback.

---


## Relatório final obrigatório

Para alterações relevantes informe:

- comportamento anterior;
- alteração realizada;
- possíveis áreas impactadas;
- regressões verificadas;
- testes executados;
- testes que não puderam ser executados;
- validação manual necessária;
- riscos conhecidos.

Nunca use "tudo certo", "tudo verde" ou equivalente se algum fluxo crítico relevante não tiver sido efetivamente validado.



