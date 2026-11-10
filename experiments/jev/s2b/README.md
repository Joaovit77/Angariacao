# Executor isolado JEV-S2-B

Autorização humana desta campanha: até 180 chamadas, somente jev-1.14.0, teto total US$ 0,50.
Somente estágios congelados; sem retries, warm-up, regeneração ou adaptação. Não integra o produto.

`runner.mjs` confere freezes, extrai somente Angario_teste do arquivo local indicado pelo usuário,
cria diretório exclusivo e lock de autorização com criação exclusiva. O lock persiste após parada
ou conclusão; não removê-lo para retomar. Nova execução exige nova decisão humana.

`core.mjs` acrescenta persistência atômica (temporário exclusivo, sync, rename, releitura/hash),
budget em nano-USD, preparação dos 180 estados, guardas de contexto e scoring incremental usando
adapter/scorer congelados. IN_PROGRESS e contador reservado são persistidos antes do HTTP.
Tentativa pendente em crash é considerada consumida de forma conservadora, sem devolução de cota.

Preço verificado e limites estão em `pricing-verified.json`. Cada chamada reserva o custo de
65.536 tokens de entrada, arredondamento conservador acima dos 64k documentados. Entrada custa
42 nano-USD/token; saída é gratuita. Pior caso de 180 chamadas: US$ 0,49545216. Ausência de usage
interrompe; custo conhecido não vira fatura, e custo desconhecido não é tratado como zero.

Sem tokenizer oficial local, o filtro de contexto usa bytes UTF-8 + reserva de 2.048 contra 64k
por request e 32k por pergunta. Não é contagem exata: caso que não passe esse filtro fica HOLD por
incerteza, sem truncar ou enviar. Corpo de 32 MiB, modelo e hash também são verificados.

O envio usa fetch nativo, endpoint oficial fixo, redirects bloqueados, timeout 30 segundos,
concorrência um e pausa de um segundo. HTTP não 2xx para sem ler seu corpo. Texto de sucesso passa
diretamente ao parser estrito, e só hash bruto/metadata/saída sanitizada são persistidos.

Ledger é a referência durável; stage-results preserva cada resposta antes do snapshot seguinte.
Manifesto, orçamento, métricas parciais, pares, mutantes, consistência e erros são derivados locais.
Falha operacional/estrutural, modelo divergente, usage ausente, orçamento/contexto inseguro,
persistência falha ou hard gate semântico encerra. Nenhum caminho chama o provider novamente.

Pares exigem ambos os endpoints completos e corretos nos dez campos decisórios, verdict e onze
dimensões. Resultado agregado do par só é pass/fail com três comparações disponíveis; restante
fica inconclusivo. Mutantes reutilizam esses pares, sem chamadas duplicadas. Consistência separa
3/3 iguais, 2/3 iguais e três diferentes, sem alterar scores por majority vote.

Testes nativos offline estão em `runtime.test.mjs`. Eles usam pastas exclusivas prefixadas
`s2b-offline-` dentro de results, com transporte falso e sem credencial. Arquivos locais ficam
ignorados pelo Git. Directory fsync pode ser indisponível no Windows; sync do arquivo, rename e
releitura são exigidos. Não se promete sobrevivência a falha física do dispositivo.
