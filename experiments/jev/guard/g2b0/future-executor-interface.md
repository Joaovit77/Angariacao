# Interface futura — sem executor neste B0

Um futuro executor deve consumir exatamente paired-order.json e payloads congelados, gerar novo run jev-guard-g2b-<timestamp>-<random>, novos locks de autorização/execução e IDs de stage/attempt por sequência. Cada record inclui run_id, arm, case_id, sequence, request_sha256, stage=validation, repetition=1, model_requested/observed, transport_completed, status, usage, latency_ms e projeção do adapter correspondente.

Antes de HTTP futuro: confirmar autorização nova exclusiva (72 calls, modelo exato, teto total, synthetic only, zero retry/integration), preço atual, hashes/históricos, contexto, budget com pior próxima chamada e persistir stage/ledger IN_PROGRESS durável. Nunca auto-resume, warm-up, probe ou retry. Nenhum token/secret/raw/prompt/contexto retornado/reasoning/debug livre é persistido. Falhas operacionais, modelo, budget, privacy ou history interrompem; structural unknown exige HOLD. A política exata deve ser certificada com o futuro executor antes da rede.

B0 não implementa transporte, leitura de credenciais, locks reais de execução ou SDK. Plano puro e adapters/scorers não conseguem iniciar rede. Somente nova decisão humana pode abrir G2-B real; nenhuma autorização anterior é reaproveitável.
