/** Subconjunto fechado de JSON Schema utilizado pelos contratos do atendimento.
 * Campos novos precisam ser reconhecidos aqui antes de ampliar um contrato. */
interface EsquemaAtendimento {
  type?: "object" | "array" | "string" | "boolean";
  anyOf?: readonly EsquemaAtendimento[];
  properties?: Readonly<Record<string, EsquemaAtendimento>>;
  required?: readonly string[];
  additionalProperties?: false;
  items?: EsquemaAtendimento;
  enum?: readonly string[];
  maxItems?: number;
  pattern?: string;
  description?: string;
}

/** O parser usa o mesmo schema enviado ao provedor, sem completar campos ausentes. */
export function atendeSchemaAtendimento(valor: unknown, esquema: EsquemaAtendimento): boolean {
  if (esquema.anyOf) return esquema.anyOf.some((alternativa) => atendeSchemaAtendimento(valor, alternativa));
  if (esquema.type === "string") {
    return typeof valor === "string"
      && (!esquema.enum || esquema.enum.includes(valor))
      && (!esquema.pattern || new RegExp(esquema.pattern).test(valor));
  }
  if (esquema.type === "boolean") return typeof valor === "boolean";
  if (esquema.type === "array") {
    return Array.isArray(valor) && !!esquema.items
      && (esquema.maxItems === undefined || valor.length <= esquema.maxItems)
      && valor.every((item) => atendeSchemaAtendimento(item, esquema.items!));
  }
  if (esquema.type !== "object" || !valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const objeto = valor as Record<string, unknown>;
  const propriedades = esquema.properties;
  if (!propriedades || esquema.additionalProperties !== false || !esquema.required) return false;
  return esquema.required.every((campo) => Object.hasOwn(objeto, campo))
    && Object.keys(objeto).every((campo) => Object.hasOwn(propriedades, campo)
      && atendeSchemaAtendimento(objeto[campo], propriedades[campo]));
}
