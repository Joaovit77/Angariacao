# JEV-S2-D — probe real controlado

Experimento independente: P1 binário (uma pergunta), P2 intermediário (três perguntas de 2/3/4 opções), P3 mais complexo (doze perguntas de 2/3/4 opções). Dois envios independentes do mesmo corpo por probe, em ordem P1/R1, P1/R2, P2/R1, P2/R2, P3/R1, P3/R2. Nenhum request histórico V2 é reutilizado. Não existe golden answer nem scorer semântico.

Autorização humana deste checkpoint: no máximo seis chamadas ao `jev-1.14.0`, US$0,05 total, concorrência um, zero retry/regen/resume. O runner real tem entrada explícita exclusiva; não é uma suíte de testes nem é importado por testes. Usa somente a variável local JEV autorizada `Angario_teste`, sem carregar ambiente nem tocar no arquivo.

Antes de executar: 157 regressões e 31 testes novos PASS; freezes históricos e freeze próprio intactos; preço oficial reconfirmado; três requests materializados e hashados antes do transporte. `certification.json` registra a validação executada, sem acionar testes pagos.

Cada stage persiste IN_PROGRESS atomicamente antes do HTTP; tentativa enviada ou com resultado incerto nunca é repetida. O novo lock S2-D é exclusivo para esta autorização. Um run existente tem também execution.lock e não pode ser retomado. Uma interrupção deixa evidência parcial e reserva conservadora de custo; não transforma IN_PROGRESS em autorização de reenvio.

Corpo bruto existe somente em memória: parser original congelado, wrapper S2-C e diagnóstico/projeção allowlisted. O executor compara `parsed` ao parser original, sem mudar aceitação. O wrapper congelado reconhece somente padrões antigos de identidade; IDs novos são anexados pelo plano local ao diagnóstico, fora de `parsed`, sem alterar o wrapper.

O run persiste hashes/estrutura de requests; os corpos sintéticos completos ficam exclusivamente no arquivo de configuração congelado `requests-frozen.json` deste namespace. Não há prompts, contexto, extras desconhecidos nem raw de respostas nos artefatos do run. Extras privados são descartados antes da persistência. IDs desconhecidos viram hashes. Uma inspeção por pergunta permite descrever vetores válidos e inválidos sem corrigir o resultado global.

INVALID_PROBABILITIES com subcódigo seguro, modelo correto, usage conhecido, privacidade e budget íntegros permite continuar, mantendo INVALID_RESPONSE. Qualquer outro erro estrutural, mismatch, usage ausente/inválido, falha operacional, divergência ou falha de persistência/histórico/privacidade encerra em HOLD. Na classificação por pergunta, qualquer falha adicional fora da categoria estudada também impede continuar.

Preço: US$0,042/Mtok de entrada, saída gratuita, contexto padrão 64k/request e 32k/pergunta, sem long-context. Reserva de 65.536 tokens × US$0,042/Mtok = US$0,002752512 por chamada; seis reservas = US$0,016515072, abaixo de US$0,05. Antes de cada HTTP, known estimated cost + worst case next call precisa caber no teto. Usage ausente nunca vira zero; custo desconhecido conserva reserva. Custo estimado não é valor faturado.

Teste offline exclusivo do novo runner:

```powershell
node --test experiments/jev/s2d/runtime.test.mjs
```

Não execute novamente a entrada real após criação do lock. Qualquer próxima campanha exige nova decisão humana, namespace e autorização; não remover lock para reusar esta cota. S2-B permanece HOLD, com causa histórica NÃO DETERMINADA / NÃO RECUPERÁVEL. Nenhuma integração ao Angario, OpenAI, banco, Radar, WhatsApp ou Production faz parte deste checkpoint.
