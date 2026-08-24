/* Compatibilidade para os dois chamadores históricos. O cliente real e
   único agora vive em `lib/servidor/evolution`, junto do ciclo de vida
   privilegiado da instância fixa. */
export { consultarConexao, TIMEOUT_EVOLUTION_MS as TIMEOUT_MS } from "@/lib/servidor/evolution";
