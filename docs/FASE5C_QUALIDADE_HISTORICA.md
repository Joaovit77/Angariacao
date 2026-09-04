# Fase 5C — Qualidade histórica de comparáveis

## Fronteira factual

O catálogo corrente (`comparaveis_mercado`) e seus eventos
(`observacoes_comparaveis_mercado`) registram anúncios que foram efetivamente observados. Uma
ausência em amostra, falha de portal, timeout ou coleta não executada não cria evento e não altera
status. Em particular, silêncio não prova anúncio removido, imóvel alugado, vendido ou inativo.

`primeiro_visto_em` e `ultimo_visto_em` são os extremos conhecidos de observações positivas. Não
afirmam disponibilidade antes ou depois desses instantes. Alteração de preço requer dois valores
positivos comprovados, por eventos consecutivos ou pelo snapshot transacional do trigger. Alteração
de status só é factual quando a origem explícita das duas pontas também é comprovada; o nome legado
do evento, sozinho, não basta.

## Limites da base atual

A tabela de observações foi introduzida depois de parte do catálogo. Além disso, o trigger guarda
criação, mudanças e no máximo uma confirmação diária; ele não conta todas as aparições no mesmo dia.
Assim, o domínio informa separadamente:

- quantidade de eventos persistidos;
- quantidade mínima de observações comprováveis pelos instantes conhecidos;
- se o início persistido coincide com a primeira observação conhecida;
- indicadores objetivos de identidade, geografia, preço, datas e reobservação.

Não existe uma quantidade total exata de aparições para o legado. Uma única observação não cria
narrativa de tendência.

### Retrato agregado de Production em 04/09/2026

Uma consulta estritamente read-only encontrou:

- 2.816 comparáveis e 1.076 eventos históricos;
- 1.979 comparáveis sem evento, 770 com um evento e 67 com dois ou mais (máximo de 10);
- 683 eventos `novo`, 376 `reobservado` e 17 `preco_alterado`;
- 17 mudanças de preço com valor anterior no snapshot transacional, das quais 8 também têm duas
  linhas históricas consecutivas disponíveis;
- nenhuma mudança de status e nenhum reaparecimento registrados;
- todos os comparáveis e eventos com status corrente `ativo`;
- nenhum comparável com UF, cidade-chave, preço, primeira ou última observação nulos; todos os
  registros atuais pertencem a Londrina/PR;
- quatro portais no catálogo: Chaves na Mão (1.856), Wimoveis (720), OLX (172) e VivaReal (68).

Há 154 históricos cujo primeiro evento persistido é posterior a `primeiro_visto_em`, além de 1.930
comparáveis sem evento que possuem extremos temporais distintos. Também há 122 casos em que o
último evento não coincide com `ultimo_visto_em`, coerente com confirmações no mesmo dia que o
trigger deliberadamente não duplica. Essas lacunas impedem tratar a contagem de eventos como total
de observações, mas não invalidam os extremos temporais nem os snapshots transacionais existentes.

## Cobertura de coletas

A Fase 5B conserva diagnósticos de execução somente nos logs e, no mercado, o resultado agregado da
última tentativa. Não há histórico persistido por execução e portal que prove sucesso, paginação ou
cobertura completa. Portanto, a estrutura atual não responde com segurança perguntas como “o
anúncio ficou ausente em três coletas completas consecutivas”. `ultimo_visto_em` não pode ser usado
como substituto dessa evidência.

Se esse tipo de pergunta se tornar requisito, uma Fase 5C.1 deverá decidir explicitamente um modelo
mínimo de execuções e cobertura por portal. Nenhuma tabela ou migration foi criada na Fase 5C.

## Base preparada para a Fase 5D

Sem implementar UI de frescor, já podem ser consumidos com segurança:

- primeira e última observação positiva conhecidas;
- reobservação comprovada;
- quantidade de eventos persistidos e mínimo comprovável de observações;
- mudanças observadas de preço;
- mudanças de status e reaparecimentos somente com evidência explícita;
- indicadores factuais de identidade, localização, preço, datas e completude do início histórico.
