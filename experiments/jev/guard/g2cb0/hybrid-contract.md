# Contrato proposto A+B+E — somente desenho

**Status: proposta offline, não aceita para implementação.** Sem guard, extrator, executor, prompt ou request futuro. Especificação em [JSON](hybrid-contract.json), distinta de um contrato implementado. Resultado do desenho: INCONCLUSIVO; HOLD para provider/implementação.

## A — obrigação material e ressalva

Obrigação material precisa ser vinculada ao pedido, à entidade, à fonte/estado, à política de evidência e à candidata inteira. GG0-29 pergunta valor e taxa: informar1800 não comunica que a taxa continua não confirmada. GG0-04 delimita a taxa; GG0-11 delimita quartos ausentes; GG0-12 delimita vagas UNKNOWN. A oportunidade de parcial legítima não atesta conformidade de qualquer candidata.

Contrato conceitual de prova de omissão: obrigação identificada e material → fonte/estado correspondente verificado → inspeção completa da candidata → parte/ressalva essencial comprovadamente ausente. Cada premissa requer proveniência, escopo, identidade e tempo. Falta de annotation não prova ausência de ressalva. Não usar regex da frase deGG29, contagem de palavras ou UNCONFIRMED global como violação.

## B — semântica e fluxo de controle separados

REJECT só com violação material independente demonstrada. INCONCLUSIVE com avaliação suficiente para afastar violação independente comprovada, mas evidência essencial não resolvida. APPROVE apenas quando todas as obrigações/afirmações materiais e escopos/permissões da candidata inteira estiverem verificados.

HOLD é estado de avaliação incompleta ou discordância; STOP é integridade/escopo inválidos. Nenhum é quarto verdict semântico ou remapeamento histórico. UNKNOWN de um fato pode sustentar INCONCLUSIVE após revisão; UNKNOWN da capacidade de avaliar impede decidir e produz HOLD.

Uma prova de violação independente válida prevalece sobre incerteza em outro eixo. “Pacote incompleto” não pode apagar protocolo inventado ou confirmação falsa já comprovados. Da mesma forma, catálogo declarado COMPLETE não prova que toda afirmação da candidata é verdadeira.

## E — estados e fronteira semântica

O contexto permite copiar e tipar estados literais de catálogo, entidade, fatos, protocolos, acessibilidade e permissões. Não permite conhecer, só por campos estruturados, quais partes foram pedidas e como cada frase da candidata as atende. A/B dependem dessa representação para avaliar omissão/contradição com segurança.

A futura representação verificada teria, conceitualmente: referências de fonte autorizada, IDs de obrigação/afirmação, vínculo entidade/tempo/assunto, estado TRUE/FALSE/UNKNOWN, cobertura de inspeção, método de verificação e prova de integridade. **Nenhum desses certificados novos existe nos inputs históricos; não foram fabricados como fatos observados.** Uma candidata não pode atestar a própria conformidade. Oracle e confidence não são verificadores.

## Relação possível com REDUCED

Somente uma arquitetura futura poderia consumir estados validados e aplicar a matriz antes de uma eventual avaliação REDUCED. Não é definido payload, mensagem de instrução, modelo novo ou prompt neste gate. Se uma violação já é comprovada, JEV não é necessário para autorizá-la/negá-la. APPROVE do provider não anula REJECT estruturado. REJECT do provider não prova sozinho violação material; conflito fica em HOLD/revisão, sem reparar outputs históricos.

APPROVE documental nunca autoriza mensagem, escrita, taxa, publicação ou ferramenta. Guards independentes de evidência, identidade, permissões e confirmação humana permanecem externos. Nenhuma das11 dimensões é exigida por este desenho conceitual; sua necessidade para decisão continua não demonstrada, sem relaxar contrato FULL histórico.

## Fronteira de confiança e oracle

[Fixtures](corpus-fixtures.json) separam input_snapshot, estados literais, revisão humana retrospectiva e evaluation_only. Somente input_snapshot corresponde à entrada fonte. Annotations não são saída de extrator, não são cegas ao oracle e não estão autorizadas para envio a provider. A reprodução documental dos rótulos não demonstra ganho de qualidade.

O escopo termina nos artefatos e testes de consistência documental. Não há implementação de guard em qualquer namespace.
