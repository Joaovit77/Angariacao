/* Modelos de mensagem de WhatsApp por etapa do funil (lib/calculo/whatsapp).
   Feature nova da pós-migração — não há oráculo do app antigo; os testes
   fixam o contrato: modelo padrão por status, personalização com os dados
   do imóvel e o link wa.me. */
import { describe, expect, it } from "vitest";
import { mensagemRenovacaoAngariacao } from "@/lib/calculo/agenda";
import {
  aplicarModeloUsuario,
  linkWhatsapp,
  mensagemWhatsapp,
  MODELOS_WHATSAPP,
  modeloPadraoWhatsapp,
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
    for (const m of MODELOS_WHATSAPP) {
      if (m.id === "feedback-divulgacao") continue;
      expect(mensagemWhatsapp(m.id, base, "Ana")).toBe(mensagemWhatsapp(m.id, base));
    }
  });

  it("o novo modelo está no seletor", () => {
    expect(MODELOS_WHATSAPP.map((m) => m.id)).toContain("feedback-divulgacao");
  });

  it("renovação de angariação reaproveita a mensagem da Agenda", () => {
    expect(mensagemWhatsapp("renovacao-angariacao", base)).toBe(mensagemRenovacaoAngariacao(base));
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

  it("salvar e reusar em outro contato adapta a saudação (ida e volta)", () => {
    const editado = "Olá, Marta! Sem problemas, falo com você mais para frente.";
    const modelo = tokenizarModeloUsuario(editado, base);
    const paraOutro = aplicarModeloUsuario(modelo, { ...base, proprietarioNome: "Carlos" });
    expect(paraOutro).toBe("Olá, Carlos! Sem problemas, falo com você mais para frente.");
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
