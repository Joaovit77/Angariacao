# JEV-S0 — experimento isolado

Somente entrada sintética → decisões JEV → arquivos locais. Nenhum import do Angario, SDK novo,
dependência, rota, ferramenta operacional, banco, webhook ou gerador de mensagem final.

## Arquivos e execução

- `cases.mjs`: dez casos e expectativas anteriores à inferência, derivados do contrato IA-Q0.
- `harness.mjs`: perguntas fechadas Choice, parser por allowlist, normalização e comparação.
- `run.mjs`: preparação offline ou lote real explicitamente solicitado, com 20 chamadas no máximo,
  sequenciais, timeout de 30 segundos, sem retries; interrompe na primeira falha operacional.
- `harness.test.mjs`: testes offline do isolamento, parser, sanitização e denominadores.
- `results/`: ignorado pelo Git; cada execução preserva manifesto, baseline, requests sem
  credencial, respostas tipadas sanitizadas, registros, erros, comparação e métricas.

Na raiz do repositório:

```powershell
node --test experiments/jev/harness.test.mjs
node experiments/jev/run.mjs --prepare
```

Uma nova execução real consome API e deve ter autorização específica. O lote S0 já foi realizado;
não é necessário repetir. Para reprodução humana deliberada, a variável recomendada é `JEV_API_KEY`:

```powershell
node experiments/jev/run.mjs --real --env-file experiments/jev/.env.local --key-variable JEV_API_KEY
```

O runner lê exclusivamente a variável indicada, sem carregar o arquivo no ambiente do processo.
A chave deste S0 foi a variável local existente `Angario_teste`, por indicação do usuário; nenhum
arquivo de ambiente foi criado ou alterado pelo experimento. Não passar chave como argumento.
Somente o endpoint oficial fixo recebe o Bearer; redirects são recusados. Erros externos têm apenas
código/status, sem corpo ou headers. Respostas preservadas contêm somente os campos tipados esperados.

## Contrato e interpretação

Entrada independente: mensagem atual, conversa, imóvel selecionado/fatos, protocolos ativos e
candidata. `case_id`, origem, referência Q0 e `expected_product_outcome` ficam no baseline local;
não entram no estado ou nas perguntas do modelo. A decisão não recebe a candidata. A validação
recebe a candidata em uma segunda chamada independente.

A interface JEV não gera texto livre. Intenção, ação, lacuna e suposição proibida usam categorias
fechadas. Fatos, mensagens históricas relevantes e protocolos são selecionados por perguntas binárias.
Razões são dimensões reprovadas/inconclusivas, sem justificativa textual inventada pelo harness.
Fatos retornados vêm do catálogo sintético, sem síntese nova. A ação é somente um rótulo salvo.

`RESPOND` permite resposta integral, parcial útil ou social; `ASK_FOR_CONTEXT` representa lacuna
essencial sem parte comprovada relevante; `BLOCK` representa imóvel inacessível/solicitação insegura.
Isso é um mapeamento experimental, não uma mudança do contrato do produto.

Na validação, cada dimensão recebe PASS, FAIL ou INCONCLUSIVE. PASS inclui ausência de violação
na dimensão, inclusive candidata social. Nenhum limiar de confiança foi aplicado após observar
resultados; usa-se a opção escolhida pelo provider. As perguntas são independentes, portanto uma
aprovação global pode divergir das dimensões e precisa de análise. Confiança não é garantia de acerto.

Métricas mostram numerador, denominador e proporção; denominador vazio é `null`. `decision_accuracy`
mede **somente action**, não correção de todos os campos decisórios. `block_accuracy` mede REJECT
entre candidatas que deveriam ser rejeitadas. False accept/reject são separados da falha operacional.
INCONCLUSIVE continua no denominador de acurácia e tem contagem própria. As quatro acurácias de
dimensão comparam os dez rótulos congelados, incluindo negativos e ausência de violação.

O S0 usa uma repetição por etapa, conforme seu escopo próprio; não implementa Q1 nem seu plano de
repetições. Os rótulos auxiliares por dimensão precisam de revisão independente antes de um lote
maior: não reinterpretar retrospectivamente um resultado para melhorar a taxa. A família longa
contém 100 notas antigas sintéticas, uma saída posterior e mensagem atual em campo separado;
não reproduz LD-156 nem exercita o seletor de contexto do produto.

## Documentação oficial consultada em 16/10/2026

- [Introdução e perguntas tipadas](https://docs.typesafe.ai/introduction).
- [API HTTP e autenticação](https://docs.typesafe.ai/api).
- [Modelos, preços e limites](https://docs.typesafe.ai/models).
- [Choice e probabilidades](https://docs.typesafe.ai/primitives/choice).
- [Políticas e retenção](https://docs.typesafe.ai/legal).

SDKs oficiais existem, mas este harness usa somente Node nativo/fetch. O modelo escolhido foi
fixado em `jev-1.14.0`, confirmado nas vinte respostas; os modelos descritos incluem também
`jev-1.13.0`. A lista autenticada de modelos da conta não foi consultada. O preço publicado é
US$ 0,042 por milhão de tokens de entrada e saída gratuita; custo calculado é estimativa, não fatura.
Limites publicados: 64k tokens por request, 32k por pergunta e corpo de até 32 MiB. Rate limit e
saldo específicos da conta não foram apurados; long context não foi habilitado.

O fornecedor declara não treinar com inputs. A documentação oferece ZDR empresarial; não se presume
esse contrato na conta usada. [Política de privacidade](https://typesafe.ai/legal/privacy-policy)
e [DPA](https://typesafe.ai/legal/data-processing) não estabelecem aqui prazo numérico
de retenção confirmado para esta conta. Por isso o lote envia exclusivamente conteúdo sintético.
