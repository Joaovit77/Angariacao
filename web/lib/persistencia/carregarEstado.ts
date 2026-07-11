/* ================================================================
   CARREGAMENTO DO ESTADO
   Port do loadState() do app original: busca as 4 tabelas em
   paralelo no login e monta o estado camelCase do app.

   Diferenças de forma (lógica intacta, registradas no
   MIGRATION_NEXT.md):
   - retorna o estado em vez de mutar o STATE global; quem chama
     (shell autenticado, Etapa 4) grava no store e trata o erro com
     toast — no app antigo o toast ficava aqui dentro.
   - o cliente entra por parâmetro (testabilidade); default é o
     singleton do browser.

   Comportamento legado preservado de propósito: um erro em
   user_config NÃO derruba o carregamento (o app antigo só checava
   os erros de imoveis/metas/agenda) — sem config, vale o padrão
   comissaoPercent = 100.
   ================================================================ */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgendaItem, Imovel, Metas, UserConfig } from "../tipos";
import {
  fromDbAgenda, fromDbImovel,
  type DbAgendaRow, type DbImovelRow, type DbMetaRow, type DbUserConfigRow,
} from "./mapeadores";
import { getSupabase } from "./supabase";

export interface EstadoApp {
  imoveis: Imovel[];
  metas: Metas;
  agenda: AgendaItem[];
  config: UserConfig;
}

export async function carregarEstado(client: SupabaseClient = getSupabase()): Promise<EstadoApp> {
  const [imRes, mtRes, agRes, cfRes] = await Promise.all([
    client.from("imoveis").select("*"),
    client.from("metas").select("*"),
    client.from("agenda").select("*"),
    client.from("user_config").select("*").maybeSingle(),
  ]);
  if (imRes.error) throw imRes.error;
  if (mtRes.error) throw mtRes.error;
  if (agRes.error) throw agRes.error;

  const metas: Metas = {};
  ((mtRes.data || []) as DbMetaRow[]).forEach((m) => {
    metas[m.month_key] = { angariacoes: m.angariacoes || 0, locados: m.locados || 0, comissao: Number(m.comissao) || 0, faturamento: Number(m.faturamento) || 0 };
  });

  const cfData = cfRes.data as DbUserConfigRow | null;
  return {
    imoveis: ((imRes.data || []) as DbImovelRow[]).map(fromDbImovel),
    agenda: ((agRes.data || []) as DbAgendaRow[]).map(fromDbAgenda),
    metas,
    config: { comissaoPercent: cfData ? Number(cfData.comissao_percent) : 100 },
  };
}
