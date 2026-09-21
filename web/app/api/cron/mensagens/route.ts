import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DbMensagemAgendada } from "@/lib/mensagensAgendadas";
import { enviarMensagemAgendada } from "@/lib/servidor/envioMensagemAgendada";
import { agoraISOComSegundos, agoraISOString } from "@/lib/datas";
import {
  classificarFalhaSupabase,
  descreverFalhaSupabase,
  type FalhaSupabase,
} from "@/lib/servidor/erroExterno";
import { registrarMensagemEnviada } from "@/lib/servidor/historicoWhatsapp";
import { registrarEvento } from "@/lib/servidor/registro";
import { garantirRegistroInstanciaWhatsapp } from "@/lib/servidor/instanciaWhatsapp";
import {
  aplicarDecisaoNoBanco,
  cancelarMensagemSemImovel,
  consolidarContatoDoProprietario,
  revalidarVerificacaoDisponibilidade,
} from "@/lib/servidor/disponibilidadeMensagem";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Pausas entre as tentativas do claim. Curtas: o cron volta em um minuto. */
const ESPERAS_CLAIM_MS = [500, 1500];

/**
 * Reclama o lote, repetindo somente falhas transitórias. Repetir é seguro:
 * uma linha que a primeira tentativa já marcou `processando` (resposta
 * perdida depois do commit) não volta na segunda, e o próprio
 * `claim_mensagens_agendadas` a vence como `processamento-interrompido`
 * quando o worker que a reclamou já morreu — nunca a reenvia.
 */
async function reclamarLote(admin: SupabaseClient): Promise<
  { ok: true; lote: DbMensagemAgendada[]; falhas: FalhaSupabase[] } | { ok: false; falhas: FalhaSupabase[] }
> {
  const falhas: FalhaSupabase[] = [];
  for (let tentativa = 0; ; tentativa++) {
    const { data, error, status } = await admin.rpc("claim_mensagens_agendadas", { p_limite: 20 });
    if (!error) return { ok: true, lote: (data || []) as DbMensagemAgendada[], falhas };
    const falha = classificarFalhaSupabase(error, status);
    falhas.push(falha);
    console.error("[mensagens-cron] claim falhou", { tentativa: tentativa + 1, ...falha });
    const espera = ESPERAS_CLAIM_MS[tentativa];
    if (!falha.transitoria || espera === undefined) return { ok: false, falhas };
    await new Promise((resolve) => setTimeout(resolve, espera));
  }
}

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return Response.json({ ok: false, erro: "Cron não configurado." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${segredo}`)
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serverUrl = process.env.EVOLUTION_SERVER_URL;
  if (!url || !serviceRole || !serverUrl)
    return Response.json({ ok: false, erro: "Envio não configurado." }, { status: 503 });

  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const claim = await reclamarLote(admin);
  if (!claim.ok) {
    registrarEvento({
      userId: null,
      categoria: "whatsapp",
      nivel: "erro",
      evento: "agendamento-fila-indisponivel",
      detalhe: claim.falhas.map(descreverFalhaSupabase).join(" "),
    });
    return Response.json(
      { ok: false, erro: "Fila de mensagens indisponível.", falha: claim.falhas[claim.falhas.length - 1].codigo },
      { status: 500 },
    );
  }
  if (claim.falhas.length) {
    // Recuperou ao repetir. Fica registrado para medir a frequência do
    // transitório, em vez de o 500 sumir junto com a causa.
    registrarEvento({
      userId: null,
      categoria: "whatsapp",
      nivel: "aviso",
      evento: "agendamento-fila-recuperada",
      detalhe: claim.falhas.map(descreverFalhaSupabase).join(" "),
    });
  }
  const data = claim.lote;
  let enviadas = 0, falhas = 0, suprimidas = 0, reagendadas = 0, consolidadas = 0;
  for (const item of data) {
    const { data: instancia } = await admin.from("whatsapp_instancias").select("instancia, token, observacao")
      .eq("user_id", item.user_id).maybeSingle();
    try {
      if (!instancia?.instancia) throw new Error("sem-instancia");
      const pronta = await garantirRegistroInstanciaWhatsapp(admin, item.user_id, {
        instancia: instancia.instancia as string,
        token: (instancia.token as string | null) ?? null,
        observacao: (instancia.observacao as string | null) ?? null,
      });
      if (!pronta.ok) throw new Error(`instancia-${pronta.falha}`);
      // O lote foi reclamado antes do loop. Nesse intervalo o imóvel pode ter
      // sido excluído e a transação ter removido esta mensagem. Relê-la
      // imediatamente antes do efeito externo evita usar o item em memória.
      // Falha de leitura não é "linha sumiu": tratada como ausência, um erro
      // passageiro deixaria a mensagem `processando` para sempre.
      const { data: mensagemAtual, error: erroReleitura } = await admin.from("mensagens_agendadas")
        .select("status, imovel_id")
        .eq("id", item.id)
        .eq("user_id", item.user_id)
        .maybeSingle();
      if (erroReleitura) throw new Error("releitura-falhou");
      if (mensagemAtual?.status !== "processando" || (item.imovel_id && mensagemAtual.imovel_id !== item.imovel_id)) continue;

      // Agendar não é garantir o envio. Uma verificação de disponibilidade é
      // reavaliada AQUI, o mais perto possível do efeito externo, contra o
      // estado atual do imóvel e as evidências estruturadas (M2): o imóvel
      // que saiu da carteira cancela a pergunta; a disponibilidade confirmada
      // depois do agendamento empurra a pergunta para E + cadência; e o mesmo
      // proprietário recebe um contato só por dia, não um por imóvel. A
      // mutação é sempre a RPC do M4, que fecha na mesma transação esta linha
      // (`p_mensagem_processando`), os lembretes e as outras mensagens do
      // imóvel. Mensagem `livre` não passa por nada disto.
      let texto = item.mensagem;
      let imoveisDaMensagem: string[] = item.imovel_id ? [item.imovel_id] : [];
      let consolidadaEm: string | null = null;
      if (item.tipo === "verificacao-disponibilidade") {
        let revalidacao: Awaited<ReturnType<typeof revalidarVerificacaoDisponibilidade>>;
        try {
          revalidacao = await revalidarVerificacaoDisponibilidade(admin, item);
        } catch (erro) {
          // Sem fatos confiáveis não se envia nem se cancela: a linha vira
          // erro classificado e o próximo agendamento humano decide.
          registrarEvento({
            userId: item.user_id, categoria: "whatsapp", nivel: "erro",
            evento: "agendamento-revalidacao-falhou",
            detalhe: `${item.id} ${erro instanceof Error ? erro.message.slice(0, 120) : "falha"}`,
          });
          throw new Error("revalidacao-falhou");
        }
        const { decisao, contexto } = revalidacao;
        if (decisao.acao === "cancelar") {
          const resultado = decisao.motivo === "imovel-excluido"
            ? await cancelarMensagemSemImovel(admin, item, agoraISOString())
            : await aplicarDecisaoNoBanco(admin, item, decisao);
          if (!resultado.ok) throw new Error(`transicao-falhou:${resultado.erro ?? "desconhecido"}`);
          registrarEvento({
            userId: item.user_id, categoria: "whatsapp", nivel: "info",
            evento: "agendamento-cancelado-worker",
            detalhe: `${item.id} ${decisao.motivo} ${decisao.evidencia?.codigo ?? "status"}`,
          });
          suprimidas++;
          continue;
        }
        if (decisao.acao === "reagendar") {
          const resultado = await aplicarDecisaoNoBanco(admin, item, decisao);
          if (!resultado.ok) throw new Error(`transicao-falhou:${resultado.erro ?? "desconhecido"}`);
          registrarEvento({
            userId: item.user_id, categoria: "whatsapp", nivel: "info",
            evento: "agendamento-reagendado",
            detalhe: `${item.id} ${decisao.evidencia.codigo} E=${decisao.dataEvidencia.slice(0, 10)} -> ${decisao.novoDiaEnvio}`,
          });
          reagendadas++;
          continue;
        }
        if (contexto.imovel) {
          const consolidacao = await consolidarContatoDoProprietario(admin, item, contexto.imovel, agoraISOString());
          if (consolidacao.absorvidasIds.length) {
            texto = consolidacao.plano.texto ?? texto;
            imoveisDaMensagem = consolidacao.imoveisConsultados.map((imovel) => imovel.id);
            consolidadaEm = agoraISOString();
            registrarEvento({
              userId: item.user_id, categoria: "whatsapp", nivel: "info",
              evento: "agendamento-consolidado",
              detalhe: `${item.id} absorveu ${consolidacao.absorvidasIds.length}; imoveis=${imoveisDaMensagem.length}`,
            });
            consolidadas += consolidacao.absorvidasIds.length;
          }
        }
      }

      const envio = await enviarMensagemAgendada(item.telefone, texto,
        { serverUrl, instancia: pronta.instancia, token: pronta.token });
      const agora = agoraISOString();
      for (const imovelId of imoveisDaMensagem) {
        const historico = await registrarMensagemEnviada(admin, {
          imovelId,
          userId: item.user_id,
          mensagemId: envio.mensagemId,
          texto,
          data: agoraISOComSegundos(),
          origem: "agendamento",
        });
        if (historico.erro) {
          // O envio já aconteceu. Não devolver o item para a fila evita uma
          // segunda mensagem real; o webhook de saída ainda pode recuperar a nota.
          registrarEvento({
            userId: item.user_id,
            categoria: "whatsapp",
            nivel: "erro",
            evento: "historico-envio-falhou",
            detalhe: "agendamento",
          });
        }
      }
      await admin.from("mensagens_agendadas").update({
        status: "enviada", enviado_em: agora, updated_at: agora, erro: null,
        ...(consolidadaEm ? { mensagem: texto, imoveis_consultados: imoveisDaMensagem } : {}),
      }).eq("id", item.id).eq("status", "processando");
      enviadas++;
    } catch (e) {
      const motivo = e instanceof Error ? e.message.slice(0, 300) : "falha-desconhecida";
      await admin.from("mensagens_agendadas").update({ status: "erro", erro: motivo, updated_at: agoraISOString() }).eq("id", item.id).eq("status", "processando");
      falhas++;
    }
  }
  return Response.json({ ok: true, processadas: data.length, enviadas, falhas, suprimidas, reagendadas, consolidadas });
}
