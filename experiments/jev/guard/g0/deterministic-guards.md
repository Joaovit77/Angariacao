# Guardas independentes e soberanas

Mesmo depois do JEV, código continua responsável por: tenant; ownership; sessão/permissão; RLS; entidade autorizada; fonte canônica; fonte atual; null/ausência; verdade temporal; protocolo oficial; taxa oficial; preço canônico; status persistente; publicação; retirada; agenda; destinatário; WhatsApp; efeitos financeiros; repasse; idempotência; confirmação humana quando exigida. Nenhum desses controles é transferido ao modelo.

| ID | Responsabilidade |
| --- | --- |
| G-TENANT | Sessão confiável, tenant, user_id, ownership, permissões/RLS e catálogo autorizado; modelo não escolhe o dono. |
| G-SOURCE | IDs/valores/fonte canônica e atual; tratar null, atributo omitido, campo ausente e UNKNOWN sem substituição ou zero. |
| G-TIME | Confirmar quando vale a fonte, separar histórico/superado e não assumir continuidade. |
| G-COMMERCIAL | Protocolo oficial ativo/aplicável e taxa/regra comercial; preço canônico e autorização comercial independentes da candidata. |
| G-CRM | Status persistente, publicado então angariou, publicação/retirada, estado anterior, statusHistory e revalidação transacional. |
| G-ACTIONS | Agenda, destinatário/WhatsApp, autorização, confirmações, idempotência; nada é enviado/criado pelo verdict. |
| G-FINANCE | Preço final calculado por motor/regra explícita; pagamentos, efeitos financeiros e repasse nunca por julgamento do JEV. |
| G-STRUCTURE | Parser/schema/enums, modelo, usage, orçamento e privacidade; invalid tem result=null; não persiste raw. |

São requisitos/invariantes para o desenho futuro, não implementação nova nem certificação de cobertura atual. Preservar datas pelo módulo canônico, statusHistory e escrita persistente antes do estado local. Regras existentes do produto não são ampliadas nem removidas. [Mapa anterior](../../s2g/deterministic-guards.md), [política de ambiente](../../../../docs/IA-AMBIENTES.md), [contexto canônico](../../../../PROJECT.md).
