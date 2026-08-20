/* Contrato do webhook de recebimento (lib/calculo/webhookWhatsapp).
   Feature nova — não há oráculo do app antigo. Os payloads usados aqui
   são a FORMA real observada na Evolution 2.3.7 em produção (números e
   nomes trocados), porque o valor destes testes está em travar o formato
   que a instância de verdade manda, não um formato imaginado. */
import { describe, expect, it } from "vitest";
import {
  MAX_TEXTO_NOTA,
  TIPO_AGENDA_RETORNO,
  TIPO_AGENDA_VISITA,
  compromissoDaResposta,
  fecharTentativaPendente,
  interpretarEvento,
  horaExplicitaDaMensagem,
  horaParaAtualizarCompromisso,
  interlocutorSeDeclarouResponsavel,
  encerramentoPorResposta,
  notaDaResposta,
  notaDoEncerramento,
  sugerirNaTentativaPendente,
  telefoneCanonico,
  textoDaMensagem,
} from "@/lib/calculo/webhookWhatsapp";
import { motivoPerdaPelaFase, MOTIVOS_QUE_DEPENDEM_DA_FASE } from "@/lib/calculo/motor";
import { MOTIVOS_PERDA_IA } from "@/lib/calculo/ia";
import { MOTIVOS_CHEGAMOS_TARDE } from "@/lib/calculo/relatorioCompleto";
import { MOTIVO_PERDA_LOCADO_FORA, MOTIVOS_PERDA } from "@/lib/constantes";
import type { Tentativa } from "@/lib/tipos";

/* --- telefoneCanonico -------------------------------------------------------
   Esta é a tabela que PRENDE a função à gêmea `telefone_canonico()` do
   Postgres (supabase-schema.sql). Foi rodada lá antes de existir aqui, e a
   saída conferida uma a uma. Se alguém mexer em uma das duas sem mexer na
   outra, o casamento passa a falhar em silêncio — e é este teste que grita. */
describe("telefoneCanonico (gêmea da função do banco)", () => {
  const CASOS: [string, string | null][] = [
    ["(43) 99802-4316", "4398024316"], // como o corretor digita
    ["5543998024316", "4398024316"], // DDI + nono dígito
    ["554398024316", "4398024316"], // DDI sem o nono (a forma do jid)
    ["43998024316", "4398024316"], // sem DDI, com o nono
    ["(43) 3324-5678", "4333245678"], // fixo: intocado
    ["043 99802-4316", "4398024316"], // DDD escrito com zero
    ["+1 415 555 2671", null], // estrangeiro
    ["5514155552671", null], // estrangeiro disfarçado de nacional
    ["123", null],
    ["", null],
  ];

  for (const [entrada, esperado] of CASOS) {
    it(`${entrada || "(vazio)"} -> ${esperado ?? "null"}`, () => {
      expect(telefoneCanonico(entrada)).toBe(esperado);
    });
  }

  it("null e undefined não quebram", () => {
    expect(telefoneCanonico(null)).toBeNull();
    expect(telefoneCanonico(undefined)).toBeNull();
  });

  it("as quatro grafias do mesmo número caem no mesmo valor", () => {
    const formas = ["(43) 99802-4316", "5543998024316", "554398024316", "43998024316"];
    const canonicos = new Set(formas.map(telefoneCanonico));
    expect(canonicos.size).toBe(1);
  });
});

/* --- interpretarEvento ---------------------------------------------------- */

/** Payload no formato real da Evolution 2.3.7 (campos que não usamos omitidos). */
function evento(over: {
  event?: string;
  instance?: string;
  fromMe?: boolean;
  id?: string;
  remoteJid?: string;
  remoteJidAlt?: string;
  message?: unknown;
  messageType?: string;
}): unknown {
  return {
    event: over.event ?? "messages.upsert",
    instance: over.instance ?? "Angarimovel",
    data: {
      key: {
        remoteJid: over.remoteJid ?? "554398024316@s.whatsapp.net",
        remoteJidAlt: over.remoteJidAlt,
        fromMe: over.fromMe ?? false,
        id: over.id ?? "3EB0322C86C02D2331D663",
        addressingMode: "lid",
      },
      pushName: "José Ricardo",
      message: over.message ?? { conversation: "Pode me mandar mais detalhes?" },
      messageType: over.messageType ?? "conversation",
    },
    sender: "554391137509@s.whatsapp.net",
    apikey: "TOKEN-DA-INSTANCIA",
  };
}

describe("interpretarEvento", () => {
  it("lê uma resposta de proprietário", () => {
    expect(interpretarEvento(evento({}))).toEqual({
      instancia: "Angarimovel",
      mensagemId: "3EB0322C86C02D2331D663",
      telefone: "4398024316",
      texto: "Pode me mandar mais detalhes?",
      tipo: "conversation",
      direcao: "recebida",
    });
  });

  it("lê a nossa própria mensagem como saída confirmada (fromMe)", () => {
    expect(interpretarEvento(evento({ fromMe: true }))?.direcao).toBe("enviada");
  });

  it("ignora evento que não é messages.upsert", () => {
    expect(interpretarEvento(evento({ event: "connection.update" }))).toBeNull();
  });

  it("ignora grupo", () => {
    expect(interpretarEvento(evento({ remoteJid: "120363042@g.us" }))).toBeNull();
  });

  it("ignora o status do WhatsApp", () => {
    expect(interpretarEvento(evento({ remoteJid: "status@broadcast" }))).toBeNull();
  });

  it("no modo LID, cai no remoteJidAlt quando o remoteJid não é telefone", () => {
    const lido = interpretarEvento(
      evento({ remoteJid: "182736451827364@lid", remoteJidAlt: "554398024316@s.whatsapp.net" }),
    );
    expect(lido?.telefone).toBe("4398024316");
  });

  it("descarta quando nem remoteJid nem remoteJidAlt são telefone utilizável", () => {
    expect(interpretarEvento(evento({ remoteJid: "182736451827364@lid" }))).toBeNull();
  });

  it("descarta número estrangeiro", () => {
    expect(interpretarEvento(evento({ remoteJid: "14155552671@s.whatsapp.net" }))).toBeNull();
  });

  it("descarta evento sem instância (não daria para saber de qual corretor é)", () => {
    expect(interpretarEvento(evento({ instance: "" }))).toBeNull();
  });

  it("descarta evento sem id da mensagem (sem ele não há como evitar reentrega)", () => {
    expect(interpretarEvento(evento({ id: "" }))).toBeNull();
  });

  it("não quebra com lixo", () => {
    expect(interpretarEvento(null)).toBeNull();
    expect(interpretarEvento("texto solto")).toBeNull();
    expect(interpretarEvento({})).toBeNull();
    expect(interpretarEvento({ event: "messages.upsert", instance: "X", data: null })).toBeNull();
  });

  it("aceita mensagem sem texto (áudio, figurinha): chegou resposta mesmo assim", () => {
    const lido = interpretarEvento(evento({ message: { audioMessage: {} }, messageType: "audioMessage" }));
    expect(lido?.texto).toBe("");
    expect(lido?.tipo).toBe("audioMessage");
  });
});

describe("textoDaMensagem", () => {
  it("lê conversation", () => {
    expect(textoDaMensagem({ conversation: "oi" })).toBe("oi");
  });

  it("lê extendedTextMessage (texto longo, link ou resposta a outra mensagem)", () => {
    expect(textoDaMensagem({ extendedTextMessage: { text: "segue o link" } })).toBe("segue o link");
  });

  it("lê a legenda de foto e de vídeo", () => {
    expect(textoDaMensagem({ imageMessage: { caption: "essa é a sala" } })).toBe("essa é a sala");
    expect(textoDaMensagem({ videoMessage: { caption: "vídeo do imóvel" } })).toBe("vídeo do imóvel");
  });

  it("devolve vazio para o que não tem texto", () => {
    expect(textoDaMensagem({ audioMessage: {} })).toBe("");
    expect(textoDaMensagem(null)).toBe("");
  });
});

/* --- notaDaResposta -------------------------------------------------------- */

const AGORA = "2026-07-22T15:48";

function mensagem(over: Partial<Parameters<typeof notaDaResposta>[0]> = {}) {
  return {
    instancia: "Angarimovel",
    mensagemId: "3EB0322C86C02D2331D663",
    telefone: "4398024316",
    texto: "Pode sim, me liga amanhã",
    tipo: "conversation",
    ...over,
  };
}

describe("notaDaResposta", () => {
  it("monta a nota com o texto da resposta", () => {
    const nota = notaDaResposta(mensagem(), AGORA);
    expect(nota.texto).toBe("Resposta pelo WhatsApp: Pode sim, me liga amanhã");
    expect(nota.data).toBe(AGORA);
  });

  it("o id sai do id da mensagem — é o que garante a idempotência", () => {
    const nota = notaDaResposta(mensagem(), AGORA);
    expect(nota.id).toBe("wa:3EB0322C86C02D2331D663");
    // Duas entregas do MESMO evento produzem o MESMO id, então a segunda é
    // recusada pelo banco em vez de virar nota duplicada.
    expect(notaDaResposta(mensagem(), "2026-07-22T16:00").id).toBe(nota.id);
  });

  it("descreve o que chegou quando não há texto — áudio é resposta de verdade", () => {
    expect(notaDaResposta(mensagem({ texto: "", tipo: "audioMessage" }), AGORA).texto).toBe(
      "Resposta pelo WhatsApp: [áudio]",
    );
    expect(notaDaResposta(mensagem({ texto: "", tipo: "imageMessage" }), AGORA).texto).toBe(
      "Resposta pelo WhatsApp: [imagem]",
    );
  });

  it("tipo desconhecido sem texto não vira nota vazia", () => {
    expect(notaDaResposta(mensagem({ texto: "", tipo: "pollCreationMessage" }), AGORA).texto).toBe(
      "Resposta pelo WhatsApp: [mensagem sem texto]",
    );
  });

  it("trunca mensagem gigante para não virar uma parede no histórico", () => {
    const nota = notaDaResposta(mensagem({ texto: "a".repeat(MAX_TEXTO_NOTA + 500) }), AGORA);
    expect(nota.texto.endsWith("…")).toBe(true);
    expect(nota.texto.length).toBeLessThan(MAX_TEXTO_NOTA + 40);
  });

  it("não trunca o que cabe", () => {
    const texto = "a".repeat(MAX_TEXTO_NOTA);
    expect(notaDaResposta(mensagem({ texto }), AGORA).texto.endsWith("…")).toBe(false);
  });
});

/* --- fecharTentativaPendente ---------------------------------------------- */

const HOJE = "2026-07-22";

function tentativa(over: Partial<Tentativa> & { id: string; data: string }): Tentativa {
  return {
    abordagemId: "a1",
    canal: "WhatsApp",
    resultado: "sem-resposta",
    ...over,
  };
}


describe("fecharTentativaPendente", () => {
  it("fecha a tentativa que esperava desfecho", () => {
    const t = tentativa({ id: "t1", data: "2026-07-20T10:00", aguardandoResultado: true });
    const r = fecharTentativaPendente(([t]), HOJE);
    expect(r?.fechada.resultado).toBe("respondeu");
    expect(r?.fechada.aguardandoResultado).toBeUndefined();
    expect(r?.tentativas).toHaveLength(1);
  });

  it("não toca em tentativa anotada à mão — ali o 'sem resposta' é afirmação do corretor", () => {
    const t = tentativa({ id: "t1", data: "2026-07-20T10:00" }); // sem a marca
    expect(fecharTentativaPendente(([t]), HOJE)).toBeNull();
  });

  it("fecha a mais recente: a resposta responde à última mensagem", () => {
    const antiga = tentativa({ id: "t1", data: "2026-07-15T10:00", aguardandoResultado: true });
    const nova = tentativa({ id: "t2", data: "2026-07-21T09:00", aguardandoResultado: true });
    const r = fecharTentativaPendente(([antiga, nova]), HOJE);
    expect(r?.fechada.id).toBe("t2");
    // a antiga fica como estava — ela de fato não teve resposta
    expect(r?.tentativas.find((t) => t.id === "t1")?.aguardandoResultado).toBe(true);
  });

  it("ignora tentativa fora da janela do nudge: conversa nova não ressuscita cobrança velha", () => {
    const velha = tentativa({ id: "t1", data: "2026-06-01T10:00", aguardandoResultado: true });
    expect(fecharTentativaPendente(([velha]), HOJE)).toBeNull();
  });

  it("devolve null quando não há tentativa nenhuma (caso comum, não é erro)", () => {
    expect(fecharTentativaPendente(([]), HOJE)).toBeNull();
  });

  it("preserva as demais tentativas do histórico", () => {
    const outra = tentativa({ id: "t0", data: "2026-07-10T10:00", resultado: "recusou" });
    const alvo = tentativa({ id: "t1", data: "2026-07-20T10:00", aguardandoResultado: true });
    const r = fecharTentativaPendente(([outra, alvo]), HOJE);
    expect(r?.tentativas).toHaveLength(2);
    expect(r?.tentativas.find((t) => t.id === "t0")?.resultado).toBe("recusou");
  });

  it("fecha como 'respondeu' quando não há IA — é o teto do que dá para afirmar", () => {
    const t = tentativa({ id: "t1", data: "2026-07-20T10:00", aguardandoResultado: true });
    expect(fecharTentativaPendente([t], HOJE)?.fechada.resultado).toBe("respondeu");
  });

  it("não muta o array original", () => {
    const t = tentativa({ id: "t1", data: "2026-07-20T10:00", aguardandoResultado: true });
    const original = [t];
    fecharTentativaPendente(original, HOJE);
    expect(original[0].aguardandoResultado).toBe(true);
    expect(original[0].resultado).toBe("sem-resposta");
  });
});

/* --- sugerirNaTentativaPendente -------------------------------------------- */

describe("sugerirNaTentativaPendente", () => {
  const SUGESTAO = {
    resultado: "vai-retornar" as const,
    retomarEm: "2026-07-29",
    resumo: "Vai avaliar com a esposa e retorna na semana que vem.",
  };

  it("aplica o desfecho sugerido e guarda a leitura", () => {
    const t = tentativa({ id: "t1", data: "2026-07-20T10:00", aguardandoResultado: true });
    const r = sugerirNaTentativaPendente([t], SUGESTAO, HOJE);
    expect(r?.fechada.resultado).toBe("vai-retornar");
    expect(r?.fechada.sugestaoIa?.resumo).toContain("esposa");
    expect(r?.fechada.sugestaoIa?.retomarEm).toBe("2026-07-29");
  });

  it("MANTÉM a marca de pendente: sugestão da IA não é fato confirmado", () => {
    // Esta é a diferença que separa esta função de fecharTentativaPendente.
    // Sem a marca, o ranking passaria a medir a interpretação da IA em vez do
    // que o corretor observou.
    const t = tentativa({ id: "t1", data: "2026-07-20T10:00", aguardandoResultado: true });
    expect(sugerirNaTentativaPendente([t], SUGESTAO, HOJE)?.fechada.aguardandoResultado).toBe(true);
  });

  it("obedece aos mesmos cortes: só a marcada, a mais recente e dentro da janela", () => {
    const manual = tentativa({ id: "t0", data: "2026-07-21T10:00" });
    const velha = tentativa({ id: "t1", data: "2026-06-01T10:00", aguardandoResultado: true });
    const alvo = tentativa({ id: "t2", data: "2026-07-19T10:00", aguardandoResultado: true });
    const r = sugerirNaTentativaPendente([manual, velha, alvo], SUGESTAO, HOJE);
    expect(r?.fechada.id).toBe("t2");
    expect(r?.tentativas.find((t) => t.id === "t0")?.sugestaoIa).toBeUndefined();
  });

  it("sem tentativa pendente não inventa registro", () => {
    expect(sugerirNaTentativaPendente([], SUGESTAO, HOJE)).toBeNull();
  });
});

/* --- encerramentoPorResposta -----------------------------------------------
   A única coisa que a IA muda sem confirmação do corretor. Estes testes
   fixam onde ela PODE e onde ela NÃO pode agir — e o caso mais importante é
   o último: nada aqui produz "Locado". */
describe("encerramentoPorResposta", () => {
  const MOTIVO = "Imóvel já alugado por conta própria";

  it("encerra como Perdido, com o motivo lido da mensagem", () => {
    const r = encerramentoPorResposta({ status: "Sem resposta", statusHistory: [] }, MOTIVO, HOJE);
    expect(r?.status).toBe("Perdido");
    expect(r?.motivoPerda).toBe(MOTIVO);
  });

  it("NUNCA produz Locado — alugado por conta própria é perda, não ganho", () => {
    // Se virasse Locado, entraria na conversão, no tempo médio, na comissão e
    // na meta do mês um negócio que a imobiliária não fez.
    const r = encerramentoPorResposta({ status: "Novo contato", statusHistory: [] }, MOTIVO, HOJE);
    expect(r?.status).not.toBe("Locado");
    expect(r?.status).toBe("Perdido");
  });

  it("registra a transição no statusHistory", () => {
    const r = encerramentoPorResposta(
      { status: "Novo contato", statusHistory: [{ status: "Novo contato", date: "2026-07-01" }] },
      MOTIVO,
      HOJE,
    );
    expect(r?.statusHistory).toEqual([
      { status: "Novo contato", date: "2026-07-01" },
      { status: "Perdido", date: HOJE },
    ]);
  });

  it("age a partir de 'Sem resposta' — é o estado de quem acabou de responder", () => {
    // Regressão: "Sem resposta" está em STATUS_TERMINAL_NEGATIVE, e barrar por
    // aquela lista faria a feature nunca disparar no caso do follow-up.
    expect(encerramentoPorResposta({ status: "Sem resposta", statusHistory: [] }, MOTIVO, HOJE)).not.toBeNull();
  });

  it("não faz nada sem motivo — o caso normal", () => {
    expect(encerramentoPorResposta({ status: "Novo contato", statusHistory: [] }, null, HOJE)).toBeNull();
    expect(encerramentoPorResposta({ status: "Novo contato", statusHistory: [] }, undefined, HOJE)).toBeNull();
  });

  it("não desfaz um imóvel já Locado", () => {
    expect(encerramentoPorResposta({ status: "Locado", statusHistory: [] }, MOTIVO, HOJE)).toBeNull();
  });

  it("não reescreve o desfecho de quem já estava Perdido ou Cancelado", () => {
    // Lá já existe um motivo escrito, possivelmente melhor que este.
    expect(encerramentoPorResposta({ status: "Perdido", statusHistory: [] }, MOTIVO, HOJE)).toBeNull();
    expect(encerramentoPorResposta({ status: "Cancelado", statusHistory: [] }, MOTIVO, HOJE)).toBeNull();
  });
});

/* --- motivoPerdaPelaFase ---------------------------------------------------
   "Já aluguei" é a MESMA frase em duas situações opostas, e a IA só vê a
   frase. Quem sabe a diferença é o statusHistory. */
describe("motivoPerdaPelaFase", () => {
  const HIST_CAPTADO = [
    { status: "Novo contato", date: "2026-06-01" },
    { status: "Angariado", date: "2026-06-20" },
  ];

  it("imóvel já angariado: a perda é da LOCAÇÃO, não da captação", () => {
    // Sem isto, todo encerramento automático de imóvel captado ia para o balde
    // "chegamos tarde" do relatório — e o garimpo levaria a culpa por uma
    // perda que só existiu porque a captação deu certo.
    for (const motivo of ["Imóvel já alugado por conta própria", "Optou por outra imobiliária"]) {
      expect(motivoPerdaPelaFase(HIST_CAPTADO, motivo)).toBe(MOTIVO_PERDA_LOCADO_FORA);
    }
  });

  it("lead que nunca foi captado mantém o motivo lido da mensagem", () => {
    const hist = [{ status: "Novo contato", date: "2026-06-01" }];
    expect(motivoPerdaPelaFase(hist, "Optou por outra imobiliária")).toBe("Optou por outra imobiliária");
    expect(motivoPerdaPelaFase(null, "Optou por outra imobiliária")).toBe("Optou por outra imobiliária");
  });

  it("venda é venda em qualquer fase", () => {
    expect(motivoPerdaPelaFase(HIST_CAPTADO, "Imóvel já vendido")).toBe("Imóvel já vendido");
  });

  it("o encerramento automático aplica a correção", () => {
    const r = encerramentoPorResposta(
      { status: "Angariado", statusHistory: HIST_CAPTADO },
      "Optou por outra imobiliária",
      HOJE,
    );
    expect(r?.motivoPerda).toBe(MOTIVO_PERDA_LOCADO_FORA);
  });

  it("o motivo corrigido existe no seletor do cadastro", () => {
    // O webhook grava direto no banco, sem passar pelo formulário. Fora de
    // MOTIVOS_PERDA, o <select> do ModalImovel abriria sem a opção
    // correspondente e a primeira edição do imóvel salvaria vazio.
    expect(MOTIVOS_PERDA).toContain(MOTIVO_PERDA_LOCADO_FORA);
  });

  /* A regra vive de três listas concordarem sobre a mesma string, e nenhuma
     delas importa a outra. Reescrever um rótulo em constantes.ts (ajustar a
     redação, tirar um acento) desligaria a correção SEM erro de compilação e
     sem teste vermelho — é o risco que o comentário do
     MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO descreve. Estas duas asserções são o
     alarme. */
  describe("as listas que a regra atravessa continuam de acordo", () => {
    it("todo motivo dependente de fase é um que a IA pode preencher", () => {
      // Fora de MOTIVOS_PERDA_IA, o encerramento automático nunca produz esse
      // motivo e a correção do webhook vira código morto.
      for (const m of MOTIVOS_QUE_DEPENDEM_DA_FASE) expect(MOTIVOS_PERDA_IA).toContain(m);
    });

    it("todo motivo dependente de fase está no balde 'chegamos tarde'", () => {
      // É de lá que a correção tira o imóvel. Se um rótulo sair daquela lista,
      // a correção passa a mover um imóvel de um balde onde ele não estava, e o
      // relatório perde a única razão de ela existir.
      for (const m of MOTIVOS_QUE_DEPENDEM_DA_FASE) expect(MOTIVOS_CHEGAMOS_TARDE).toContain(m);
    });
  });
});

describe("notaDoEncerramento", () => {
  it("explica na tela por que o status mudou", () => {
    const n = notaDoEncerramento("MSG1", { status: "Perdido", motivoPerda: "Optou por outra imobiliária" }, AGORA);
    expect(n.texto).toContain("Perdido");
    expect(n.texto).toContain("Optou por outra imobiliária");
    expect(n.texto).toContain("altere o status");
  });

  it("é idempotente e não colide com a nota da resposta", () => {
    const n = notaDoEncerramento("MSG1", { status: "Perdido", motivoPerda: "x" }, AGORA);
    expect(n.id).toBe("wa:MSG1:encerrado");
    expect(n.id).not.toBe(notaDaResposta(mensagem({ mensagemId: "MSG1" }), AGORA).id);
  });
});

describe("compromissoDaResposta — a agenda inteligente", () => {
  const HOJE = "2026-07-24";

  it('"pode ser quinta às 10h" vira compromisso com hora', () => {
    const c = compromissoDaResposta(
      { resultado: "agendou", retomarEm: "2026-07-30", horaRetomar: "10:00", resumo: "Aceitou visita." },
      "LD-120",
      HOJE,
    );
    expect(c).toEqual({
      titulo: "Visita — LD-120",
      tipo: TIPO_AGENDA_VISITA,
      data: "2026-07-30",
      hora: "10:00",
      notas: "Criado a partir da resposta do proprietário no WhatsApp. Aceitou visita.",
    });
  });

  it("sem hora, é compromisso do dia (cai na lista sem hora da agenda)", () => {
    const c = compromissoDaResposta(
      { resultado: "vai-retornar", retomarEm: "2026-08-01", horaRetomar: null, resumo: "Pediu retorno." },
      "LD-99",
      HOJE,
    );
    expect(c?.hora).toBeNull();
    expect(c?.tipo).toBe(TIPO_AGENDA_RETORNO);
    expect(c?.titulo).toBe("Retorno — LD-99");
  });

  it("SEM DATA não cria nada — inventar um dia faz ligar no dia errado", () => {
    expect(
      compromissoDaResposta({ resultado: "respondeu", retomarEm: null, resumo: "Perguntou o valor." }, "LD-1", HOJE),
    ).toBeNull();
  });

  it("data no passado não cria — é leitura errada da mensagem", () => {
    expect(
      compromissoDaResposta({ resultado: "agendou", retomarEm: "2026-07-01", resumo: "x" }, "LD-1", HOJE),
    ).toBeNull();
  });

  it("hoje ainda vale — quem disse 'me liga hoje à tarde' precisa aparecer", () => {
    expect(compromissoDaResposta({ resultado: "agendou", retomarEm: HOJE, resumo: "x" }, "LD-1", HOJE)).not.toBeNull();
  });

  it("sugestão ausente (IA fora do ar) não cria nada", () => {
    expect(compromissoDaResposta(null, "LD-1", HOJE)).toBeNull();
  });

  it("a nota sempre diz de onde veio — compromisso órfão o corretor apaga", () => {
    const c = compromissoDaResposta({ resultado: "agendou", retomarEm: "2026-08-02", resumo: "" }, "LD-5", HOJE);
    expect(c?.notas).toContain("resposta do proprietário no WhatsApp");
  });
});

describe("contexto fragmentado da resposta", () => {
  it("reconhece que a própria pessoa é responsável — LD-247", () => {
    expect(interlocutorSeDeclarouResponsavel(["Bom dia, sou a responsável", "Tenho sim"])).toBe(true);
    expect(interlocutorSeDeclarouResponsavel(["Eu cuido do imóvel"])).toBe(true);
  });

  it("não confunde parente do dono nem uma negação com o responsável", () => {
    expect(interlocutorSeDeclarouResponsavel(["Meu pai é o dono"])).toBe(false);
    expect(interlocutorSeDeclarouResponsavel(["Não sou a responsável"])).toBe(false);
    expect(interlocutorSeDeclarouResponsavel(["Eu era a responsável", "Agora minha mãe é a responsável"])).toBe(
      false,
    );
  });

  it("preserva uma hora explícita que a IA tenha omitido", () => {
    expect(horaExplicitaDaMensagem("Pode ser às 9h30")).toBe("09:30");
    expect(horaExplicitaDaMensagem("Amanhã às 10h 30m")).toBe("10:30");
    expect(horaExplicitaDaMensagem("Pode ser às 10 h 30 min")).toBe("10:30");
    expect(horaExplicitaDaMensagem("Combinado às 10h e 30")).toBe("10:30");
    expect(horaExplicitaDaMensagem("Pode ser às 10:30")).toBe("10:30");
    expect(horaExplicitaDaMensagem("Combinado pelas 14")).toBe("14:00");
    expect(horaExplicitaDaMensagem("Pode ser às 10h 70m")).toBeNull();
    expect(horaExplicitaDaMensagem("de manhã")).toBeNull();
  });

  it("não escolhe por regex quando há duas horas diferentes", () => {
    expect(horaExplicitaDaMensagem("Não às 10h; pode ser às 11h")).toBeNull();
  });

  it("completa ou corrige a hora do compromisso já criado no mesmo dia", () => {
    expect(horaParaAtualizarCompromisso(null, "10:00")).toBe("10:00");
    expect(horaParaAtualizarCompromisso("09:00", "10:00")).toBe("10:00");
    expect(horaParaAtualizarCompromisso("10:00", "10:00")).toBeNull();
    expect(horaParaAtualizarCompromisso(null, null)).toBeNull();
  });
});
