/* Modelos de mensagem de WhatsApp por etapa do funil (lib/calculo/whatsapp).
   Feature nova da pós-migração — não há oráculo do app antigo; os testes
   fixam o contrato: modelo padrão por status, personalização com os dados
   do imóvel e o link wa.me. */
import { describe, expect, it } from "vitest";
import { mensagemRenovacaoAngariacao, telefoneWhatsapp } from "@/lib/calculo/agenda";
import {
  aplicarModeloUsuario,
  avisoAoSalvarModelo,
  ehContatoDeCaptacao,
  enderecoComUnidade,
  type FalhaEnvio,
  MODELOS_CAPTACAO,
  linkWhatsapp,
  mensagemFalhaEnvio,
  mensagemConfirmacaoVisita,
  mensagemWhatsapp,
  MODELOS_WHATSAPP,
  modeloPadraoWhatsapp,
  numeroEvolution,
  rotuloModeloWhatsapp,
  sugestaoRespostaModelo,
  tokenizarModeloUsuario,
} from "@/lib/calculo/whatsapp";
import { STATUS_ALL } from "@/lib/constantes";
import type { Imovel } from "@/lib/tipos";

const base: Imovel = {
  id: "im-1",
  endereco: "Rua Haddock Lobo, 55",
  bairro: "Cerqueira César",
  proprietarioNome: "Marta",
  proprietarioTelefone: "(11) 98888-0002",
  status: "Visita agendada",
};

describe("modeloPadraoWhatsapp", () => {
  it("mapeia cada status do funil para o modelo da etapa", () => {
    expect(modeloPadraoWhatsapp("Novo contato")).toBe("primeiro-contato");
    expect(modeloPadraoWhatsapp("Visita agendada")).toBe("confirmacao-visita");
    expect(modeloPadraoWhatsapp("Em negociação")).toBe("retorno-negociacao");
    expect(modeloPadraoWhatsapp("Documentação")).toBe("cobranca-documentacao");
    expect(modeloPadraoWhatsapp("Angariado")).toBe("inicio-divulgacao");
    expect(modeloPadraoWhatsapp("Publicado")).toBe("atualizacao-anuncio");
    expect(modeloPadraoWhatsapp("Locado")).toBe("imovel-locado");
  });

  it("saídas laterais e status desconhecido caem na retomada de contato", () => {
    expect(modeloPadraoWhatsapp("Sem resposta")).toBe("retomada-contato");
    expect(modeloPadraoWhatsapp("Perdido")).toBe("retomada-contato");
    expect(modeloPadraoWhatsapp("Cancelado")).toBe("retomada-contato");
    expect(modeloPadraoWhatsapp(null)).toBe("retomada-contato");
    expect(modeloPadraoWhatsapp("Status inventado")).toBe("retomada-contato");
  });

  it("todo status oficial tem modelo padrão presente na lista do seletor", () => {
    const ids = MODELOS_WHATSAPP.map((m) => m.id);
    for (const status of STATUS_ALL) {
      expect(ids).toContain(modeloPadraoWhatsapp(status));
    }
  });
});

describe("mensagemWhatsapp", () => {
  it("personaliza com nome, endereço e bairro", () => {
    const msg = mensagemWhatsapp("confirmacao-visita", base);
    expect(msg).toContain("Olá, Marta! Tudo bem?");
    expect(msg).toContain("seu imóvel (Rua Haddock Lobo, 55, Cerqueira César)");
  });

  it("sem nome e sem endereço usa saudação e referência genéricas", () => {
    const msg = mensagemWhatsapp("primeiro-contato", {
      ...base,
      proprietarioNome: null,
      endereco: "",
      bairro: null,
    });
    expect(msg).toContain("Olá! Tudo bem?");
    expect(msg).toContain("do seu imóvel");
    expect(msg).not.toContain("(");
  });

  it("todo modelo do seletor gera mensagem não vazia", () => {
    for (const m of MODELOS_WHATSAPP) {
      expect(mensagemWhatsapp(m.id, base).length).toBeGreaterThan(0);
    }
  });

  it("modelo desconhecido cai na retomada de contato", () => {
    expect(mensagemWhatsapp("nao-existe", base)).toBe(mensagemWhatsapp("retomada-contato", base));
  });

  it("feedback-divulgacao assina com o nome do captador quando informado", () => {
    const msg = mensagemWhatsapp("feedback-divulgacao", base, "Ana");
    expect(msg).toContain("Olá, Marta! Tudo bem?");
    expect(msg).toContain("Aqui é Ana, da equipe de locação da imobiliária.");
    expect(msg).toContain("seu imóvel (Rua Haddock Lobo, 55, Cerqueira César)");
    expect(msg).toContain("ativo no nosso pipeline");
  });

  it("feedback-divulgacao sem nome cai na apresentação genérica", () => {
    const msg = mensagemWhatsapp("feedback-divulgacao", base);
    expect(msg).toContain("Falo com você em nome da equipe de locação da imobiliária.");
    expect(msg).not.toContain("Aqui é");
  });

  it("o nome do captador não altera os modelos antigos (saída byte-idêntica)", () => {
    // Modelos que assinam com o captador (usam apresentacao(nome)) mudam de
    // propósito quando há nome — ficam de fora deste contrato de estabilidade.
    const usamCaptador = ["feedback-divulgacao", "confirmacao-endereco"];
    for (const m of MODELOS_WHATSAPP) {
      if (usamCaptador.includes(m.id)) continue;
      expect(mensagemWhatsapp(m.id, base, "Ana")).toBe(mensagemWhatsapp(m.id, base));
    }
  });

  it("confirmação de endereço repete o endereço completo para conferência", () => {
    const msg = mensagemWhatsapp("confirmacao-endereco", { ...base, cidade: "São Paulo" }, "Ana");
    expect(msg).toContain("Rua Haddock Lobo, 55, Cerqueira César, São Paulo");
    expect(msg).toContain("confirmar o endereço");
    expect(msg).toContain("Aqui é Ana");
  });

  it("o novo modelo está no seletor", () => {
    expect(MODELOS_WHATSAPP.map((m) => m.id)).toContain("feedback-divulgacao");
  });

  it("renovação de angariação reaproveita a mensagem da Agenda", () => {
    expect(mensagemWhatsapp("renovacao-angariacao", base)).toBe(mensagemRenovacaoAngariacao(base));
  });
});

describe("mensagemConfirmacaoVisita", () => {
  it("explicita dia, data e hora informados pelo corretor", () => {
    const msg = mensagemConfirmacaoVisita(base, "2026-08-22", "10:00");
    expect(msg).toContain("sábado, 22/08/2026, às 10:00");
    expect(msg).toContain("Pode me confirmar se continua tudo certo?");
  });
});

describe("sugestaoRespostaModelo", () => {
  const comSugestao = (
    sugestaoIa: NonNullable<Imovel["tentativas"]>[number]["sugestaoIa"],
    data = "2026-07-30T14:55",
  ): Imovel => ({
    ...base,
    tentativas: [{ id: "t1", data, canal: "WhatsApp", resultado: "respondeu", sugestaoIa }],
  });

  it("sem tentativas ou sem classificação, não sugere nada", () => {
    expect(sugestaoRespostaModelo(base)).toBeNull();
    expect(
      sugestaoRespostaModelo({
        ...base,
        tentativas: [{ id: "t1", data: "2026-07-30T14:55", canal: "WhatsApp", resultado: "respondeu" }],
      }),
    ).toBeNull();
  });

  it("motivo de perda encerra: sugere resposta de encerramento, mesmo com resultado 'respondeu'", () => {
    const imovel = comSugestao({
      resultado: "respondeu",
      resumo: "Não é mais dono.",
      motivoPerda: "Não é mais o proprietário",
    });
    expect(sugestaoRespostaModelo(imovel)).toBe("resposta-encerramento");
  });

  it("mapeia cada desfecho para a réplica adequada", () => {
    expect(sugestaoRespostaModelo(comSugestao({ resultado: "agendou", resumo: "" }))).toBe(
      "resposta-agendamento",
    );
    expect(sugestaoRespostaModelo(comSugestao({ resultado: "vai-retornar", resumo: "" }))).toBe(
      "resposta-aguardo",
    );
    expect(sugestaoRespostaModelo(comSugestao({ resultado: "recusou", resumo: "" }))).toBe(
      "resposta-encerramento",
    );
    expect(sugestaoRespostaModelo(comSugestao({ resultado: "numero-errado", resumo: "" }))).toBe(
      "resposta-engano",
    );
  });

  it("'respondeu' genérico (sem motivo) não tem réplica pronta — fica para a camada 2", () => {
    expect(sugestaoRespostaModelo(comSugestao({ resultado: "respondeu", resumo: "Tem estacionamento?" }))).toBeNull();
  });

  it("usa a classificação MAIS RECENTE, e um follow-up manual posterior não a apaga", () => {
    const imovel: Imovel = {
      ...base,
      tentativas: [
        {
          id: "t1",
          data: "2026-07-20T10:00",
          canal: "WhatsApp",
          resultado: "agendou",
          sugestaoIa: { resultado: "agendou", resumo: "Marcou visita." },
        },
        {
          id: "t2",
          data: "2026-07-28T09:00",
          canal: "WhatsApp",
          resultado: "recusou",
          sugestaoIa: { resultado: "recusou", resumo: "Desistiu." },
        },
        // Follow-up manual depois, sem sugestaoIa: não deve zerar a leitura acima.
        { id: "t3", data: "2026-07-29T08:00", canal: "WhatsApp", resultado: "sem-resposta" },
      ],
    };
    expect(sugestaoRespostaModelo(imovel)).toBe("resposta-encerramento");
  });

  it("todos os modelos de resposta existem no seletor e geram texto", () => {
    for (const id of ["resposta-encerramento", "resposta-aguardo", "resposta-agendamento", "resposta-engano"]) {
      expect(rotuloModeloWhatsapp(id)).not.toBe("");
      expect(mensagemWhatsapp(id, base).length).toBeGreaterThan(0);
    }
  });

  it("réplicas ao proprietário não são contato de captação (não registram tentativa)", () => {
    for (const id of ["resposta-encerramento", "resposta-aguardo", "resposta-agendamento", "resposta-engano"]) {
      expect(ehContatoDeCaptacao(id)).toBe(false);
    }
  });

  it("a réplica de engano não cita o proprietário nem o imóvel", () => {
    const msg = mensagemWhatsapp("resposta-engano", base);
    expect(msg).not.toContain("Marta");
    expect(msg).not.toContain("Haddock");
  });

  /* --- Nenhuma réplica cumprimenta ----------------------------------------
     O corretor apontou no LD-185 (04/08/2026): depois de cinco mensagens
     trocadas no mesmo dia, a réplica sugerida abria com "Olá, Johann Diego
     Lima dos Santos!". Quem responde emenda no que a pessoa disse — saudação
     no meio de conversa viva é a marca do robô que não leu nada. */
  const REPLICAS = [
    "resposta-encerramento",
    "resposta-aguardo",
    "resposta-agendamento",
    "resposta-engano",
    "resposta-outro-contato",
  ];

  it("nenhuma réplica começa com saudação", () => {
    for (const id of REPLICAS) {
      const msg = mensagemWhatsapp(id, base);
      expect(msg).not.toMatch(/^(Olá|Oi|Bom dia|Boa tarde|Boa noite)/i);
      expect(msg).not.toContain("Tudo bem?");
    }
  });

  it("o vocativo usa só o PRIMEIRO nome, não o nome do cadastro inteiro", () => {
    const nomeInteiro = { ...base, proprietarioNome: "Johann Diego Lima dos Santos" };
    const msg = mensagemWhatsapp("resposta-aguardo", nomeInteiro);
    expect(msg).toContain("Johann");
    expect(msg).not.toContain("Johann Diego Lima dos Santos");
  });

  it("sem nome cadastrado, a frase fecha sem vocativo solto", () => {
    const semNome = { ...base, proprietarioNome: "" };
    for (const id of REPLICAS) {
      const msg = mensagemWhatsapp(id, semNome);
      // O bug clássico do vocativo opcional: "Combinado, , fico no aguardo".
      expect(msg).not.toContain(", ,");
      expect(msg).not.toMatch(/,\s*!/);
    }
  });
});

describe("modelos personalizados do usuário", () => {
  it("tokeniza o nome do proprietário atual ao salvar", () => {
    const texto = "Olá, Marta! Sem problemas, retomo o contato com você em duas semanas.";
    expect(tokenizarModeloUsuario(texto, base)).toBe(
      "Olá, {nome}! Sem problemas, retomo o contato com você em duas semanas.",
    );
  });

  it("não tokeniza quando o imóvel não tem nome de proprietário", () => {
    const texto = "Olá! Retomo o contato depois.";
    expect(tokenizarModeloUsuario(texto, { ...base, proprietarioNome: null })).toBe(texto);
  });

  it("aplica o modelo preenchendo {nome} com o proprietário do imóvel", () => {
    const modelo = "Olá, {nome}! Retomo o contato depois.";
    expect(aplicarModeloUsuario(modelo, { ...base, proprietarioNome: "João" })).toBe(
      "Olá, João! Retomo o contato depois.",
    );
  });

  it("sem nome, limpa a vírgula solta da saudação", () => {
    const modelo = "Olá, {nome}! Retomo o contato depois.";
    expect(aplicarModeloUsuario(modelo, { ...base, proprietarioNome: "" })).toBe(
      "Olá! Retomo o contato depois.",
    );
  });

  it("preenche {imovel} com a referência de endereço/bairro", () => {
    expect(aplicarModeloUsuario("Sobre {imovel}.", base)).toBe(
      "Sobre seu imóvel (Rua Haddock Lobo, 55, Cerqueira César).",
    );
  });

  it("preenche {endereco} só com a rua/número do imóvel", () => {
    expect(aplicarModeloUsuario("Confirma o endereço {endereco}?", base)).toBe(
      "Confirma o endereço Rua Haddock Lobo, 55?",
    );
  });

  it("tokeniza também o endereço ao salvar", () => {
    const texto = "Oi Marta, o imóvel na Rua Haddock Lobo, 55 já está no ar.";
    expect(tokenizarModeloUsuario(texto, base)).toBe(
      "Oi {nome}, o imóvel na {endereco} já está no ar.",
    );
  });

  it("{nome} e {endereco} se adaptam ao reusar em outro imóvel (ida e volta)", () => {
    const editado = "Oi Marta, confirma o endereço Rua Haddock Lobo, 55?";
    const modelo = tokenizarModeloUsuario(editado, base);
    expect(modelo).toBe("Oi {nome}, confirma o endereço {endereco}?");
    const outro = { ...base, proprietarioNome: "Ana", endereco: "Av. Brasil, 900" };
    expect(aplicarModeloUsuario(modelo, outro)).toBe("Oi Ana, confirma o endereço Av. Brasil, 900?");
  });

  it("salvar e reusar em outro contato adapta a saudação (ida e volta)", () => {
    const editado = "Olá, Marta! Sem problemas, falo com você mais para frente.";
    const modelo = tokenizarModeloUsuario(editado, base);
    const paraOutro = aplicarModeloUsuario(modelo, { ...base, proprietarioNome: "Carlos" });
    expect(paraOutro).toBe("Olá, Carlos! Sem problemas, falo com você mais para frente.");
  });
});

describe("avisoAoSalvarModelo", () => {
  it("confirma (ok) quando o nome e o endereço viraram marcadores", () => {
    const aviso = avisoAoSalvarModelo("Olá, {nome}! Sobre {endereco}.");
    expect(aviso.ok).toBe(true);
    expect(aviso.mensagem).toContain("{nome}");
    expect(aviso.mensagem).toContain("{endereco}");
  });

  it("confirma (ok) quando ao menos o nome virou {nome}", () => {
    expect(avisoAoSalvarModelo("Olá, {nome}!").ok).toBe(true);
  });

  it("avisa (não ok) quando o nome não virou {nome}, mesmo com {endereco}", () => {
    const aviso = avisoAoSalvarModelo("Confirma o endereço {endereco}?");
    expect(aviso.ok).toBe(false);
    expect(aviso.mensagem).toContain("botão {nome}");
  });

  it("avisa (não ok) quando o texto não tem nenhum marcador", () => {
    expect(avisoAoSalvarModelo("Olá, tudo bem?").ok).toBe(false);
  });

  it("o resultado da tokenização casa com o aviso (nome detectado no texto real)", () => {
    const ok = avisoAoSalvarModelo(tokenizarModeloUsuario("Olá, Marta! Sobre a Rua Haddock Lobo, 55.", base));
    expect(ok.ok).toBe(true);
    const semNome = avisoAoSalvarModelo(tokenizarModeloUsuario("Olá, Sr. proprietário! Tudo bem?", base));
    expect(semNome.ok).toBe(false);
  });
});

describe("linkWhatsapp", () => {
  it("monta o wa.me com DDI 55 e a mensagem url-encoded", () => {
    const link = linkWhatsapp(base, "Olá, Marta!");
    expect(link).toBe("https://wa.me/5511988880002?text=Ol%C3%A1%2C%20Marta!");
  });

  it("telefone já com DDI não ganha 55 de novo", () => {
    const link = linkWhatsapp({ ...base, proprietarioTelefone: "+55 11 98888-0002" }, "oi");
    expect(link).toBe("https://wa.me/5511988880002?text=oi");
  });

  it("sem telefone retorna null", () => {
    expect(linkWhatsapp({ ...base, proprietarioTelefone: null }, "oi")).toBeNull();
    expect(linkWhatsapp({ ...base, proprietarioTelefone: "sem número" }, "oi")).toBeNull();
  });
});

describe("numeroEvolution", () => {
  it("normaliza o telefone digitado para só dígitos com DDI", () => {
    expect(numeroEvolution("(11) 98888-0002")).toBe("5511988880002");
    expect(numeroEvolution("+55 11 98888-0002")).toBe("5511988880002");
    expect(numeroEvolution(" 43 9 8888-7777 ")).toBe("5543988887777");
  });

  it("aceita celular com e sem o nono dígito, e fixo", () => {
    expect(numeroEvolution("5543988887777")).toBe("5543988887777");
    expect(numeroEvolution("554332221111")).toBe("554332221111");
  });

  it("aceita celular cujo jid do WhatsApp não tem o nono dígito", () => {
    // Caso real (Londrina): 554398024316 é uma conta de WhatsApp que existe, e
    // é o jid canônico do número — exigir "9 dígitos começando em 9" recusava
    // um número que funciona. Quem confere existência é a rota de envio.
    expect(numeroEvolution("43 9802-4316")).toBe("554398024316");
    expect(numeroEvolution("5543998024316")).toBe("5543998024316");
  });

  it("recusa o que não dá para enviar — resta o wa.me/copiar", () => {
    expect(numeroEvolution(null)).toBeNull();
    expect(numeroEvolution("")).toBeNull();
    expect(numeroEvolution("sem número")).toBeNull();
    expect(numeroEvolution("5511")).toBeNull();
    expect(numeroEvolution("5511988880002999")).toBeNull();
    expect(numeroEvolution("5501988887777")).toBeNull(); // DDD com 0
    expect(numeroEvolution("5510988887777")).toBeNull(); // DDD com 0
  });

  it("número estrangeiro passa no formato — quem barra é a consulta ao WhatsApp", () => {
    // telefoneWhatsapp() prefixa 55 em qualquer número de 10–11 dígitos, então
    // este vira 5514155552671 e PARECE um DDD 14 legítimo: nenhuma regex
    // distingue. A rota consulta /chat/whatsappNumbers e ele volta exists:false,
    // virando "sem-whatsapp" em vez de mensagem para um estranho.
    expect(telefoneWhatsapp("+1 415 555 2671")).toBe("5514155552671");
    expect(numeroEvolution("+1 415 555 2671")).toBe("5514155552671");
  });

  it("concorda com o wa.me: se dá para enviar direto, dá para abrir o link", () => {
    for (const tel of ["(11) 98888-0002", "+55 11 98888-0002", "4332221111"]) {
      expect(numeroEvolution(tel)).not.toBeNull();
      expect(linkWhatsapp({ ...base, proprietarioTelefone: tel }, "oi")).toContain(numeroEvolution(tel)!);
    }
  });
});

describe("mensagemFalhaEnvio", () => {
  it("toda falha tem texto em pt-BR", () => {
    const falhas: FalhaEnvio[] = [
      "sem-telefone",
      "numero-invalido",
      "sem-whatsapp",
      "instancia-desconectada",
      "nao-configurado",
      "sem-instancia",
      "sessao-expirada",
      "sem-permissao",
      "imovel-nao-encontrado",
      "falha-evolution",
      "sem-conexao",
    ];
    for (const f of falhas) {
      expect(mensagemFalhaEnvio(f).length).toBeGreaterThan(0);
    }
  });

  it("ambiente sem envio e conta sem número dizem coisas diferentes", () => {
    // "nao-configurado" manda procurar configuração de servidor; "sem-instancia"
    // é a conta sem número próprio, que se resolve cadastrando a linha do
    // corretor. Juntar as duas manda ele caçar o problema errado.
    expect(mensagemFalhaEnvio("sem-instancia")).not.toBe(mensagemFalhaEnvio("nao-configurado"));
    expect(mensagemFalhaEnvio("sem-instancia")).toContain("Sua conta");
  });

  it("sessão expirada e token recusado dizem coisas diferentes", () => {
    // Um o corretor resolve relogando; o outro é o token da Evolution, que só
    // o admin troca. Trocar as mensagens manda ele caçar o problema errado.
    expect(mensagemFalhaEnvio("sessao-expirada")).not.toBe(mensagemFalhaEnvio("sem-permissao"));
    expect(mensagemFalhaEnvio("sessao-expirada")).toContain("Entre novamente");
  });

  it("falha desconhecida não deixa a UI sem texto", () => {
    expect(mensagemFalhaEnvio("qualquer-coisa" as FalhaEnvio)).toBe(mensagemFalhaEnvio("falha-evolution"));
  });
});

describe("ehContatoDeCaptacao", () => {
  it("os modelos que abrem ou reabrem a conversa contam como captação", () => {
    // São os que buscam o sim do proprietário — enviá-los registra tentativa,
    // e é o que preenche a forma de abordagem e dá ao webhook o que fechar.
    expect(ehContatoDeCaptacao("primeiro-contato")).toBe(true);
    expect(ehContatoDeCaptacao("retomada-contato")).toBe(true);
    expect(ehContatoDeCaptacao("renovacao-angariacao")).toBe(true);
    expect(ehContatoDeCaptacao("confirmacao-endereco")).toBe(true);
  });

  it("os operacionais ficam de fora — tratam de passo já combinado", () => {
    for (const id of ["confirmacao-visita", "cobranca-documentacao", "inicio-divulgacao", "imovel-locado"]) {
      expect(ehContatoDeCaptacao(id)).toBe(false);
    }
  });

  it("id desconhecido não vira captação por acidente", () => {
    expect(ehContatoDeCaptacao("")).toBe(false);
    expect(ehContatoDeCaptacao("modelo-que-nao-existe")).toBe(false);
  });

  it("toda a lista de captação existe entre os modelos do sistema", () => {
    // Um id com erro de digitação aqui sairia do ar em silêncio: o modelo
    // continuaria enviando e simplesmente nunca registraria tentativa.
    const ids = MODELOS_WHATSAPP.map((m) => m.id);
    for (const id of MODELOS_CAPTACAO) expect(ids).toContain(id);
  });
});

describe("enderecoComUnidade", () => {
  const ap: Imovel = { ...base, endereco: "Rua Ulrico Zuínglio, 320", unidade: "806", bloco: "B" };

  it("inclui ap e bloco — sem eles a mensagem cita o endereço do PRÉDIO", () => {
    expect(enderecoComUnidade(ap)).toBe("Rua Ulrico Zuínglio, 320, ap 806, bloco B");
  });

  it("sem unidade, continua sendo só a rua", () => {
    expect(enderecoComUnidade(base)).toBe("Rua Haddock Lobo, 55");
  });

  it("não duplica o prefixo quando o corretor já digitou 'ap 806'", () => {
    expect(enderecoComUnidade({ ...ap, unidade: "ap 806", bloco: "bloco B" })).toBe(
      "Rua Ulrico Zuínglio, 320, ap 806, bloco B",
    );
  });

  it("sala comercial não vira 'ap'", () => {
    expect(enderecoComUnidade({ ...ap, tipo: "Sala Comercial", bloco: "" })).toContain("sala 806");
  });

  it("sem endereço devolve vazio — quem chama decide o fallback", () => {
    expect(enderecoComUnidade({ ...base, endereco: "" })).toBe("");
  });
});

describe("unidade nas mensagens", () => {
  const ap: Imovel = { ...base, endereco: "Rua Ulrico Zuínglio, 320", unidade: "806", bloco: "B" };

  it("os modelos do sistema citam a unidade", () => {
    expect(mensagemWhatsapp("primeiro-contato", ap)).toContain("ap 806");
  });

  it("a confirmação de endereço traz unidade e edifício, para ele corrigir", () => {
    const msg = mensagemWhatsapp("confirmacao-endereco", { ...ap, edificio: "Ed. Solar" });
    expect(msg).toContain("ap 806");
    expect(msg).toContain("Ed. Solar");
  });

  it("o marcador {endereco} do modelo do corretor também leva a unidade", () => {
    expect(aplicarModeloUsuario("Sobre o imóvel na {endereco}, tudo bem?", ap)).toBe(
      "Sobre o imóvel na Rua Ulrico Zuínglio, 320, ap 806, bloco B, tudo bem?",
    );
  });

  it("ao salvar o modelo, o ap NÃO fica gravado no texto", () => {
    // Senão o apartamento deste proprietário seguiria para todos os próximos.
    const texto = "Sobre o imóvel na Rua Ulrico Zuínglio, 320, ap 806, bloco B, tudo bem?";
    const salvo = tokenizarModeloUsuario(texto, ap);
    expect(salvo).toBe("Sobre o imóvel na {endereco}, tudo bem?");
    expect(salvo).not.toContain("806");
  });
});

/* A réplica de "outra pessoa atendeu". Antes este caso caía em
   "resposta-engano" junto com o engano de verdade, e o app pedia desculpas a
   quem tinha acabado de entregar o caminho para o proprietário — foi o LD-55
   ("Alexandre Marcos é meu pai" + telefone) e o LD-90. */
describe("sugestaoRespostaModelo — outro contato", () => {
  const comSugestao = (resultado: string): Imovel => ({
    id: "oc1",
    endereco: "Rua A",
    status: "Novo contato",
    tentativas: [
      {
        id: "t1",
        data: "2026-07-31T15:55",
        canal: "WhatsApp",
        resultado: "sem-resposta",
        aguardandoResultado: true,
        sugestaoIa: {
          resultado: resultado as never,
          resumo: "quem atendeu não é o dono",
          retomarEm: null,
          horaRetomar: null,
          motivoPerda: null,
        },
      },
    ],
  });

  it("pede o contato do dono em vez de desculpar engano", () => {
    expect(sugestaoRespostaModelo(comSugestao("outro-contato"))).toBe("resposta-outro-contato");
  });

  it("engano de verdade continua desculpando", () => {
    expect(sugestaoRespostaModelo(comSugestao("numero-errado"))).toBe("resposta-engano");
  });

  it("suprime a sugestão antiga quando a conversa diz que ela é a responsável — LD-247", () => {
    const imovel = comSugestao("outro-contato");
    imovel.notas = [
      { id: "wa:1", data: "2026-08-20T09:12", texto: "Resposta no WhatsApp: Bom dia, sou a responsável" },
      { id: "wa:2", data: "2026-08-20T09:21", texto: "Resposta no WhatsApp: Tenho sim" },
    ];
    expect(sugestaoRespostaModelo(imovel)).toBeNull();
  });

  it("o texto agradece e pede o contato, sem repetir endereço nem nome", () => {
    const texto = mensagemWhatsapp("resposta-outro-contato", comSugestao("outro-contato"));
    expect(texto).toMatch(/obrigado/i);
    expect(texto).toMatch(/contato de quem cuida/i);
    expect(texto).not.toMatch(/Rua A/);
  });
});
