# Fundação resumível passiva do Radar — fronteira pré-H

Este documento descreve a camada de fundação isolada, que não ativa emissores. A capacidade HTTP de negociação está separada no [contrato de retorno leve](RADAR-RETORNO-LEVE.md).

## Fronteira

O caminho sem opt-in do endpoint, o navegador, monitor, cron, paginação, leitor de coverage e parser preservam a implementação publicada de referência. A fundação acrescenta somente os módulos de aplicação do motor resumível, sem um caller ativo. Os contratos E–G são pré-requisitos de banco já instalados no alvo autorizado.

`lerEvidenciaPaginaRadar` conserva sua semântica publicada. `lerEvidenciaPaginaResumivelRadar`, no adapter, compõe o resultado desse leitor com os literais Flight: só aceita destino publicado, preserva href e rejeita conflitos. O leitor de hidratação nunca é importado pelo caminho legado. A classificação individual continua usando a função compartilhada publicada; IDs/classes não dependem de Flight.

O motor permanece único. O tipo de progresso vive em `calculo/progressoResumivelRadar.ts`, sem alterar o modelo ou os emissores públicos. Os receipts de janela são tipos do resultado resumível; não precisam modificar o resultado da ingestão legada ou a observabilidade publicada.

## Alterações compartilhadas mínimas

- `ingestaoRadar.ts`: somente exporta `anuncioParaBasePrivada`, cujo corpo não muda.
- `fallbackHttpChaves.ts`: a política de observação fresca existente no candidato pré-H evita caches apenas quando o motor passa `exigirNova`.
- `firecrawlCentralAngariacao.ts`: a mesma política separa single-flight fresco e evita leitura de cache. Chamadas publicadas sem essa opção conservam o caminho anterior.

Não há feature flag, nova rota ou mecanismo de ativação. Nenhum emissor passa a chamar o motor por consequência dessa fundação.

## Banco

O ledger remoto é a autoridade: o alvo autorizado já possui E–H. Este candidato de aplicação não transporta nem reaplica essas migrations, não remove nenhuma e não altera `supabase-schema.sql` ou o diretório de migrations da base publicada. Esses arquivos da base não devem ser usados para inferir o ledger atual ou executar `db push`.

Sem adesão, o motor conserva a RPC histórica de nove argumentos. O receptor com opt-in pode solicitar o overload compatível já instalado, conforme o contrato de retorno leve, sem alterar a fundação ou aplicar migrations.

## Validação reproduzível, sem rede

Os testes da fundação, fixtures, SQL de ensaio e loaders pertencem a um pacote de validação separado, congelado por hash no Gate M. Não compõem o delta da aplicação. O manifesto de validação vincula o pacote aos nove hashes de runtime deste candidato.

A comparação A/B carrega módulos independentes do commit publicado pelo Git. As nove fixtures cobrem normal, href, sem next, Flight, ausência de Flight, conflito, hidratação parcial, vazio e terminal. Compara leitura, classes, sequência e coverage. Os testes do fluxo comparam aquisição, parser, fallback, cache, receipts, erros e montagem da persistência simulada. Somente IDs de aquisição gerados e duração são normalizados; dono, busca e payload funcional permanecem literais.

Os ensaios SQL/PGlite separados verificam o motor, contratos E–G, replay, isolamento e a compatibilidade da RPC legada. Todo SQL de ensaio é local e descartável; não é uma migration pendente da aplicação. O pacote usa fixtures já validadas e importa o código executável do candidato, com verificação prévia de igualdade dos hashes.

O relatório do Gate M contém os comandos, configurações, inventários e SHA256 do pacote para reprodução. Nenhum comando pressupõe `.env.local` ou credenciais reais. O teste comparativo exige o commit de referência disponível no Git local. A configuração padrão do aplicativo e dos testes permanece publicada.

## Limites

A equivalência observável foi exercitada nos cenários determinísticos selecionados, não em todo payload possível. Baseline e marcos do A/B são simulados; o SQL/PGlite é validação local distinta. Production funcional, navegador real, cron real e portais não são exercitados neste gate. Ativação por emissores automáticos e publicação exigem gates próprios.
