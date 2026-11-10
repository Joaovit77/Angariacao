# Oportunidades determinísticas — somente desenho

| Oportunidade | Evidência | Pré-condição | Falso bloqueio a evitar |
| --- | --- | --- | --- |
| Obrigação de ressalva essencial ausente | GMP-17 / GG0-29 | Extrair obrigação da pergunta e estado comercial não confirmado; representação de resposta e ressalva semanticamente equivalente. | Não bloquear04/11/12; não exigir frase literal, nem ressalva de assunto não perguntado. |
| Encargo comercial não confirmado | GG0-04/16/29 | Separar percentual inventado, ausência delimitada e omissão material. | Não tratar UNCONFIRMED global como bloqueio de toda mensagem com valor conhecido. |
| Fato de autoridade desconhecida ou conflitante | GG0-31/32/35/36 | Triestado: comprovado, refutado e não verificável; carregar catálogo/identidade/tempo/aplicabilidade. | Não converter não verificável em REJECT ou zero. |
| Declaração definitiva sem apoio / falsa procedência | GG0-21–24 versus31/36 | Verificar se há violação explícita de fonte/estado ou só falta de evidência. | Não usar “é”/“atual” isoladamente como regex de REJECT universal. |
| Entidade e permissões independentes | Negativos críticos e33/34 | Identidade confiável, escopo por usuário e permissões continuariam guardrails do produto. | Não inferir identidade pela quantidade nem substituir RLS/confirmacão humana. |

É razoável avaliar código para invariantes estruturadas e obrigações verificáveis. A linguagem livre da candidata pode impedir prova determinística confiável; nesses casos não prometer solução por regra simples. Guard pré/pós-JEV só faria sentido com estados explícitos e avaliação de falsos bloqueios. Nenhum guard, extrator, regra, endpoint, flag ou integração foi implementado.
