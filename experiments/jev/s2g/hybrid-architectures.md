# Arquiteturas candidatas — nenhuma integração

Recomendação: C é o primeiro desenho experimental; B é a candidata operacional híbrida se os gates demonstrarem utilidade. A é alternativa mais complexa. Isso não escolhe nem inicia experimento. GPT é um papel proposto para redação, sem avaliação comparativa ou chamada neste checkpoint.

## A — Duplo sinal JEV com redação GPT

JEV: ação macro → Código: contexto, fonte, tempo, protocolo e permissões → GPT: rascunho → JEV: verdict macro da candidata → Código: revalidação independente → Humano: revisão/aceitação.

Vantagens: Separa decisão, redação e auditoria; Compara sinal antes e depois da geração. Riscos: Dois sinais do mesmo modelo podem compartilhar ponto cego; JEV não estabelece verdade temporal; H1 e transferência A/B exigem guardas externas. Custo conceitual: Duas avaliações JEV + uma geração GPT por ciclo básico; não é cotação nem teto autorizado. Observabilidade: Correlacionar três saídas, fontes canônicas, divergências e guardas, sem texto privado. Complexidade: HIGH. Limite: Nenhum envio ou mutação recebe permissão do verdict. Alternativa mais complexa para futura avaliação, sem escolha de integração.

## B — Código determina fontes e verdade; JEV classifica

Código: contexto autorizado e fatos atuais confirmados → JEV: classificação/routing limitado → GPT: rascunho com fontes → Código: validações de fonte, tempo, protocolo e ação → Humano: revisão/aceitação.

Vantagens: H1 é bloqueado antes do modelo; Autoridade de tenant, fonte e regras permanece determinística; Menos chamadas conceituais que A. Riscos: Código não cobre sozinho toda a semântica; Routing errado não pode eliminar fontes obrigatórias ou bloquear parcial válida; Qualidade do GPT nesta arquitetura não foi comparada. Custo conceitual: Uma avaliação JEV + uma geração GPT por ciclo básico, além de validações existentes que qualquer gate deve inventariar. Observabilidade: Registrar catálogo/hash, classificação, guardas, cobertura de fontes e revisão. Complexidade: MEDIUM. Limite: JEV só recomenda dentro do catálogo autorizado; políticas atuais continuam soberanas. Candidata preferida para eventual arquitetura operacional híbrida, condicionada a benchmark e decisão humana.

## C — JEV em shadow sem efeito no produto

Código: pacote sintético ou autorizado por gate específico → JEV: decisão de capacidade isolada → Código: comparação com referência e guardas → Revisor: análise de divergência; fluxo existente permanece dono do resultado.

Vantagens: Não expõe cliente ao resultado JEV; Permite medir incremento por capacidade e preservar rollback simples; Observa falsos aceites, rejeições e erros materiais antes de promover. Riscos: Shadow futuro ainda pode custar e envolver dados; exige autorização própria; Concordância sem contraste pode repetir erro e não medir utilidade. Custo conceitual: Uma avaliação JEV paralela por unidade escolhida; não substitui chamadas atuais nem promete economia. Observabilidade: Stage/modelo/usage/latência, status estrutural e discrepância por campo; dados mínimos, sem raw. Complexidade: LOW. Limite: Nenhuma decisão de produto, envio, escrita ou ferramenta; leitura de dados reais também exige gate específico. Primeiro desenho recomendado para qualquer capability escolhida pelo humano; nada é implementado agora.

H1 impede delegar verdade atual ao JEV. Tenant, autorização, null, preço, taxa e fonte oficial vêm do código. Verdict APPROVE sozinho nunca autoriza efeito. Qualquer rodada futura com GPT deve respeitar [IA por ambiente](../../../docs/IA-AMBIENTES.md); este documento não libera OpenAI no Codex/Preview.
