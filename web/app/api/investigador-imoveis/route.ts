import { createClient } from "@supabase/supabase-js";
import {
  analisarCorrespondenciasInvestigacao,
  consultaInvestigadorValida,
  deduplicarResultadosInvestigacao,
  gerarConsultasInvestigacao,
  LIMITE_CONSULTA_INVESTIGADOR,
  type EventoInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { buscarImovelNaWeb, BuscaWebIndisponivel } from "@/lib/servidor/investigadorImoveis";

export const runtime = "nodejs";
export const maxDuration = 60;

// Trava somente enquanto a promessa existe na instância atual. Não persiste
// consulta nem vira cache; apenas evita cobrar duas vezes pelo mesmo clique.
const investigacoesEmAndamento = new Set<string>();

async function usuarioAutenticado(request: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!url || !key || !token) return null;
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser();
  return !error && data.user ? data.user.id : null;
}

function mensagemSegura(erro: unknown): string {
  if (erro instanceof BuscaWebIndisponivel) {
    if (erro.motivo === "configuracao") return "O Investigador ainda não está configurado neste ambiente.";
    if (erro.motivo === "limite") {
      return erro.retryAfterSegundos !== undefined
        ? `O limite de pesquisas foi atingido. Tente novamente em ${erro.retryAfterSegundos} segundos.`
        : "O limite de pesquisas foi atingido. Tente novamente mais tarde.";
    }
  }
  return "A pesquisa na web está indisponível agora. Tente novamente em alguns minutos.";
}

export async function POST(request: Request): Promise<Response> {
  const userId = await usuarioAutenticado(request);
  if (!userId) return Response.json({ mensagem: "Sessão inválida." }, { status: 401 });
  const tamanhoDeclarado = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > 4_096) {
    return Response.json({ mensagem: "A consulta excede o tamanho permitido." }, { status: 413 });
  }
  const corpo = await request.json().catch(() => null) as { consulta?: unknown } | null;
  if (!consultaInvestigadorValida(corpo?.consulta)) {
    return Response.json({ mensagem: "Informe ao menos 3 caracteres sobre o imóvel." }, { status: 400 });
  }
  const consultaOriginal = corpo.consulta.replace(/\s+/g, " ").trim().slice(0, LIMITE_CONSULTA_INVESTIGADOR);
  const chaveEmAndamento = `${userId}:${consultaOriginal.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}`;
  if (investigacoesEmAndamento.has(chaveEmAndamento)) {
    return Response.json({ mensagem: "Esta investigação já está em andamento." }, { status: 409 });
  }
  investigacoesEmAndamento.add(chaveEmAndamento);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitir = (evento: EventoInvestigacao) => controller.enqueue(encoder.encode(`${JSON.stringify(evento)}\n`));
      try {
        emitir({ tipo: "etapa", etapa: "gerando-buscas" });
        const consultas = gerarConsultasInvestigacao(consultaOriginal);
        emitir({ tipo: "etapa", etapa: "pesquisando-web" });
        const busca = await buscarImovelNaWeb(
          consultaOriginal,
          consultas,
          undefined,
          (consultasExecutadas) => emitir({ tipo: "consultas", consultas: consultasExecutadas }),
        );
        emitir({ tipo: "etapa", etapa: "normalizando-resultados" });
        const unicos = deduplicarResultadosInvestigacao(busca.resultados);
        emitir({ tipo: "etapa", etapa: "cruzando-informacoes" });
        const resultados = analisarCorrespondenciasInvestigacao(consultaOriginal, unicos);
        const aviso = busca.limiteAtingido
          ? busca.retryAfterSegundos !== undefined
            ? `Investigação concluída parcialmente por limite do provedor. Tente novamente em ${busca.retryAfterSegundos} segundos.`
            : "Investigação concluída parcialmente porque o limite do provedor foi atingido."
          : busca.falhas
            ? `${busca.falhas} das ${busca.consultasExecutadas.length} pesquisas executadas não responderam; os demais resultados foram mantidos.`
          : resultados.length ? undefined : "Nenhuma possível correspondência apareceu nessas buscas.";
        emitir({
          tipo: "resultado",
          dados: {
            ok: true,
            consultaOriginal,
            consultas: busca.consultasExecutadas,
            resultados,
            pesquisasEvitadas: busca.pesquisasEvitadas,
            encerramentoAntecipado: busca.encerramentoAntecipado,
            limiteAtingido: busca.limiteAtingido,
            aviso,
          },
        });
      } catch (erro) {
        console.warn("[investigador-imoveis] investigação não concluída", {
          motivo: erro instanceof BuscaWebIndisponivel ? erro.motivo : "inesperado",
        });
        emitir({ tipo: "erro", mensagem: mensagemSegura(erro) });
      } finally {
        investigacoesEmAndamento.delete(chaveEmAndamento);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
