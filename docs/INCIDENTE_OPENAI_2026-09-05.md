# Incidente de consumo OpenAI em 05/09/2026

## Conclusão

Ficou comprovado que testes automatizados do fluxo **Sugerir com IA** usaram a OpenAI real com a
credencial local. O principal responsável identificado foi o antigo
web/tests/ia-auditor-semantico-real.test.ts: cada execução integral percorria aproximadamente
25 cenários em duas repetições, totalizando aproximadamente 50 casos avaliados.

Os registros locais da sessão de desenvolvimento mostram:

- 14 execuções integrais do auditor: aproximadamente 700 casos executados;
- duas execuções parciais de dois casos: mais quatro casos executados;
- total atribuível ao auditor: aproximadamente 704 execuções de caso.

Cada caso que atravessava as barreiras determinísticas fazia uma chamada real ao modelo. Casos
encerrados antes do executor não consumiam a API; por isso 704 execuções de caso não significam
necessariamente 704 requisições aceitas pelo provedor.

Também houve execuções reais dos antigos testes de comparação e reprodução do atendimento e smoke
tests de /api/ia. Uma execução do fluxo podia produzir várias chamadas internas — decisão,
geração, validação e eventual regeneração — portanto contagem de fluxos não equivale à contagem de
requisições.

## Evidências técnicas

Os comandos registrados usaram padrões equivalentes a:

    node --env-file=.env.local ... vitest ... ia-auditor-semantico-real.test.ts
    process.loadEnvFile(.../.env.local) + execução programática do Vitest

O arquivo carregado continha OPENAI_API_KEY, e o teste construía o SDK real com new OpenAI().
O executor chamava openai.chat.completions.create com maxRetries: 0; não havia uma barreira
central que distinguisse autorização humana de mera presença da chave.

Testes comuns de contrato e robustez usavam executores mockados ou fixtures e não eram a fonte
direta dessas chamadas. A suíte npm test normalmente deixava os ensaios reais como skip, mas os
arquivos permaneciam dentro de tests/**/*.test.ts e podiam ser ativados por variáveis de ambiente
ou execução filtrada. Esse opt-in local não era uma fronteira arquitetural segura.

As contagens acima representam tentativas reconstruídas dos comandos e casos executados. Elas não
devem ser igualadas mecanicamente ao número faturado: falhas antes da aceitação pelo provedor,
agrupamento temporal e outras chamadas do produto podem produzir diferença em relação ao painel.

## Causa raiz

Havia quatro condições simultâneas:

1. testes reais residiam na mesma árvore e convenção de nomes da suíte comum;
2. comandos de diagnóstico carregavam .env.local automaticamente;
3. a presença de OPENAI_API_KEY era tratada como autorização suficiente;
4. o executor não possuía bloqueio central para test, desenvolvimento, CI ou agentes.

## Contenção permanente

A correção arquitetural move os ensaios para web/tests-real-openai/, usa uma configuração Vitest
exclusiva e um comando manual identificado como perigoso. O runner não carrega .env.local, exige
ALLOW_REAL_OPENAI=1, uma chave fornecida deliberadamente e recusa CI/Codex.

Além do isolamento, web/lib/servidor/openai-real.ts bloqueia chamadas em qualquer ambiente não
produtivo sem autorização. CI e Codex são negados mesmo com a variável de opt-in. O executor verifica
a autorização imediatamente antes do transporte, e testes comuns usam somente mocks, fixtures ou
respostas gravadas.
