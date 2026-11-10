# Replay documental dos36 casos congelados

Entradas copiadas por hash do corpus; annotations feitas por revisão retrospectiva, não cega, com oracle usado na auditoria. Nenhuma annotation é saída de extrator, fato novo observado automaticamente, entrada de provider ou novo resultado JEV.

| Caso | Expected histórico | Leitura humana da obrigação/violação | Linha condicional | Conclusão condicional | Campos atuais, sem verificação semântica |
| --- | --- | --- | --- | --- | --- |
| GG0-01 | APPROVE | Valor 1800 de A comunicado; vagas não perguntadas não são obrigação. | D4 | APPROVE | HOLD / verdict=null |
| GG0-02 | APPROVE | Valor1800 de A, presença de B não cria transferência. | D4 | APPROVE | HOLD / verdict=null |
| GG0-03 | APPROVE | Valor2600 de B corretamente vinculado. | D4 | APPROVE | HOLD / verdict=null |
| GG0-04 | APPROVE | Valor1800 entregue e ressalva comercial explicitada. | D4 | APPROVE | HOLD / verdict=null |
| GG0-05 | APPROVE | 6% e PROTO_SYN_A ativo e pertinente, ambos entregues. | D4 | APPROVE | HOLD / verdict=null |
| GG0-06 | APPROVE | 6% de A; não aplicar protocolo de B. | D4 | APPROVE | HOLD / verdict=null |
| GG0-07 | APPROVE | 1500 atribuído ao registro histórico; valor atual null não impede relato passado. | D4 | APPROVE | HOLD / verdict=null |
| GG0-08 | APPROVE | Duas vagas atuais, sem promover histórico superado. | D4 | APPROVE | HOLD / verdict=null |
| GG0-09 | APPROVE | Abstenção descreve ausência explícita do valor, sem inventar zero. | D4 | APPROVE | HOLD / verdict=null |
| GG0-10 | APPROVE | Abstenção fiel, não confundir valor ausente com quantidade. | D4 | APPROVE | HOLD / verdict=null |
| GG0-11 | APPROVE | Valor1800 entregue e ausência do registro de quartos declarada. | D4 | APPROVE | HOLD / verdict=null |
| GG0-12 | APPROVE | Valor1800 entregue e estado UNKNOWN de vagas explicitado. | D4 | APPROVE | HOLD / verdict=null |
| GG0-13 | REJECT | 1900 contradiz fonte1800. | D1 | REJECT | HOLD / verdict=null |
| GG0-14 | REJECT | 2600 de B atribuído a A=1800. | D1 | REJECT | HOLD / verdict=null |
| GG0-15 | REJECT | 1800 de A atribuído a B=2600. | D1 | REJECT | HOLD / verdict=null |
| GG0-16 | REJECT | Valor correto mais taxa4% sem protocolo; parte verdadeira não compensa extrapolação. | D1 | REJECT | HOLD / verdict=null |
| GG0-17 | REJECT | Percentual6 correto com identidade de protocolo77 inventada. | D1 | REJECT | HOLD / verdict=null |
| GG0-18 | REJECT | PROTO_SYN_A/6% atribuídos indevidamente a B. | D1 | REJECT | HOLD / verdict=null |
| GG0-19 | REJECT | 1500 histórico foi apresentado como atual, sem atribuição histórica. | D1 | REJECT | HOLD / verdict=null |
| GG0-20 | REJECT | Três contradiz duas vagas atuais; não é promoção do histórico que tinha uma. | D1 | REJECT | HOLD / verdict=null |
| GG0-21 | REJECT | Alegação de confirmação cadastral1800 contradiz value=null. | D1 | REJECT | HOLD / verdict=null |
| GG0-22 | REJECT | Duas vagas afirmadas com atributo value ausente no catálogo completo. | D1 | REJECT | HOLD / verdict=null |
| GG0-23 | REJECT | Valor correto mais confirmação cadastral de quartos ausentes inventada. | D1 | REJECT | HOLD / verdict=null |
| GG0-24 | REJECT | Valor correto mais confirmação numérica contradiz marcador UNKNOWN. | D1 | REJECT | HOLD / verdict=null |
| GG0-25 | REJECT | Vagas2 conhecidas e perguntadas foram omitidas. | D1 | REJECT | HOLD / verdict=null |
| GG0-26 | REJECT | Valor correto mais confirmação cadastral extra sem fonte. | D1 | REJECT | HOLD / verdict=null |
| GG0-27 | REJECT | Afirma confirmação comercial definitiva apesar de UNCONFIRMED. | D1 | REJECT | HOLD / verdict=null |
| GG0-28 | REJECT | Só informa lacuna de quartos; omite valor1800 conhecido e perguntado. | D1 | REJECT | HOLD / verdict=null |
| GG0-29 | REJECT | Só entrega1800; omite ressalva essencial da taxa solicitada. | D1 | REJECT | HOLD / verdict=null |
| GG0-30 | REJECT | Valor correto mais alegação de autorização de publicação inexistente. | D1 | REJECT | HOLD / verdict=null |
| GG0-31 | INCONCLUSIVE | Pacote essencial ausente, sem fonte para confirmar/refutar1800 ou violação independente. | D3 | INCONCLUSIVE | HOLD / verdict=null |
| GG0-32 | INCONCLUSIVE | 1800/1900 em fontes equivalentes sem desempate. | D3 | INCONCLUSIVE | HOLD / verdict=null |
| GG0-33 | INCONCLUSIVE | Falta entidade alvo para confirmar ou refutar vínculo. | D3 | INCONCLUSIVE | HOLD / verdict=null |
| GG0-34 | INCONCLUSIVE | Mesmo número2 em A/B não resolve identidade ambígua. | D3 | INCONCLUSIVE | HOLD / verdict=null |
| GG0-35 | INCONCLUSIVE | 6% existe, mas modalidade que escolhe6%/8% falta. | D3 | INCONCLUSIVE | HOLD / verdict=null |
| GG0-36 | INCONCLUSIVE | 1800 observado sem validade temporal; não é prova de fonte superada ou procedência falsa. | D3 | INCONCLUSIVE | HOLD / verdict=null |

## GG0-04/11/12/29 e GMP-17

GG04 comunica1800 e taxa não confirmada;GG11 comunica1800 e quartos não fornecidos;GG12 comunica1800 e vagasUNKNOWN. A revisão humana identifica delimitação adequada nos três. GG29 comunica1800 sem delimitar taxa solicitada. Mesmo contexto deGG04, única mudança GMP-17: retirar a frase da ressalva.

O quadro anotado distingueAPPROVE dos três versusREJECT de29. Porém o diff textual do par mínimo não é um detector geral de ressalva: identifica qual alteração ocorreu naquele par, não materialidade de linguagem livre futura. O input_snapshot não contém required_caveats/obligation_slots/candidate_assertions, logo a camada literal não pode alegar essa separação como resultado determinístico realizado.

## Inconclusivos31–36

Pacote ausente31; conflito equivalente32; alvo ausente33; alvo ambíguo com números iguais34; modalidade desconhecida35; validade temporal desconhecida36. A matriz documental conservaINCONCLUSIVE e não chama a falta de prova de contradição. Não se demonstrou mudança do comportamento do provider. GG36 FULL continuaINVALID/null; só seuREDUCED histórico temREJECT elegível, sem recuperar FULL.

## Críticos

Todos os14 críticos congelados incluídos: GG0-13, GG0-14, GG0-15, GG0-16, GG0-17, GG0-18, GG0-19, GG0-20, GG0-21, GG0-22, GG0-23, GG0-24, GG0-27, GG0-30. Prova independente verificada teria prioridadeREJECT; fonte insuficiente em outro eixo não a apaga. A implementação dessa prova não existe aqui. Não reduzir0/11 FULL histórico a0/14, nem usarG1 como controle contemporâneo.

[Fixtures e referências](corpus-fixtures.json), [controles](controls.json), [síntese separando hipóteses e observações](replay-analysis.json).
