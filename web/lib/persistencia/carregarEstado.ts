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
import type { Abordagem, AgendaItem, Imovel, Metas, UserConfig, WhatsappModelo } from "../tipos";
import {
  fromDbAbordagem, fromDbAgenda, fromDbImovel,
  type DbAbordagemRow, type DbAgendaRow, type DbImovelRow, type DbMetaRow, type DbUserConfigRow,
} from "./mapeadores";
import { getSupabase } from "./supabase";

export interface EstadoApp {
  imoveis: Imovel[];
  metas: Metas;
  agenda: AgendaItem[];
  abordagens: Abordagem[];
  config: UserConfig;
}

export async function carregarEstado(client: SupabaseClient = getSupabase()): Promise<EstadoApp> {
  const [imRes, mtRes, agRes, abRes, cfRes] = await Promise.all([
    client.from("imoveis").select("*"),
    client.from("metas").select("*"),
    client.from("agenda").select("*"),
    client.from("abordagens").select("*"),
    client.from("user_config").select("*").maybeSingle(),
  ]);
  if (imRes.error) throw imRes.error;
  if (mtRes.error) throw mtRes.error;
  if (agRes.error) throw agRes.error;
  // Mesma tolerância deliberada aplicada a user_config: um erro no catálogo de
  // abordagens (ex.: schema ainda não atualizado) NÃO derruba o carregamento —
  // o app funciona inteiro sem ele, só sem o ranking de abordagens.

  const metas: Metas = {};
  ((mtRes.data || []) as DbMetaRow[]).forEach((m) => {
    metas[m.month_key] = { angariacoes: m.angariacoes || 0, locados: m.locados || 0, comissao: Number(m.comissao) || 0, faturamento: Number(m.faturamento) || 0 };
  });

  const cfData = cfRes.data as DbUserConfigRow | null;
  // agenda_tipos é jsonb; blinda contra null/undefined/valor não-array e
  // descarta entradas vazias/não-string vindas do banco.
  const agendaTipos = Array.isArray(cfData?.agenda_tipos)
    ? cfData.agenda_tipos.filter((t): t is string => typeof t === "string" && t.trim() !== "")
    : [];
  // whatsapp_modelos é jsonb; blinda contra valores malformados vindos do banco.
  const whatsappModelos: WhatsappModelo[] = Array.isArray(cfData?.whatsapp_modelos)
    ? cfData.whatsapp_modelos
        .filter((m): m is WhatsappModelo =>
          !!m && typeof m === "object" &&
          typeof (m as WhatsappModelo).id === "string" &&
          typeof (m as WhatsappModelo).nome === "string" &&
          typeof (m as WhatsappModelo).texto === "string",
        )
        .map((m) => ({ id: m.id, nome: m.nome, texto: m.texto }))
    : [];
  return {
    imoveis: ((imRes.data || []) as DbImovelRow[]).map(fromDbImovel),
    agenda: ((agRes.data || []) as DbAgendaRow[]).map(fromDbAgenda),
    abordagens: abRes.error ? [] : ((abRes.data || []) as DbAbordagemRow[]).map(fromDbAbordagem),
    metas,
    config: { comissaoPercent: cfData ? Number(cfData.comissao_percent) : 100, agendaTipos, whatsappModelos },
  };
}
