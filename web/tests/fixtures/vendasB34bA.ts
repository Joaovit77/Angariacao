import { vi } from "vitest";
import type { ClienteImoveisVenda, ConsultaImoveisVenda } from "@/lib/persistencia/vendasImoveisLeitura";
import { candidatosSinteticos, CONTA_CANDIDATOS } from "./vendasB34bACatalogo";
export { candidatosSinteticos, CONTA_CANDIDATOS, OUTRA_CONTA_CANDIDATOS, idCandidato, linhaCandidato } from "./vendasB34bACatalogo";

export interface ConsultaCandidatosRegistrada {
  tabela: string; colunas: string; escopo: [string, string][]; ordem: [string, boolean][]; intervalo: [number, number] | null;
}
/** O cliente falso só oferece Auth e SELECT; os métodos mutantes são sentinelas que falham. */
export function clienteCandidatosFalso(linhas: readonly unknown[] = candidatosSinteticos(), opcoes: {
  usuarioId?: string | null; erroAuth?: unknown; erroConsulta?: unknown; falhaRede?: boolean;
  resposta?: unknown; erroPagina?: number;
} = {}) {
  const consultas: ConsultaCandidatosRegistrada[] = [];
  const mutar = vi.fn(() => { throw new Error("B3.4b-A deve permanecer somente leitura."); });
  const getUser = vi.fn(async () => ({
    data: { user: opcoes.usuarioId === null ? null : { id: opcoes.usuarioId ?? CONTA_CANDIDATOS } }, error: opcoes.erroAuth ?? null,
  }));
  const from = vi.fn((tabela: string) => ({
    select: (colunas: string) => {
      const registro: ConsultaCandidatosRegistrada = { tabela, colunas, escopo: [], ordem: [], intervalo: null };
      consultas.push(registro);
      const consulta: ConsultaImoveisVenda = {
        eq: (coluna, valor) => { registro.escopo.push([coluna, valor]); return consulta; },
        order: (coluna, { ascending }) => { registro.ordem.push([coluna, ascending]); return consulta; },
        range: (inicio, fim) => { registro.intervalo = [inicio, fim]; return consulta; },
        then: (ok, falha) => {
          if (opcoes.falhaRede) return Promise.reject(new Error("Rede indisponível.")).then(ok, falha);
          const [inicio, fim] = registro.intervalo ?? [0, 499];
          return Promise.resolve({
            data: Object.hasOwn(opcoes, "resposta") ? opcoes.resposta : linhas.slice(inicio, fim + 1),
            error: inicio === opcoes.erroPagina ? { code: "XX000" } : opcoes.erroConsulta ?? null,
          }).then(ok, falha);
        },
      };
      return Object.assign(consulta, { insert: mutar, update: mutar, upsert: mutar, delete: mutar });
    },
    insert: mutar, update: mutar, upsert: mutar, delete: mutar,
  }));
  const cliente: ClienteImoveisVenda = Object.assign({ auth: { getUser }, from }, { rpc: mutar });
  return { cliente, consultas, getUser, from, mutar };
}
