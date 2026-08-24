/* ================================================================
   INSTÂNCIA DO USUÁRIO — Supabase + ciclo de vida da Evolution

   Este é o encontro entre a linha user-scoped e o cliente global. Só a
   instância fixa `corretora` ganha recuperação automática; todas as
   demais continuam exatamente como já eram e nunca são alteradas.
   ================================================================ */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INSTANCIA_CORRETORA,
  OBSERVACAO_CORRETORA,
} from "@/lib/calculo/instanciaCorretora";
import {
  garantirInstanciaCorretora,
  type FalhaGarantiaEvolution,
} from "@/lib/servidor/evolution";

export interface RegistroInstanciaWhatsapp {
  instancia: string;
  token: string | null;
  observacao?: string | null;
}

export type FalhaInstanciaWhatsapp =
  | "sem-instancia"
  | "persistencia"
  | "instancia-em-uso"
  | "usuario-ja-configurado"
  | FalhaGarantiaEvolution;

export type ResultadoInstanciaWhatsapp =
  | {
      ok: true;
      instancia: string;
      token: string;
      criada: boolean;
      qr: string | null;
    }
  | { ok: false; falha: FalhaInstanciaWhatsapp };

function observacaoComFonte(atual: string | null | undefined): string {
  const limpa = (atual || "").trim();
  if (!limpa) return OBSERVACAO_CORRETORA;
  if (limpa.includes(OBSERVACAO_CORRETORA)) return limpa;
  return `${limpa} | ${OBSERVACAO_CORRETORA}`;
}

/** Garante uma linha já carregada, sempre filtrando a escrita pelo dono. */
export async function garantirRegistroInstanciaWhatsapp(
  supabase: SupabaseClient,
  userId: string,
  registro: RegistroInstanciaWhatsapp,
): Promise<ResultadoInstanciaWhatsapp> {
  const instancia = registro.instancia.trim();
  const tokenAtual = registro.token?.trim() || null;

  // Outras instâncias não pertencem a esta tarefa e não recebem poder
  // global novo. Mantém integralmente o comportamento anterior.
  if (instancia !== INSTANCIA_CORRETORA) {
    return tokenAtual
      ? { ok: true, instancia, token: tokenAtual, criada: false, qr: null }
      : { ok: false, falha: "sem-instancia" };
  }

  const garantia = await garantirInstanciaCorretora(
    process.env.EVOLUTION_SERVER_URL || "",
    process.env.AUTHENTICATION_API_KEY,
    tokenAtual,
  );
  if (!garantia.ok) return garantia;

  const observacao = observacaoComFonte(registro.observacao);
  if (garantia.token !== tokenAtual || observacao !== registro.observacao) {
    const { error } = await supabase
      .from("whatsapp_instancias")
      .update({ token: garantia.token, observacao })
      .eq("user_id", userId)
      .eq("instancia", INSTANCIA_CORRETORA);
    if (error) {
      console.error("WhatsApp da corretora: falha ao sincronizar o estado local:", error.message);
      return { ok: false, falha: "persistencia" };
    }
  }

  return {
    ok: true,
    instancia: INSTANCIA_CORRETORA,
    token: garantia.token,
    criada: garantia.criada,
    qr: garantia.qr,
  };
}

/** Carrega a linha do usuário e aplica a garantia quando ela é a fixa. */
export async function instanciaWhatsappDoUsuario(
  supabase: SupabaseClient,
  userId: string,
): Promise<ResultadoInstanciaWhatsapp> {
  const { data, error } = await supabase
    .from("whatsapp_instancias")
    .select("instancia, token, observacao")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("WhatsApp: falha ao ler a instância do usuário:", error.message);
    return { ok: false, falha: "persistencia" };
  }
  if (!data?.instancia) return { ok: false, falha: "sem-instancia" };
  return garantirRegistroInstanciaWhatsapp(supabase, userId, {
    instancia: data.instancia as string,
    token: (data.token as string | null) ?? null,
    observacao: (data.observacao as string | null) ?? null,
  });
}

/**
 * Cadastro inicial acionado pelo admin. Recusa sobrescrever outra
 * instância local ou tomar `corretora` de outro usuário.
 */
export async function provisionarInstanciaCorretora(
  supabase: SupabaseClient,
  userId: string,
): Promise<ResultadoInstanciaWhatsapp> {
  const [porUsuario, porNome] = await Promise.all([
    supabase
      .from("whatsapp_instancias")
      .select("instancia, token, observacao")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("whatsapp_instancias")
      .select("user_id")
      .eq("instancia", INSTANCIA_CORRETORA)
      .maybeSingle(),
  ]);
  if (porUsuario.error || porNome.error) {
    console.error(
      "WhatsApp da corretora: falha ao conferir o cadastro:",
      porUsuario.error?.message || porNome.error?.message,
    );
    return { ok: false, falha: "persistencia" };
  }
  if (porNome.data?.user_id && porNome.data.user_id !== userId) {
    return { ok: false, falha: "instancia-em-uso" };
  }
  if (porUsuario.data?.instancia && porUsuario.data.instancia !== INSTANCIA_CORRETORA) {
    return { ok: false, falha: "usuario-ja-configurado" };
  }

  const garantia = await garantirInstanciaCorretora(
    process.env.EVOLUTION_SERVER_URL || "",
    process.env.AUTHENTICATION_API_KEY,
    (porUsuario.data?.token as string | null | undefined) ?? null,
  );
  if (!garantia.ok) return garantia;

  const { error } = await supabase.from("whatsapp_instancias").upsert(
    {
      user_id: userId,
      instancia: INSTANCIA_CORRETORA,
      token: garantia.token,
      observacao: observacaoComFonte(porUsuario.data?.observacao as string | null | undefined),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    if (error.code === "23505") return { ok: false, falha: "instancia-em-uso" };
    console.error("WhatsApp da corretora: falha ao salvar o cadastro:", error.message);
    return { ok: false, falha: "persistencia" };
  }

  return {
    ok: true,
    instancia: INSTANCIA_CORRETORA,
    token: garantia.token,
    criada: garantia.criada,
    qr: garantia.qr,
  };
}
