# Fase 5D — Frescor e histórico dos comparáveis na Avaliação

## Apresentação factual

A Avaliação mostra, como metadata secundária dos comparáveis externos, somente fatos derivados pela
camada histórica da Fase 5C:

- última observação positiva em dias e data civil;
- primeira observação positiva conhecida;
- quantidade mínima comprovável de observações;
- reobservação quando existem ao menos duas observações comprovadas;
- última mudança de preço comprovada e quantidade de mudanças persistidas.

O texto relativo não usa faixas como “recente” ou “antigo”. A quantidade é apresentada como mínimo
conhecido porque o legado e a confirmação diária não permitem contar todas as aparições. Comparáveis
sem fatos históricos exibem apenas “Histórico limitado”, sem reaproveitar `created_at` ou inventar
uma data.

Os detalhes ficam recolhidos por padrão em um elemento nativo `details`, acessível por teclado. No
desktop ele abre como painel compacto; no mobile participa do fluxo do card para não escapar da
tela. O texto explica que ausência em coletas posteriores não prova indisponibilidade.

## Fronteira de dados

`comparaveis_mercado` fornece `primeiro_visto_em` e `ultimo_visto_em`. A relação existente com
`observacoes_comparaveis_mercado` fornece os eventos positivos visíveis sob a sessão e a RLS. A
leitura estruturada e a busca híbrida anexam os mesmos fatos ao contrato opcional do comparável.
Avaliações antigas continuam compatíveis porque o campo é opcional.

Status e reaparecimento não são apresentados enquanto o schema atual não comprovar explicitamente a
procedência das duas pontas. Comparáveis da carteira interna mantêm a referência já existente, pois
não pertencem ao histórico de anúncios externos.

## Invariantes

- frescor não entra no cálculo, peso, ranking, filtros ou seleção;
- nenhum comparável é removido ou desvalorizado por idade;
- ausência de observação não é disponibilidade nem indisponibilidade;
- mudança de preço exige evidência positiva persistida;
- uma observação isolada não vira tendência;
- nenhuma migration ou estrutura de cobertura por execução/portal foi criada.

Medir ausência em coletas completas continua dependendo de uma eventual Fase 5C.1 e permanece fora
do escopo desta entrega.
