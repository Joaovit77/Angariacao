/* ================================================================
   API: EVENTOS DO SISTEMA PRINCIPAL (Sophia -> nós)

   A segunda rota que inverte o sentido, e prima da do WhatsApp: as
   demais o app chama; esta quem chama é o Sistema Principal da
   imobiliária, quando o proprietário assina a Autorização de Locação,
   quando o imóvel é locado e quando o financeiro paga a comissão.

   POR QUE ELA EXISTE, e por que só recebe: esses três fatos acontecem
   LÁ. O painel de angariação acompanha a captação e, depois do "sim"
   do proprietário, ficava cego — o corretor descobria que a comissão
   dele tinha sido paga perguntando para alguém. Trazer os eventos para
   cá fecha o acompanhamento sem criar a pior coisa que uma integração
   pode criar: dois sistemas achando que mandam no mesmo dado. Toda
   regra de negócio (quem assina, quando loca, quanto paga) continua no
   Sistema Principal. Aqui é histórico e aviso.

   AS TRÊS DIFERENÇAS que fazem desta rota um caso à parte são as
   mesmas do webhook do WhatsApp, e valem reler lá. Em resumo: ela não
   tem sessão de usuário (quem chama é outro sistema), por isso usa um
   segredo próprio e a service role; e a service role ignora a RLS, por
   isso o `user_id` NUNCA vem da requisição.

   Aqui, porém, ele nasce de um lugar diferente — e essa é a única
   novidade estrutural. No WhatsApp o dono sai do nome da instância. O
   Sistema Principal não sabe nem deve saber a qual corretor a
   angariação pertence: quem angariou o imóvel é informação DAQUI. Então
   o dono é descoberto pelo IMÓVEL — achamos a angariação por uma chave
   forte (referência do CRM, código ou telefone canônico do
   proprietário) e o `user_id` é o da linha encontrada. Continua não
   vindo da requisição: vem do banco.

   A CADEIA DE DESCARTE, como sempre, cada etapa só para descartar:

     segredo -> é um evento que sabemos ler? -> qual angariação?
     -> uma só? -> só então aplica.

   O segredo chega por header (`x-webhook-secret`) OU como último
   segmento da URL, pelo motivo da rota irmã — nem todo cliente de
   webhook deixa configurar header:

     https://angariacao.vercel.app/api/sophia/eventos
     https://angariacao.vercel.app/api/sophia/eventos/<segredo>
   ================================================================ */
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  aplicarEvento,
  detalheDoLog,
  type EventoSistemaPrincipal,
  interpretarEvento,
  localizarAngariacao,
  notaDoEvento,
  telefoneDoEvento,
} from "@/lib/calculo/sistemaPrincipal";
import { historicoComStatus } from "@/lib/calculo/motor";
import { registrarEvento } from "@/lib/servidor/registro";
import { agoraISOComHora, todayISO } from "@/lib/datas";
import { fromDbImovel, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import type { Imovel } from "@/lib/tipos";

/** Comissão usada quando a conta do corretor não tem config própria — o
    mesmo padrão do resto do app. Só entra em estimativa; o valor que o
    financeiro AFIRMA vem no evento e nunca é calculado aqui. */
const COMISSAO_PADRAO = 100;

/** Compara em tempo constante. O sha256 antes do `timingSafeEqual` normaliza
    o comprimento (a função joga com buffers de tamanhos diferentes) e impede
    que o tempo de resposta entregue o tamanho do segredo. */
function segredoConfere(recebido: string, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

function segredoDaRequisicao(request: Request, segmentos: string[] | undefined): string {
  const header = request.headers.get("x-webhook-secret");
  if (header && header.trim()) return header.trim();
  const ultimo = segmentos && segmentos.length > 0 ? segmentos[segmentos.length - 1] : "";
  return (ultimo || "").trim();
}

/** true quando autorizada; `null` quando o ambiente nem tem segredo — que é
    erro nosso, não do chamador, e por isso 503 e não 401. */
function autorizar(request: Request, segmentos: string[] | undefined): boolean | null {
  const esperado = process.env.SOPHIA_WEBHOOK_SECRET;
  if (!esperado) {
    console.error("Eventos do Sistema Principal: SOPHIA_WEBHOOK_SECRET ausente (ver web/.env.example).");
    return null;
  }
  return segredoConfere(segredoDaRequisicao(request, segmentos), esperado);
}

/** Cliente com a SERVICE ROLE. Lido só aqui dentro e nunca exportado, pela
    mesma razão do webhook do WhatsApp: de um módulo compartilhado ela vazaria
    para outra rota por descuido. Toda consulta abaixo é filtrada pelo
    `user_id` da linha encontrada — nunca por algo que veio na requisição. */
function clienteServico(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    console.error("Eventos do Sistema Principal: SUPABASE_SERVICE_ROLE_KEY ausente — evento ignorado.");
    return null;
  }
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** As colunas necessárias para localizar, decidir e aplicar. `notas` NÃO entra:
    a nota é gravada pela função do banco, que faz append sem ler aqui. */
const COLUNAS =
  "id, user_id, codigo, referencia_crm, endereco, cidade, unidade, bloco, status, " +
  "status_history, valor_aluguel, retirado, comissao_recebida, comissao_recebida_valor, " +
  "comissao_recebida_data, autorizacao_assinada_em, locado_em";

type LinhaCandidata = Partial<DbImovelRow> & { id: string; user_id: string; status: string };

/**
 * Os candidatos, já no domínio, mais o dono de cada um.
 *
 * O `user_id` vem SOLTO e não dentro do `Imovel` de propósito: o tipo do
 * domínio não tem esse campo porque o app inteiro trabalha dentro de uma conta
 * só, e acrescentá-lo ali só para esta rota espalharia um campo que 99% do
 * código não deve nem poder ler. Aqui ele é essencial — é o dono descoberto
 * pelo banco, e é por ele que toda escrita seguinte é filtrada.
 */
interface Candidatos {
  imoveis: Imovel[];
  donoPorImovel: Map<string, string>;
}

/** Converte as linhas parciais em `Imovel` para o núcleo puro trabalhar. O
    `fromDbImovel` espera a linha inteira, então os buracos entram como null —
    nenhum campo faltante é lido por `localizarAngariacao`/`aplicarEvento`. */
function paraCandidatos(linhas: LinhaCandidata[]): Candidatos {
  return {
    imoveis: linhas.map((l) => fromDbImovel(l as DbImovelRow)),
    donoPorImovel: new Map(linhas.map((l) => [l.id, l.user_id])),
  };
}

/**
 * Os candidatos a angariação deste evento, por ordem de força da chave.
 *
 * Para na primeira chave que devolve alguma coisa, e a ordem não é estética:
 *
 * - **referência do CRM** é o id compartilhado — depois do primeiro evento,
 *   todo imóvel integrado tem uma, e na base real elas são globalmente únicas
 *   (medido: zero repetições em 850 imóveis, entre todas as contas);
 * - **código** é o identificador daqui, que o Sistema Principal só conhece se
 *   alguém o cadastrou lá;
 * - **telefone** é o que sobra no PRIMEIRO evento, e é justamente o mais
 *   comum — a referência do CRM nasce na assinatura, então no evento que a
 *   cria ela ainda não existe deste lado. Também é o mais ambíguo
 *   (proprietário com vários imóveis), e é por isso que `localizarAngariacao`
 *   tem uma escada de desempate em vez de pegar o primeiro.
 *
 * Nenhuma consulta filtra por `user_id`, e é aqui — e só aqui — que isso é
 * correto: é a linha encontrada que REVELA o dono. Da próxima consulta em
 * diante, tudo é filtrado por ele.
 */
async function buscarCandidatos(
  supabase: SupabaseClient,
  evento: EventoSistemaPrincipal,
): Promise<Candidatos> {
  const ref = (evento.referencia || "").trim();
  if (ref) {
    const { data } = await supabase.from("imoveis").select(COLUNAS).eq("referencia_crm", ref);
    if (data && data.length > 0) return paraCandidatos(data as unknown as LinhaCandidata[]);
  }

  const codigo = (evento.codigo || "").trim();
  if (codigo) {
    const { data } = await supabase.from("imoveis").select(COLUNAS).eq("codigo", codigo);
    if (data && data.length > 0) return paraCandidatos(data as unknown as LinhaCandidata[]);
  }

  const telefone = telefoneDoEvento(evento);
  if (telefone) {
    const { data } = await supabase
      .from("imoveis")
      .select(COLUNAS)
      .eq("proprietario_telefone_canonico", telefone);
    if (data && data.length > 0) return paraCandidatos(data as unknown as LinhaCandidata[]);
  }

  return { imoveis: [], donoPorImovel: new Map() };
}

/** A comissão configurada do corretor, para as estimativas. Falha ou ausência
    cai no padrão: é número de apoio, não pode derrubar a gravação do fato. */
async function comissaoDoCorretor(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from("user_config")
    .select("comissao_percent")
    .eq("user_id", userId)
    .maybeSingle();
  const v = data?.comissao_percent;
  return typeof v === "number" && Number.isFinite(v) ? v : COMISSAO_PADRAO;
}

/** Teste de vida, para quem configurar a integração do outro lado conferir a
    URL e o segredo antes de disparar evento de verdade. */
export async function GET(
  request: Request,
  context: { params: Promise<{ segredo?: string[] }> },
): Promise<Response> {
  const { segredo } = await context.params;
  const ok = autorizar(request, segredo);
  if (ok === null) return Response.json({ ok: false }, { status: 503 });
  if (!ok) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, pronto: true });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ segredo?: string[] }> },
): Promise<Response> {
  const { segredo } = await context.params;
  const ok = autorizar(request, segredo);
  if (ok === null) return Response.json({ ok: false }, { status: 503 });
  if (!ok) {
    console.error("Eventos do Sistema Principal: segredo inválido — requisição descartada.");
    return Response.json({ ok: false }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ ok: false, erro: "corpo-invalido" }, { status: 400 });
  }

  // 1. É um evento que sabemos ler? Tipo desconhecido ou sem id não é
  //    processado "mais ou menos" — sem id não há idempotência, e um webhook
  //    reentregue reaplicaria o evento.
  const evento = interpretarEvento(corpo);
  if (!evento) {
    console.error("Eventos do Sistema Principal: evento não reconhecido (falta id ou tipo).");
    registrarEvento({
      userId: null,
      categoria: "sophia",
      nivel: "erro",
      evento: "sophia-invalido",
      detalhe: "sem id ou tipo reconhecível",
    });
    // 400, e não 200 como no webhook do WhatsApp: lá a reentrega em loop é o
    // risco maior (a Evolution desativa o webhook após tantas falhas). Aqui
    // quem chama é um sistema da própria casa, e o formato errado precisa
    // aparecer para quem o está integrando — silenciar viraria uma integração
    // que "funciona" sem nunca ter chegado.
    return Response.json({ ok: false, erro: "evento-invalido" }, { status: 400 });
  }

  const supabase = clienteServico();
  if (!supabase) return Response.json({ ok: false, erro: "indisponivel" }, { status: 503 });

  // 2. Qual angariação? É AQUI que nasce o user_id — da linha do banco.
  const candidatos = await buscarCandidatos(supabase, evento);
  const alvo = localizarAngariacao(candidatos.imoveis, evento);
  if (!alvo.ok) {
    /* Nada disso gera reclamação: gera SILÊNCIO. O corretor simplesmente
       nunca vê a comissão dele aparecer na tela, e ninguém liga uma coisa à
       outra. Sem esta linha no log, ninguém descobre — a mesma razão do
       "webhook-instancia-desconhecida".

       Sem `user_id` porque não há dono a atribuir: é justamente o que faltou
       descobrir. O detalhe leva a chave usada e não o telefone, pela regra de
       nunca gravar dado pessoal de proprietário no log que quem opera lê. */
    const chave = evento.referencia
      ? `referencia=${evento.referencia}`
      : evento.codigo
        ? `codigo=${evento.codigo}`
        : "telefone";
    console.error(
      `Eventos do Sistema Principal: ${evento.tipo} não aplicado (${alvo.falha}) — ${chave}.`,
    );
    registrarEvento({
      userId: null,
      categoria: "sophia",
      nivel: "erro",
      evento: alvo.falha === "ambigua" ? "sophia-ambiguo" : "sophia-sem-angariacao",
      detalhe: detalheDoLog(evento.tipo, chave, `${alvo.candidatos} candidato(s)`),
    });
    return Response.json(
      { ok: false, erro: alvo.falha, candidatos: alvo.candidatos },
      // 404 para não encontrado, 409 para ambíguo: quem integra do outro lado
      // precisa distinguir "esse imóvel não está no painel de ninguém" de
      // "está, e mandar a referência resolve".
      { status: alvo.falha === "ambigua" ? 409 : 404 },
    );
  }

  const imovel = alvo.imovel;
  const userId = candidatos.donoPorImovel.get(imovel.id);
  if (!userId) {
    // Não acontece: o mapa é montado das mesmas linhas que geraram os
    // candidatos. Fica como guarda porque a alternativa seria escrever com um
    // `user_id` vazio, e o filtro que protege a conta do corretor é exatamente
    // esse — falhar aqui é infinitamente melhor que gravar sem ele.
    console.error("Eventos do Sistema Principal: imóvel sem dono no mapa de candidatos.");
    return Response.json({ ok: false, erro: "indisponivel" }, { status: 500 });
  }

  // 3. Aplica. O núcleo decide o que muda; aqui só se escreve.
  const hoje = todayISO();
  const comissaoPercent = await comissaoDoCorretor(supabase, userId);
  const mudanca = aplicarEvento(imovel, evento, hoje, comissaoPercent);
  if (!mudanca) {
    console.log(`Eventos do Sistema Principal: ${evento.tipo} já constava no imóvel ${imovel.id}.`);
    /* Registrado, e não silencioso, apesar de ser um não-acontecimento. A
       pergunta que a tela de auditoria responde é "por que este evento não
       apareceu no painel?", e "porque o dado já estava lá" é uma resposta —
       enquanto o silêncio obriga quem depura a suspeitar do casamento, do
       segredo e da rota antes de chegar nela. Nível "info": não há o que
       consertar, então não pode disputar espaço com erro de verdade na
       listagem padrão do admin, que abre filtrada por erros. */
    registrarEvento({
      userId,
      categoria: "sophia",
      nivel: "info",
      evento: "sophia-ja-constava",
      detalhe: detalheDoLog(evento.tipo),
    });
    return Response.json({ ok: true, aplicado: false, motivo: "ja-constava" });
  }

  /* A NOTA VEM PRIMEIRO, e a ordem é a idempotência.

     `registrar_nota_imovel` faz a checagem de duplicata e o append numa
     instrução só — é ela que transforma a reentrega do mesmo evento em
     "não fez nada". Gravando as colunas antes, uma reentrega reescreveria o
     status e a comissão a cada retentativa; com a nota na frente, a segunda
     entrega para aqui e nada mais acontece. É a mesma decisão do webhook do
     WhatsApp, pelo mesmo motivo. */
  const { data: gravou, error: erroNota } = await supabase.rpc("registrar_nota_imovel", {
    p_imovel_id: imovel.id,
    p_user_id: userId,
    p_nota: notaDoEvento(evento, mudanca.texto, agoraISOComHora()),
  });
  if (erroNota) {
    console.error("Eventos do Sistema Principal: falha ao gravar a nota:", erroNota.message);
    registrarEvento({
      userId,
      categoria: "sophia",
      nivel: "erro",
      evento: "sophia-falhou",
      detalhe: detalheDoLog(evento.tipo, "nota recusada"),
    });
    // 500: quem chamou deve reentregar — nada foi aplicado.
    return Response.json({ ok: false, erro: "falha-ao-gravar" }, { status: 500 });
  }
  if (gravou !== true) {
    console.log(`Eventos do Sistema Principal: reentrega do evento ${evento.id} — ignorado.`);
    /* A duplicata é o caso que MAIS precisa aparecer na auditoria, por ser o
       único em que tudo funcionou e ainda assim nada mudou. Sem esta linha,
       quem reenviasse um evento veria a rota responder `ok:true` e o painel
       não mexer um pixel, sem nenhum lugar onde ler o porquê — e concluiria
       que a integração está quebrada quando ela está fazendo exatamente o que
       deve. Nível "info" pelo motivo do bloco acima. */
    registrarEvento({
      userId,
      categoria: "sophia",
      nivel: "info",
      evento: "sophia-duplicado",
      detalhe: detalheDoLog(evento.tipo, `id ${evento.id}`),
    });
    return Response.json({ ok: true, aplicado: false, motivo: "reentrega" });
  }

  const patch: Record<string, unknown> = {};
  if (mudanca.campos.autorizacaoAssinadaEm) patch.autorizacao_assinada_em = mudanca.campos.autorizacaoAssinadaEm;
  if (mudanca.campos.autorizacaoResponsavel) patch.autorizacao_responsavel = mudanca.campos.autorizacaoResponsavel;
  if (mudanca.campos.locadoEm) patch.locado_em = mudanca.campos.locadoEm;
  if (mudanca.campos.contratoNumero) patch.contrato_numero = mudanca.campos.contratoNumero;
  if (mudanca.campos.referenciaCrm) patch.referencia_crm = mudanca.campos.referenciaCrm;
  if (mudanca.campos.comissaoRecebida !== undefined) {
    patch.comissao_recebida = mudanca.campos.comissaoRecebida;
    patch.comissao_recebida_data = mudanca.campos.comissaoRecebidaData ?? null;
    patch.comissao_recebida_valor = mudanca.campos.comissaoRecebidaValor ?? null;
  }
  if (mudanca.campos.comissaoFormaPagamento) patch.comissao_forma_pagamento = mudanca.campos.comissaoFormaPagamento;
  if (mudanca.campos.comissaoObservacao) patch.comissao_observacao = mudanca.campos.comissaoObservacao;

  /* O status passa por `historicoComStatus`, e não por uma escrita direta:
     é o invariante do projeto — toda mudança de etapa empurra {status, date}
     no `statusHistory`, e é dele que descendem conversão, coortes, tempo
     médio e estagnação. Escrever só a coluna `status` daqui deixaria um
     imóvel "Locado" que nenhuma métrica reconheceria como locado. */
  if (mudanca.status) {
    patch.status = mudanca.status;
    patch.status_history = historicoComStatus(
      imovel.statusHistory,
      mudanca.status,
      imovel.status,
      hoje,
      {
        authorName: evento.responsavel || null,
        source: "sophia",
      },
    );
  }

  // Update PARCIAL: nunca a linha inteira. O upsert do app grava todas as
  // colunas jsonb de uma vez, e usá-lo aqui apagaria uma nota ou uma
  // tentativa que o corretor tivesse acabado de registrar na tela.
  const { error: erroUpdate } = await supabase
    .from("imoveis")
    .update(patch)
    .eq("id", imovel.id)
    .eq("user_id", userId);
  if (erroUpdate) {
    // A nota (a notificação) já está gravada, então o corretor vê o fato
    // mesmo assim — degradação aceitável, e melhor que desfazer o que deu
    // certo. O log é que transforma isto em algo acionável.
    console.error("Eventos do Sistema Principal: nota gravada, mas o update falhou:", erroUpdate.message);
    registrarEvento({
      userId,
      categoria: "sophia",
      nivel: "erro",
      evento: "sophia-falhou",
      detalhe: detalheDoLog(evento.tipo, erroUpdate.message),
    });
    return Response.json({ ok: false, erro: "falha-ao-aplicar" }, { status: 500 });
  }

  console.log(
    `Eventos do Sistema Principal: ${evento.tipo} aplicado ao imóvel ${imovel.codigo || imovel.id}` +
      (mudanca.status ? ` (status -> ${mudanca.status})` : "") + ".",
  );
  registrarEvento({
    userId,
    categoria: "sophia",
    nivel: "info",
    evento: "sophia-aplicado",
    detalhe: detalheDoLog(evento.tipo, mudanca.status),
  });

  return Response.json({ ok: true, aplicado: true, imovelId: imovel.id, status: mudanca.status });
}
