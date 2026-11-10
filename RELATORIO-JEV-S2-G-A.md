# JEV-S2-G-A — mapa de capacidades para o Angario

**PASS JEV-S2-G-A, exclusivamente offline.** 54 capacidades, 16 módulos A–P e 54 registros de evidência. Zero JEV, OpenAI, rede, leitura de credenciais, créditos ou integração. Angario/web, dados, schema/RLS e prompts inalterados.

DECISION histórico: **NAO_PROMISSOR_DIAGNOSTICO**. VALIDATION histórico: **INCONCLUSIVO**. Categorias de uso abaixo são nova análise de subcapacidades; não reclassificam o resultado do S2-F-B, seu oráculo, score, PASS/HOLD ou métricas. Nenhuma capacidade está certificada para produção ou recebe autonomia irrestrita.

## O que mudou e como ler

Antes havia contratos, diagnósticos e resultados de experimentos isolados, com ação/verdict frequentemente corretos e falhas materiais nos metadados finos. Este checkpoint organiza essa evidência em um mapa de uso futuro, sem alterar execução ou comportamento do Angario. Novos artefatos ficam somente em [experiments/jev/s2g](experiments/jev/s2g/README.md), além deste relatório e do append da propagação. PROJECT.md permanece canônico e intacto: nenhuma arquitetura permanente foi adotada.

A [matriz completa com as doze colunas solicitadas](experiments/jev/s2g/capability-map.md) registra capability_id, capacidade, módulo, evidências positivas/negativas, amostra, categoria, guarda, efeitos permitidos/proibidos, confiança qualitativa da recomendação e próximo experimento. O [JSON](experiments/jev/s2g/capability-map.json) traz motivos e amostras de cada referência; o [evidence ledger](experiments/jev/s2g/evidence-ledger.json) fornece caminho, hash e pointer. Confidence HIGH/MEDIUM/LOW é da análise, nunca confidence do JEV.

## Base de evidência preservada

Somente S0/S1/S2-A/B/C/D/E/F-A/F-B foram usados para julgar capacidade JEV. Maior peso ao F-B, mais recente e direcionado. Documentação/código local foram lidos apenas para localizar módulos e invariantes, sem acesso ao serviço, carteira ou dados reais e sem usar implementação existente como prova de capacidade do JEV. Não se usou marketing nem preço atual do provider.

| Checkpoint | Tipo e limite de evidência |
| --- | --- |
| S0 | 20 chamadas sintéticas; action 10/10, verdict 9/10, false accept 0/5 e false reject 1/5. Não reavaliado com oráculo posterior. |
| S1 | Desenho offline de 30 entradas, 22 pares, 11 mutantes e 180 stages; não é execução completa. |
| S2-A | Adapter/parser certificado offline: 46 testes novos, total então 65; não prova semântica real. |
| S2-B | HOLD: 4 iniciadas, 3 normalizadas, 1 INVALID_PROBABILITIES, 176 NOT_STARTED. Causa específica NÃO DETERMINADA / NÃO RECUPERÁVEL. |
| S2-C | Diagnóstico offline sanitizado preserva parsed do parser; 85 testes novos, total então 157. Não recupera raw S2-B. |
| S2-D | 6/6 probes válidos, sem oráculo semântico. |
| S2-E | 12 chamadas: 10 válidas e 2 invalid (SUM/CHOICE); D action 6/6 e completude 0/6; V verdict 4/4 negativas válidas, sem positivas. |
| S2-F-A | Desenho offline aprovado de nove casos, cinco pares, histórico obrigatório e controles positivos; nenhuma chamada. |
| S2-F-B | 24/24 válidas; 10 DECISION e 14 VALIDATION, modelo jev-1.14.0; diagnóstico mais forte para este mapa. |

Nenhum denominador de run foi somado. Repetições idênticas não são casos independentes; corpus sintético pequeno não mede generalização para tráfego real. Confiabilidade estrutural mantém a ressalva: B teve 1 invalid, D 6/6 válidas, E 2 invalid e F-B 24/24 válidas. O problema não foi declarado resolvido. Parser estrito e descarte de inválido continuam obrigatórios.

## Fatos congelados do S2-F-B

Run jev-s2f-diagnostic-1792258267412-99056db2: 24 chamadas concluídas, jev-1.14.0 em 24/24. Estrutura 24 válidas, zero inválidas, SUM_MISMATCH, CHOICE_MISMATCH, structural unknown ou operational error. [Snapshot completo](experiments/jev/s2g/s2fb-facts.json).

| DECISION | Acertos / válidas |
| --- | --- |
| action | 10/10 |
| intent | 10/10 |
| enough_context | 10/10 |
| relevant_current_facts | 8/10 |
| relevant_historical_facts | 10/10 |
| missing_information | 6/10 |
| applicable_protocols | 10/10 |
| prohibited_assumptions | 4/10 |
| entity_resolution | 10/10 |
| temporal_resolution | 4/10 |
| completude | 2/10 |
| micro | 82/100 |
| required_history_recall | 4/4 IDs obrigatórios |

| VALIDATION | Acertos / válidas |
| --- | --- |
| verdict | 14/14 |
| grounding | 14/14 |
| factuality | 14/14 |
| protocol | 8/14 |
| temporal | 8/14 |
| entity | 14/14 |
| coverage | 14/14 |
| omission | 14/14 |
| unsupported_assumption | 14/14 |
| cross_entity | 2/14 |
| safety | 14/14 |
| partial_answer_allowed | 14/14 |

Negativas cobertas 8/8; positivas 6/6; false accept 0/8; false reject 0/6. Três positivas repetidas e quatro negativas repetidas, não quatorze candidatas independentes. Pares integralmente corretos 0/10. R1/R2: 12/12 SEMANTIC_MATCH_WITH_CONFIDENCE_VARIATION. Eventos críticos: 20. Nenhum desses fatos foi perdoado por nova interpretação.

## Pontos fortes e limites

Ação macro, intenção e alvo textual explícito tiveram bons resultados no recorte. Recuperou 4/4 IDs históricos requeridos; seleção histórica 10/10. Verdict rejeitou as oito negativas e aprovou as seis positivas, incluindo parcial P2. Grounding, factuality, unsupported_assumption, coverage, omission e partial_answer_allowed acertaram 14/14 cada. Isso justifica propor experimentos isolados ou sinais com guarda, não uso autônomo.

Limites dos 100%: dez D recentes esperavam RESPOND, FACTUAL e enough_context true; faltam contrastes suficientes para fronteira de bloqueio/suficiência. Entidades eram explícitas em catálogo. Todos os protocolos do F-B estavam vazios: 10/10 seleções vazias não mede escolha entre protocolos ativos conflitantes. Safety 14/14 ocorreu sem ferramenta externa ou ataque de permissão; não certifica segurança operacional. Quatro exposições históricas obrigatórias não medem histórico longo ruidoso. S0 ainda contém falsa rejeição 1/5, mesmo com 0/6 no F-B.

Confidence alta numericamente não garante campo correto: INVENT_COMMERCIAL NO com 0,94/0,96 e temporal FAIL com 0,93 reincidiram. Quartis descritivos não autorizam efeito; consistência R1/R2 também pode repetir erro.

## H1, temporal, entidade e riscos proibidos

H1 é **OPERATIONAL_MATERIAL_ERROR** para qualquer fluxo que dependa de fonte atual: selecionou f-t-atual-A com valor null nos dois R e acrescentou CURRENT_FACT indevido. Recuperou corretamente histórico obrigatório, UNKNOWN_CURRENT_STATE e HISTORICAL_SUPPORT_REQUIRED; esses acertos não anulam o defeito. Não reduzir H1 a taxonomia, nem afirmar que houve texto livre gerado usando passado como presente: o observado é seleção/classificação tipada errada. Verdade temporal e fonte atual devem vir de código, separadas da ação macro.

Entity resolution D 10/10 e entity V 14/14 sustentam ensaio de alvo textual sob catálogo e ownership determinísticos. Entretanto E1 B→A e E3 A→B receberam cross_entity PASS indevido, apesar de entity FAIL correto. Há contradição dimensional material: não promover detector crítico de transferência com 2/14. Isto é distinto de NOT_APPLICABLE versus PASS onde não ocorreu transferência.

Prohibited assumptions 4/10 não é detector autônomo aceitável. Os quatro conjuntos corretos foram H1 e o controle sem risco E4, cada um nos dois R. Omitiu HISTORICAL_AS_CURRENT em T1/T2 compartilhada, CROSS_ENTITY em E1/E2 compartilhada e INVENT_COMMERCIAL em P1/P2 compartilhada. Regras explícitas do Angario devem determinar proteção; ausência de alerta do modelo não libera taxa/fonte.

Temporal V 8/14 mistura FAIL indevido para valores atuais em E1/E3/P1; temporal D 4/10 inclui omissões/rótulos extras. Algumas divergências são taxonomia de metadado, mas H1 afeta a fonte principal e permanece bloqueador. Completude 2/10 e pares 0/10 impedem mascarar defeitos com action/verdict corretos.

## Revisão de taxonomia e impacto

Nova análise individual dos 44 erros de pergunta preservados: [revisão](experiments/jev/s2g/taxonomy-review.md) e [referências exatas](experiments/jev/s2g/taxonomy-review.json).

| Categoria nova | Itens F-B |
| --- | --- |
| OPERATIONAL_MATERIAL_ERROR | 8 |
| SEMANTIC_FIELD_ERROR | 14 |
| TAXONOMY_COMPATIBILITY_ISSUE | 12 |
| APPLICABILITY_DISAGREEMENT | 10 |
| LOW_IMPACT_LABEL_DIFFERENCE | 0 |
| UNCERTAIN | 0 |

Os oito itens materiais são current_0/CURRENT_FACT de H1 nos dois R e cross_entity PASS nas transferências E1/E3 nos dois R. Erro operacionalmente material aqui descreve risco de eventual uso, não falha HTTP: F-B continua com zero operational error. Erros de campo incluem riscos omitidos e lacuna extra AUTHORIZED_PROPERTY_CONTEXT; podem eliminar proteção ou bloquear parcial. Taxonomia inclui contaminação temporal/protocolo sem trocar a fonte principal daquele item. Aplicabilidade cobre N/A versus PASS sem transferência e P2 protocol PASS versus N/A. Não se forçou LOW_IMPACT_LABEL_DIFFERENCE para suavizar erro. S2-B fica UNCERTAIN na nota histórica por falta irrecuperável do raw; não recebe causa nova.

## Classes de capacidade

Categorias foram definidas antes de classificar módulos e capacidades. A: suficiente para propor futuro experimento isolado sob flag/shadow, sem autonomia crítica. B: sinal só contribui após confirmação/limitação independente por código. C: sinal assistivo, sem efeito operacional. D: não promover a função observada. E: não avaliada, sem inferir qualidade por analogia.

| Categoria | Quantidade |
| --- | --- |
| APTA_PARA_EXPERIMENTO_DE_PRODUTO | 10 |
| APTA_COM_GUARDA_DE_CODIGO | 6 |
| SOMENTE_ASSISTIVA | 9 |
| NAO_PROMOVER | 6 |
| NAO_AVALIADA | 23 |

### APTA_PARA_EXPERIMENTO_DE_PRODUTO

- CAP-ACTION: Ação macro RESPOND / pedir contexto / bloquear.
- CAP-INTENT: Intenção macro factual/social/outra.
- CAP-V-GROUNDING: Vinculação textual às fontes.
- CAP-V-FACTUALITY: Factualidade da candidata.
- CAP-V-UNSUPPORTED: Detecção de afirmação sem suporte na candidata.
- CAP-V-COVERAGE: Cobertura da parte conhecida.
- CAP-V-OMISSION: Omissão relevante na candidata.
- CAP-V-PARTIAL: Permissibilidade de resposta parcial.
- CAP-POSITIVE: Aprovação de controles positivos.
- CAP-NEGATIVE: Rejeição de candidatas negativas.

### APTA_COM_GUARDA_DE_CODIGO

- CAP-ENTITY: Entidade textual em catálogo explícito.
- CAP-CURRENT: Seleção de fontes atuais autorizadas.
- CAP-HISTORY: Recuperação de histórico obrigatório.
- CAP-MISSING: Sinalização de informação faltante.
- CAP-GUARD: Verdict macro de resposta candidata.
- CAP-STRUCTURE: Consumo de saída estruturada.

### SOMENTE_ASSISTIVA

- CAP-ENOUGH: Suficiência de contexto para resposta parcial.
- CAP-PROTOCOL-EMPTY: Abstenção de protocolo em catálogo vazio.
- CAP-RISK-HINT: Sinal auxiliar de risco com regras explícitas.
- CAP-TEMP-LABEL: Metadados temporais como comentário assistivo.
- CAP-V-PROTOCOL: Rótulo protocol na validação.
- CAP-V-SAFETY: Dimensão safety como sinal geral.
- CAP-REASONS: Explicação por razões dimensionais.
- CAP-CONFIDENCE: Confidence nativa para observação.
- CAP-INCONSISTENCY: Alerta de inconsistência factual em contexto textual autorizado.

### NAO_PROMOVER

- CAP-D-FULL: Contrato DECISION completo.
- CAP-V-FULL: Contrato VALIDATION dimensional completo.
- CAP-PROHIBITED: Detector principal de suposições proibidas.
- CAP-TEMP-TRUTH: Verdade temporal/fonte atual autônoma.
- CAP-V-CROSS: Detector crítico de transferência A/B na validação.
- CAP-V-TEMP: Detector temporal crítico na validação.

### NAO_AVALIADA

- CAP-PROTOCOL-COMPLEX: Seleção entre protocolos ativos conflitantes/versionados.
- CAP-WRITE: Redigir mensagem.
- CAP-CRM-EFFECT: Escolher e executar efeito no CRM.
- CAP-FOLLOW-MACRO: Classificar respondeu/recusou/falar depois/precisa follow-up.
- CAP-FOLLOW-EFFECT: Definir motivo, encerrar, agendar ou mudar status.
- CAP-PIPELINE: Recomendar próxima ação do Pipeline.
- CAP-RADAR-RELEVANCE: Anúncio relevante.
- CAP-RADAR-TYPE: Classificar casa/apartamento no Radar.
- CAP-RADAR-PURPOSE: Finalidade de anúncio.
- CAP-RADAR-DUPLICATE: Anúncio novo/possivelmente repetido.
- CAP-RADAR-SAME: Provável mesmo imóvel no Radar.
- CAP-RADAR-OPPORTUNITY: Oportunidade de captação.
- CAP-RADAR-REVIEW: Identificar anúncio que precisa investigação humana.
- CAP-INVESTIGATOR: Relevância de candidato do Investigador.
- CAP-MATCH-TEXT: Textual matching entre anúncios.
- CAP-MATCH-ENTITY: Entity matching entre registros/anúncios.
- CAP-MATCH-VISUAL: Visual matching de imóveis.
- CAP-APPRAISAL-COMPS: Selecionar/rejeitar comparáveis e classificar similaridade.
- CAP-APPRAISAL-OUTLIER: Detectar outlier na avaliação.
- CAP-PRICE-FINAL: Calcular preço final pelo julgamento do JEV.
- CAP-ADS-QUALITY: Qualidade cadastral/extrair dados de anúncio.
- CAP-OPS-PRIORITY: Ranking/priorização da carteira.
- CAP-VISION: JEV-VISION / fachada.

CAP-V-FULL em NAO_PROMOVER é recomendação de não promover o contrato dimensional integral; o resultado histórico VALIDATION permanece INCONCLUSIVO. Subcapacidades fortes não mudam DECISION histórico nem dão licença de integração.

## Módulos reais e usos condicionais

| Módulo | Encaixe e limite |
| --- | --- |
| A — Atendimento ao proprietário | Rascunho editável, contexto autorizado, protocolo comercial e revisão antes do envio. Separar intenção, ação macro, entidade, contexto, lacunas, protocolo, efeito CRM e redação. |
| B — IA Guard / validação de respostas | Possível comparação de verdict de candidata, sem substituir validações ou liberar mensagem. |
| C — Seleção de contexto | Código continua dono do catálogo autorizado e das fontes obrigatórias; seleção não elimina a evidência que protege a resposta. |
| D — Entity resolution | Resolver catálogo explícito é diferente de descobrir identidade entre anúncios, titularidade e tenant. |
| E — Temporal / histórico | Atual, histórico, superado e ausente continuam separados; null não vira fato atual. |
| F — Follow-up | Categorias respondeu/não respondeu/falar depois/recusou/precisa acompanhamento não foram medidas. Efeito em status, motivo ou agenda exige política existente e gate próprio. |
| G — Pipeline / próxima ação | Próxima ação sugerida não é transição persistente; preservar statusHistory, critérios e confirmação. |
| H — Radar — relevância | Relevância, tipo, finalidade e oportunidade no Radar são domínios não testados pelo S2. |
| I — Radar — novo/duplicado | URL/ID, visto/novo e dedupe continuam no código; possível mesmo imóvel não autoriza merge. |
| J — Investigador de Imóveis | Correspondência, pontuação e evidência suficiente existentes não são certificação do JEV para investigação. |
| K — Match entre anúncios | Match textual, identidade entre registros e match visual precisam de benchmarks separados. |
| L — Avaliação de imóveis | Selecionar/rejeitar comparáveis, similaridade e outlier são hipóteses. Preço final continua no motor determinístico/estatístico. |
| M — Anúncios / qualidade cadastral | Sugerir revisão de campos é diferente de extrair, validar e gravar dados de anúncio. |
| N — Vision / fachada | JEV-VISION não avaliado. Referência apenas documental; protótipo local pausado não foi aberto, alterado nem incorporado e não é evidência JEV. |
| O — Priorização operacional | Ranking de carteira, foco ou oportunidade precisa de utilidade própria medida, sem substituir regras de elegibilidade. |
| P — Detecção de inconsistências | Sinal textual de inconsistência pode pedir revisão; não corrige automaticamente fonte, preço, identidade ou cadastro. |

O [mapa de módulos](experiments/jev/s2g/angario-module-map.md) liga cada hipótese a caminhos existentes, sem mexer neles. Atendimento separa classificar intenção, RESPOND/não responder, entidade, contexto, lacuna, protocolo, efeito CRM e redação. JEV não precisa escrever texto para ser útil; escrita livre não foi avaliada.

IA Guard: proposta GPT redige → JEV fornece verdict macro → código valida independentemente fontes/tempo/protocolos → revisão/aceitação. Não usar o verdict como proxy de reasoning dimensional ou autorização de envio. Nenhuma integração foi decidida.

Follow-up: respondeu/não respondeu/falar depois/recusou/precisa acompanhamento são macroclasses ainda não avaliadas. Motivo, encerramento, mudança de status e agendamento são contratos de efeito distintos. As políticas atuais do Assistente continuam vigentes; o JEV não ganha acesso a elas por este mapa.

Radar: relevância, casa/apartamento, finalidade, novo/duplicado, provável mesmo imóvel, oportunidade e investigação humana foram mapeados conceitualmente e classificados NAO_AVALIADA. Possíveis badges/ranking/alertas dependem de benchmark próprio; novidade por portal/ID e histórico de coleta continuam determinísticos. Nenhum Radar real foi acessado.

Match textual, entity matching entre anúncios e visual matching são separados. Identificação de alvo A/B explícito não prova identidade entre anúncios ou unidades vizinhas. Investigador e qualidade cadastral não têm certificação JEV. Na avaliação, selecionar/rejeitar comparáveis, similaridade e outlier são hipóteses não avaliadas; preço final continua no motor determinístico/estatístico ou regra explícita.

Vision/fachada: **NAO_AVALIADA**, nível 0. [Bloco específico](experiments/jev/s2g/vision-status.md) lista fachada externa/interior, número, placa, portão, garagem, tipo, same-property, comparação anúncio × candidato e ranking visual como usos de benchmark futuro. Texto não prova qualidade visual boa nem ruim. Protótipo local pausado não foi acessado nem usado como evidência JEV.

## Arquiteturas híbridas e efeitos

Três candidatas comparadas por vantagens, riscos, custo conceitual, observabilidade e complexidade em [hybrid-architectures.md](experiments/jev/s2g/hybrid-architectures.md):

- A: JEV macro → código crítico → GPT redação → JEV verdict → código/revisão. Mais sinais e maior complexidade/custo conceitual; modelos podem compartilhar erro.
- B: código determina contexto autorizado/fonte atual → JEV classifica/routing limitado → GPT redige → código valida → revisão. Candidata operacional preferida, somente se benchmarks/gates demonstrarem utilidade.
- C: JEV em shadow, comparado com referência, sem efeito no fluxo. Primeiro desenho experimental recomendado para a capacidade que o humano escolher. Shadow futuro também exige autorização, dados permitidos e orçamento próprios.

GPT é papel arquitetural proposto, não evidência de geração comparada ou uso autorizado agora. Guardas são requisitos e invariantes para o futuro desenho, não certificação de que todo novo cenário já esteja coberto no produto atual. Política de IA por ambiente continua intacta, incluindo bloqueios do Codex/Preview.

Níveis no [mapa operacional](experiments/jev/s2g/operational-impact-map.json): 0 não usar; 1 assistivo/visualização; 2 shadow/recomendação; 3 decisão limitada com guarda independente. Não existe nível 4 autônomo. Permissão atual de todas as 54 capacidades: NONE. Possíveis efeitos futuros são sugestão, badge, flag, score, candidato, ranking, alerta ou revisão humana — apenas conforme capability e novo gate.

Sem gate explícito futuro, não enviar WhatsApp, mudar status, apagar contato, publicar/retirar imóvel, alterar proprietário/corretor, definir taxa/preço, criar compromisso, registrar pagamento/repasse ou executar ferramenta externa.

## Guardas determinísticas

[Lista completa](experiments/jev/s2g/deterministic-guards.md): taxa de administração e protocolo oficial; ownership, tenant, sessão/permissões e RLS; fatos atuais canônicos, dados ausentes/null e identidade da fonte; verdade temporal/histórico; status persistente, publicação/retirada e regra publicado então angariou; autorização/destinatário de WhatsApp; efeitos financeiros e repasse; preço final; agenda/ações, confirmação, revalidação e idempotência; parser/modelo/usage/orçamento/privacidade. Preservar datas canônicas, statusHistory, núcleo de cálculo compartilhado e escrita persistente antes do estado local. Nenhuma dessas regras migrou para o JEV.

## Prioridades e próximo gate

| Ordem | Frente | Impacto | Risco | Custo experimental conceitual | Dependências |
| --- | --- | --- | --- | --- | --- |
| 1 | JEV-GUARD | HIGH | HIGH: falso aceite material possível fora da amostra, apesar de 0/8. | LOW/MEDIUM: candidatas sintéticas e revisão humana; nenhuma cotação ou chamada autorizada. | G-SOURCE; G-TIME; G-COMMERCIAL; G-STRUCTURE |
| 2 | JEV-ENTITY | HIGH | HIGH se resolução for confundida com ownership, identidade entre anúncios ou mutação. | LOW/MEDIUM: catálogo sintético ambíguo e transferências direcionais. | G-TENANT; G-SOURCE |
| 3 | JEV-TEMPORAL | HIGH | HIGH: H1 é bloqueador material, não capacidade aprovada. | LOW primeiro offline; novo ensaio real só com plano e autorização. | G-SOURCE; G-TIME |
| 4 | JEV-FOLLOWUP | HIGH | HIGH se rótulo disparar envio, agenda ou status; macro específica ainda não medida. | MEDIUM: taxonomia e exemplos próprios, rótulos independentes e simulação de efeito. | G-ACTIONS; G-CRM; G-WHATSAPP |
| 5 | JEV-RADAR | MEDIUM/HIGH | MEDIUM/HIGH: relevância e duplicidade falsas podem ocultar oportunidade ou unir entidades. | MEDIUM: amostra própria de anúncios sintéticos/autorizados e goldens de relevância. | G-TENANT; G-SOURCE |
| 6 | JEV-MATCH | HIGH | HIGH: falsa identidade entre anúncios pode contaminar proprietário ou contato. | MEDIUM/HIGH: pares positivos/negativos, unidades vizinhas e benchmark por modalidade. | G-TENANT; G-SOURCE |
| 7 | JEV-VISION | POTENCIAL_HIGH | DESCONHECIDO: desempenho visual não avaliado; falso match teria impacto alto. | HIGH/UNKNOWN: imagens e anotações específicas, privacidade e verificação de modelo antes de qualquer gate pago. | G-EXPERIMENT; G-TENANT; G-SOURCE |

Ordem é recomendação, não escolha/execução: GUARD → ENTITY → TEMPORAL → FOLLOWUP → RADAR → MATCH → VISION. A guarda temporal/fonte é pré-requisito de segurança antes de qualquer Guard; posição de TEMPORAL não adia esse bloqueador. Sua prioridade é investigação offline/verdade determinada por código, não promoção de temporal JEV. Vision ficou por último por ausência de evidência e dependências de benchmark, não previsão de desempenho. [Ranking detalhado](experiments/jev/s2g/experiment-priority.json).

Riscos: amostra sintética/repetida; falso aceite fora dos exemplos; metadados incorretos escondidos por verdict; fonte null/transferência; histórico de invalid probabilities; confidence mal interpretada; generalização indevida para outros módulos; shadow com dados reais sem gate; taxonomia usada para reescrever score. [Registro](experiments/jev/s2g/risk-register.json). Correção → segurança → observabilidade → custo. Historicamente F-B foi barato (US$0,002235744 estimados, BILLED_UNKNOWN), mas preço não foi reconfirmado e não determina promoção.

Próximo gate recomendado: humano escolhe uma capability e aprova desenho próprio, escopo/dados, controles e autorização antes de qualquer chamada ou integração. Não iniciar GUARD/ENTITY/TEMPORAL/FOLLOWUP/RADAR/MATCH/VISION, lote V2 completo, S3, Q1, M1c-F ou outra frente paga.

## Validação, preservação e limites

Primeiro 292 PASS/0 FAIL nos testes existentes. Depois 35 testes S2-G-A e suíte completa: **327 PASS/0 FAIL**, sem cancelados ou ignorados, sob bloqueio técnico de rede com zero tentativas. Conferidos bytes e listas históricas, referências/pointers, fatos F-B, classes completas, Vision, H1, efeitos, guardas, ranking, dados e ausência de executor pago/ambiente. [Certificação](experiments/jev/s2g/certification.json).

Snapshot direto protege 177 arquivos históricos e 769 arquivos de produto/canônicos, além de freezes transitivos S0/S1/S2-A. S2-B/D/E/F-A/F-B permanecem intactos; parser, scorer, oráculos, autorizações, locks, ledgers, stages e relatórios não foram alterados. Propagação foi alterada somente por append, com prefixo anterior preservado por hash. [Freeze](experiments/jev/s2g/freeze.json) protege este checkpoint e este relatório. Whitespace, links locais e diff do produto conferidos na finalização.

Não foram executados testes reais de IA, browser, WhatsApp, Radar, banco ou Production: o pedido exige zero rede/IA e nenhum fluxo do produto foi alterado. Não há integração criada para smoke manual neste checkpoint. Validação humana necessária é revisar classificações, distinguir erro material de aplicabilidade e escolher o próximo experimento; futuros smokes dependem de outro gate. Nenhum ajuste visual foi feito. Rollback documental: remover somente o novo namespace/relatório se desejado, preservando históricos; não há código de produto a reverter. Sem commit, push, merge, PR ou deploy.

Angario INALTERADO; web INALTERADO; OpenAI/JEV 0 chamadas; rede 0; créditos 0; Production/banco/Radar real/WhatsApp não acessados; credenciais não lidas. **STOP JEV-S2-G-A. Próxima decisão humana.**
