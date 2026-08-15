import {
  ESQUEMA_DECISAO_ATENDIMENTO,
  ESQUEMA_GERACAO_ATENDIMENTO,
  ESQUEMA_VALIDACAO_ATENDIMENTO,
  PROMPT_BASE_ATENDIMENTO,
  contextoAtendimentoDoImovel,
  normalizarDecisaoAtendimento,
  promptDecidirAtendimento,
  promptGerarAtendimento,
  promptValidarAtendimento,
  validacaoAprovaAtendimento,
} from "@/lib/ia/atendimento";
import { corpoDaResposta, ehSoMidia } from "@/lib/calculo/notas";
import { respostasDoImovel } from "@/lib/calculo/respostas";
import {
  fromDbAbordagem,
  fromDbImovel,
  fromDbProtocolo,
  type DbAbordagemRow,
  type DbImovelRow,
  type DbProtocoloRow,
} from "@/lib/persistencia/mapeadores";
import { registrarEvento } from "@/lib/servidor/registro";
import type { HandlerIa } from "../dispatcher";
import { classificarErroIa } from "../executor-openai";
import { respostaErroIa } from "../respostas";

export const atenderProprietario: HandlerIa<"rascunhar-resposta"> = async ({
  corpo,
  supabase,
  userId,
  executor,
  tipo,
}) => {
  const imovelId = typeof corpo.imovelId === "string" ? corpo.imovelId : "";
  if (!imovelId) return respostaErroIa("requisicao-invalida", 400);

  const { data: imRow, error: imErr } = await supabase
    .from("imoveis")
    .select("*")
    .eq("id", imovelId)
    .maybeSingle();
  if (imErr) {
    console.error("IA: falha ao ler o imóvel para rascunho:", imErr.message);
    return respostaErroIa("falha-ia", 500);
  }
  if (!imRow) return respostaErroIa("sem-dados", 422);
  const imovel = fromDbImovel(imRow as DbImovelRow);

  const comTexto = respostasDoImovel(imovel).filter((n) => !ehSoMidia(n.texto));
  const ultima = comTexto[comTexto.length - 1];
  const mensagemProp = ultima ? corpoDaResposta(ultima.texto) : "";
  if (!mensagemProp.trim()) return respostaErroIa("sem-dados", 422);

  const ultimaTentativa = [...(imovel.tentativas || [])]
    .sort((a, b) => (a.data || "").localeCompare(b.data || ""))
    .at(-1);
  let enviada: { rotulo?: string | null; texto?: string | null } | null = null;
  if (ultimaTentativa?.abordagemId) {
    const { data: abRow } = await supabase
      .from("abordagens")
      .select("*")
      .eq("id", ultimaTentativa.abordagemId)
      .maybeSingle();
    if (abRow) {
      const abordagem = fromDbAbordagem(abRow as DbAbordagemRow);
      enviada = { rotulo: abordagem.nome, texto: abordagem.roteiro };
    }
  } else if (ultimaTentativa?.modeloNome) {
    enviada = { rotulo: ultimaTentativa.modeloNome, texto: null };
  }

  const anteriores = comTexto.slice(0, -1).map((n) => corpoDaResposta(n.texto));
  const { data: ptData, error: ptErro } = await supabase
    .from("protocolos")
    .select("*")
    .order("created_at", { ascending: true });
  if (ptErro) console.error("IA: falha ao ler os protocolos:", ptErro.message);
  const protocolos = ((ptData || []) as DbProtocoloRow[])
    .map(fromDbProtocolo)
    .filter((p) => !p.arquivado)
    .map((p) => ({ titulo: p.titulo, conteudo: p.conteudo }));

  const conversa = { anteriores, enviada };
  const contexto = contextoAtendimentoDoImovel(imovel);

  let textoDecisao: string;
  try {
    ({ texto: textoDecisao } = await executor.executar({
      tipo: `${tipo}-decisao`,
      reasoningEffort: "low",
      formato: {
        nome: "decisao_atendimento",
        esquema: ESQUEMA_DECISAO_ATENDIMENTO,
      },
      mensagens: [
        { role: "system", content: PROMPT_BASE_ATENDIMENTO },
        {
          role: "user",
          content: promptDecidirAtendimento(mensagemProp, contexto, conversa, protocolos),
        },
      ],
    }));
  } catch (e) {
    console.error("IA: falha ao decidir o atendimento:", e);
    const falha = classificarErroIa(e);
    registrarEvento({
      userId,
      categoria: "ia",
      nivel: "erro",
      evento: "ia-falhou",
      detalhe: `${tipo}-decisao: ${falha}`,
    });
    return respostaErroIa(falha, 502);
  }

  let decisao;
  try {
    decisao = normalizarDecisaoAtendimento(JSON.parse(textoDecisao), protocolos);
  } catch {
    decisao = null;
  }
  if (!decisao) return respostaErroIa("falha-ia", 502);
  if (decisao.precisaIntervencaoHumana || !decisao.podeResponderComSeguranca) {
    registrarEvento({
      userId,
      categoria: "ia",
      nivel: "aviso",
      evento: "ia-intervencao-humana",
      detalhe: decisao.intencao,
    });
    return respostaErroIa("intervencao-humana", 422);
  }

  const titulosSelecionados = new Set(decisao.protocolosAplicaveis);
  const protocolosSelecionados = protocolos.filter((p) => titulosSelecionados.has(p.titulo));

  let textoGeracao: string;
  try {
    ({ texto: textoGeracao } = await executor.executar({
      tipo: `${tipo}-geracao`,
      reasoningEffort: "low",
      formato: {
        nome: "resposta_atendimento",
        esquema: ESQUEMA_GERACAO_ATENDIMENTO,
      },
      mensagens: [
        { role: "system", content: PROMPT_BASE_ATENDIMENTO },
        {
          role: "user",
          content: promptGerarAtendimento(
            mensagemProp,
            contexto,
            conversa,
            decisao,
            protocolosSelecionados,
          ),
        },
      ],
    }));
  } catch (e) {
    console.error("IA: falha ao gerar a resposta de atendimento:", e);
    const falha = classificarErroIa(e);
    registrarEvento({
      userId,
      categoria: "ia",
      nivel: "erro",
      evento: "ia-falhou",
      detalhe: `${tipo}-geracao: ${falha}`,
    });
    return respostaErroIa(falha, 502);
  }

  let dadosGeracao: { mensagem?: unknown; protocolosUsados?: unknown };
  try {
    dadosGeracao = JSON.parse(textoGeracao) as typeof dadosGeracao;
  } catch {
    return respostaErroIa("falha-ia", 502);
  }
  const rascunho =
    typeof dadosGeracao.mensagem === "string" ? dadosGeracao.mensagem.trim() : "";
  const usadosBrutos = Array.isArray(dadosGeracao.protocolosUsados)
    ? dadosGeracao.protocolosUsados.filter((t): t is string => typeof t === "string")
    : [];
  const titulosPermitidos = new Set(protocolosSelecionados.map((p) => p.titulo));
  if (!rascunho || usadosBrutos.some((t) => !titulosPermitidos.has(t)))
    return respostaErroIa("intervencao-humana", 422);
  const protocolosUsados = [...new Set(usadosBrutos)];

  let textoValidacao: string;
  try {
    ({ texto: textoValidacao } = await executor.executar({
      tipo: `${tipo}-validacao`,
      reasoningEffort: "low",
      formato: {
        nome: "validacao_atendimento",
        esquema: ESQUEMA_VALIDACAO_ATENDIMENTO,
      },
      mensagens: [
        { role: "system", content: PROMPT_BASE_ATENDIMENTO },
        {
          role: "user",
          content: promptValidarAtendimento(
            mensagemProp,
            contexto,
            conversa,
            protocolosSelecionados,
            rascunho,
          ),
        },
      ],
    }));
  } catch (e) {
    console.error("IA: falha ao validar a resposta de atendimento:", e);
    const falha = classificarErroIa(e);
    registrarEvento({
      userId,
      categoria: "ia",
      nivel: "erro",
      evento: "ia-falhou",
      detalhe: `${tipo}-validacao: ${falha}`,
    });
    return respostaErroIa(falha, 502);
  }

  let validacao: unknown;
  try {
    validacao = JSON.parse(textoValidacao);
  } catch {
    validacao = null;
  }
  if (!validacaoAprovaAtendimento(validacao)) {
    registrarEvento({
      userId,
      categoria: "ia",
      nivel: "aviso",
      evento: "ia-resposta-reprovada",
      detalhe: decisao.intencao,
    });
    return respostaErroIa("intervencao-humana", 422);
  }

  return Response.json({ ok: true, rascunho, protocolosUsados });
};
