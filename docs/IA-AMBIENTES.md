# IA por ambiente

Este documento é a política operacional única para chamadas reais à OpenAI no Angario. Ele se
aplica à IA textual, Assistente, embeddings, classificação de respostas e transcrição de áudio.

## Política

| Ambiente | Chamadas reais à OpenAI |
| --- | --- |
| Production da Vercel | Permitidas quando a chave, a permissão do usuário e as demais configurações estiverem válidas. |
| Preview ou outro ambiente hospedado não produtivo | Sempre bloqueadas, mesmo com `ALLOW_REAL_OPENAI=1`. |
| Local com `npm run dev` | Permitidas somente com chave local e opt-in literal `ALLOW_REAL_OPENAI=1`. |
| CI | Sempre bloqueadas. |
| Codex | Sempre bloqueadas. |

`ALLOW_REAL_OPENAI` é exclusivamente um opt-in local. Não é variável de Vercel, não libera Preview
e não funciona como kill switch de Production. Na Vercel, `OPENAI_API_KEY` deve ter escopo somente
de Production.

## Fluxo correto

### Desenvolvimento e testes determinísticos

1. Implemente usando os contratos, mocks, fakes ou fixtures existentes.
2. Mantenha `ALLOW_REAL_OPENAI=0` ou ausente.
3. Rode `npm test`, `npx tsc --noEmit`, `npm run lint` e `npm run build`.
4. Nunca carregue `.env.local` em testes automatizados.

Os ensaios de `web/tests-real-openai/` ficam fora da suíte comum e são exclusivamente manuais. CI
e Codex não podem executá-los.

### Smoke local com IA real

Somente uma pessoa explicitamente autorizada pode fazer o smoke real:

1. use uma chave local dedicada, com orçamento limitado, em `web/.env.local`;
2. defina `ALLOW_REAL_OPENAI=1` deliberadamente;
3. inicie o app com `npm run dev` e use apenas dados seguros;
4. confira resultado, custo e logs sanitizados;
5. ao terminar, remova o opt-in e não versione a chave.

O Codex pode preparar o roteiro, mas não pode executar esse smoke nem manipular a credencial.

### Preview e deploy

Preview serve para validar interface, autenticação, respostas de indisponibilidade e fluxos sem
OpenAI real. O resultado esperado para uma tentativa paga é bloqueio fail-closed, sem transporte.

Depois que testes e Preview passarem, o código pode seguir para `main` pelo fluxo autorizado do
repositório. Production usa a chave de escopo Production e continua sujeita às permissões e limites
do produto. Smoke real em Production exige autorização explícita e não deve ser usado como rotina
de desenvolvimento.

Ao endurecer ou trocar a política, inventarie deployments antigos: retirar uma variável do escopo
não deve ser tratado como prova de que um deployment já criado perdeu a credencial. Remova ou
redeploye Previews antigos e revogue a chave quando necessário.

## O que nunca fazer

- liberar OpenAI real em Preview;
- alterar o escopo de variável por branch para testar IA;
- sugerir `ALLOW_REAL_OPENAI=1` em Preview;
- usar chamadas reais em testes automatizados;
- usar Production para desenvolvimento ou experimentação;
- copiar automaticamente secrets de Production para Local ou Preview;
- versionar chaves, prompts com dados privados ou respostas brutas do provedor.
