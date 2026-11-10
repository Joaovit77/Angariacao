# Contrato do experimento pareado

H1: remover perguntas dimensionais muda a validade estrutural por envelope? H2: preserva/melhora o verdict macro sem aumento material de false accept ou aprovação insegura de inconclusivos? G2-A justificou medir a hipótese; não demonstrou superioridade.

36 casos GG0-01 a GG0-36, sem adições ou remoções: 12 APPROVE, 18 REJECT, seis INCONCLUSIVE, 14 críticos, quatro negativos ordinários, 18 pares mínimos. Macro-oracle compartilhado, idêntico nos braços; dimensões esperadas só FULL. Preservar null/value omitido/campo ausente/UNKNOWN, tempo atual/histórico/superseded/desconhecido/não conflitante, A/B/transferências, protocolos sintéticos/taxa/parcial/omissão/extra sem fonte/conflito/autorização inexistente.

Dois braços contemporâneos novos, 36 FULL + 36 REDUCED = 72 chamadas futuras propostas. Não usar outputs G1 no braço FULL. Mesmo modelo proposto jev-1.14.0; mesmo state, candidata, ordering dos dados, policy, framing e pergunta macro. Só questions difere. Cada FULL é byte-idêntico ao request G0; toda diferença fora de questions ou hint novo é HOLD.

Pares adjacentes na ordem GG0-01→36. Ímpares FULL→REDUCED, pares REDUCED→FULL, concorrência 1. Não randomizar/adaptar durante execução. Identidade de braço/caso/expected permanece fora do payload. [Prova](payload-equivalence.json) registra SHA256 do state, bytes fora de questions, candidata e pergunta macro para cada caso.

GG0-29 continua REJECT material, com candidata/contexto/rationale imutáveis. Seu APPROVE G1 continua MACRO_GUARD_FAILURE. Não acrescentar dica ou alterar wording por caso. APPROVE não autoriza efeito; guardas de tenant/ownership/sessão/RLS/fonte/entidade/tempo/null/protocolo/taxa/preço/status/agenda/destinatário/finanças/idempotência/confirmação humana permanecem soberanas.

B0 executa zero provider/rede/crédito/credencial/produção/banco/Radar/WhatsApp/GitHub remoto. Não integra produto. Para eventual G2-B: nova autorização explícita de 72 calls, modelo exato, teto total, synthetic only, zero retry/integration; novo executor isolado, preço oficial reconfirmado, locks, budget guard e ledger durável pré-HTTP. Nenhum requisito constitui autorização agora.
