import { describe, expect, it } from "vitest";
import { dataHoraRetomadaParaIso, dataPadraoRetomada, textoInicialRetomada, resolverContextoMensagem, validarFormularioRetomada, validarImovelRetomada } from "@/lib/calculo/retomada";
import { classificarTipoParaEnvio, ehTipoMensagemComum } from "@/lib/mensagensAgendadas";
import { retomadaB4Habilitada } from "@/lib/retomadaConfig";
import { readFileSync } from "node:fs";

describe("B4: contratos puros", () => {
  it("fronteiras B4 não importam emissores, worker ou webhook nem apontam ao endpoint de envio", () => {
    for (const arquivo of ["../app/api/retomadas/route.ts", "../lib/servidor/retomada.ts", "../lib/retomadaCliente.ts", "../components/modais/ModalRetomada.tsx"]) {
      const codigo = readFileSync(new URL(arquivo, import.meta.url), "utf8");
      expect(codigo).not.toMatch(/(?:from|import\()\s*["'][^"']*(?:envioWhatsapp|envioMensagemAgendada|webhook|cron\/mensagens)/);
      expect(codigo).not.toMatch(/\/api\/(?:whatsapp\/enviar|cron\/mensagens|whatsapp\/webhook)/);
    }
  });
  it.each([
    ["Alexandre Silva", "Rua Tijuca, 112", "Olá, Alexandre! Tudo bem?", "da Rua Tijuca, 112"],
    [null, "Rua Tijuca, 112", "Olá! Tudo bem?", "da Rua Tijuca, 112"],
    ["Alexandre Silva", null, "Olá, Alexandre! Tudo bem?", "em questão"],
    [null, null, "Olá! Tudo bem?", "em questão"],
  ])("default aprovado: nome=%s / endereço=%s", (nome, endereco, saudacao, referencia) => {
    expect(textoInicialRetomada({ proprietario_nome: nome, endereco })).toBe(`${saudacao} Estou retomando nosso contato sobre o imóvel ${referencia}. Gostaria de saber se ele continua fora de disponibilidade ou se podemos conversar novamente sobre a possibilidade de anunciá-lo conosco.`);
  });
  it("default é determinístico, sem tempo, inferência ou dados fora do contrato", () => {
    const contexto = { proprietario_nome: "  Érica  Souza ", endereco: " Rua Tijuca,112, Centro, Londrina ", telefone: "43999990000", codigo: "LD-901", bairro: "Centro", cidade: "Londrina", observacao: "Nome inventado" };
    const texto = textoInicialRetomada(contexto);
    expect(textoInicialRetomada(contexto)).toBe(texto);
    expect(texto).toContain("Olá, Érica! Tudo bem?");
    expect(texto).toContain("imóvel da Rua Tijuca, 112.");
    expect(texto).not.toMatch(/há alguns dias|43999990000|LD-901|Centro|Londrina|Nome inventado/);
  });
  it.each(["", "  ", "123", "Proprietário", "Sem nome", "Sr. Alexandre"])("nome inválido %s não vira vocativo", (nome) => {
    expect(textoInicialRetomada({ proprietario_nome: nome })).toBe("Olá! Tudo bem? Estou retomando nosso contato sobre o imóvel em questão. Gostaria de saber se ele continua fora de disponibilidade ou se podemos conversar novamente sobre a possibilidade de anunciá-lo conosco.");
  });
  it.each([
    ["Avenida Brasil, 20", "da Avenida Brasil, 20"],
    ["Beco Azul 20", "do Beco Azul, 20"],
    ["Rua Tijuca", "em questão"],
    ["112", "em questão"],
    ["", "em questão"],
  ])("referência usa apenas logradouro e número: %s", (endereco, referencia) => {
    expect(textoInicialRetomada({ proprietario_nome: null, endereco })).toContain(`sobre o imóvel ${referencia}.`);
  });
  it.each(["CI", "VERCEL", "VERCEL_ENV"])("presença de %s bloqueia qualquer valor, inclusive undefined", (chave) => {
    for (const valor of ["", "0", "false", " ", undefined]) {
      expect(retomadaB4Habilitada({ NODE_ENV: "development", RETOMADA_B4_LOCAL: "1", [chave]: valor })).toBe(false);
    }
  });
  it.each(["0", "true", "01", " 1", "1 "])("flag não habilita valor diferente de 1 literal: %s", (valor) => {
    expect(retomadaB4Habilitada({ NODE_ENV: "development", RETOMADA_B4_LOCAL: valor })).toBe(false);
  });
  it("guard comum exclui retomada e valores desconhecidos", () => {
    expect(ehTipoMensagemComum("livre")).toBe(true);
    expect(ehTipoMensagemComum("verificacao-disponibilidade")).toBe(true);
    for (const tipo of ["retomada-retirado", "retomada", null, "Livre"]) expect(ehTipoMensagemComum(tipo)).toBe(false);
    expect(classificarTipoParaEnvio("retomada-retirado")).toBe("retomada-bloqueada");
  });
  it("resolve mensagem comum, criação explícita e edição persistida", () => {
    expect(resolverContextoMensagem({})).toEqual({ modo: "comum", tipo: "livre" });
    expect(resolverContextoMensagem({ retomadaImovelId: "i" })).toEqual({ modo: "retomada", retomadaImovelId: "i" });
    expect(resolverContextoMensagem({ persistida: { tipo: "retomada-retirado", imovelId: "i", agendaId: null } })).toEqual({ modo: "retomada", retomadaImovelId: "i" });
  });
  it("não converte por texto/telefone e rejeita identidades concorrentes", () => {
    for (const entrada of [
      { tipo: "retomada-retirado" as const },
      { retomadaImovelId: "" },
      { tipo: "retomada-retirado" as const, persistida: { tipo: "livre", imovelId: "i", agendaId: null } },
      { retomadaImovelId: "i", imovelIdRelacionado: "i" },
      { retomadaImovelId: "i", agendaIdRelacionado: "a" },
      { retomadaImovelId: "i", tipo: "livre" as const },
      { retomadaImovelId: "i", persistida: { tipo: "livre", imovelId: "i", agendaId: null } },
      { retomadaImovelId: "i", persistida: { tipo: "retomada-retirado", imovelId: "outro", agendaId: null } },
      { persistida: { tipo: "retomada-retirado", imovelId: null, agendaId: null } },
    ]) expect(resolverContextoMensagem(entrada)).toEqual({ modo: "invalido" });
  });
  it("legado sem metadados da retirada é elegível, mas ativo, status indevido ou sem telefone falham", () => {
    const imovel = { retirado: true, status: "Publicado", proprietario_telefone: "43999990000" };
    expect(validarImovelRetomada(imovel)).toBeNull();
    expect(validarImovelRetomada(null)).toBe("imovel-inexistente");
    expect(validarImovelRetomada({ ...imovel, retirado: false })).toBe("imovel-nao-retirado");
    expect(validarImovelRetomada({ ...imovel, status: "Locado" })).toBe("estado-incompativel");
    expect(validarImovelRetomada({ ...imovel, proprietario_telefone: null })).toBe("destinatario-ausente");
  });
  it("sugere 6 meses 09h em Brasília, com atalhos e limites de mês", () => {
    const agora = Date.UTC(2026, 9, 5, 1); // ainda 04/10 em Brasília
    expect(dataPadraoRetomada(undefined, agora)).toEqual({ data: "2027-04-04", hora: "09:00" });
    expect(dataPadraoRetomada(3, agora).data).toBe("2027-01-04");
    expect(dataPadraoRetomada(12, agora).data).toBe("2027-10-04");
    expect(dataPadraoRetomada(6, Date.UTC(2026, 7, 31, 12)).data).toBe("2027-02-28");
    expect(dataPadraoRetomada(6, Date.UTC(2027, 7, 31, 12)).data).toBe("2028-02-29");
  });
  it("valida data civil, hora, futuro e texto sem depender do fuso da máquina", () => {
    const agora = Date.UTC(2026, 9, 4, 12);
    expect(dataHoraRetomadaParaIso("2027-04-04", "09:00")).toBe("2027-04-04T12:00:00.000Z");
    for (const [data, hora] of [["2027-02-30", "09:00"], ["2027-04-04", "24:00"], ["2026-10-04", "09:00"], ["", "09:00"]]) expect(validarFormularioRetomada(data, hora, "Olá", agora)).toBe("data-invalida");
    expect(validarFormularioRetomada("2027-04-04", "09:00", "  ", agora)).toBe("texto-ausente");
  });
  it("flag exige ON literal local; Preview e Production negam mesmo com opt-in", () => {
    expect(retomadaB4Habilitada({})).toBe(false);
    expect(retomadaB4Habilitada({ NODE_ENV: "development" })).toBe(false);
    const local = { NODE_ENV: "development", RETOMADA_B4_LOCAL: "1" };
    expect(retomadaB4Habilitada(local)).toBe(true);
    for (const ambiente of [{ ...local, VERCEL_ENV: "preview" }, { ...local, VERCEL_ENV: "production" }, { ...local, VERCEL: "1" }, { ...local, NODE_ENV: "production" }, { ...local, CI: "1" }]) expect(retomadaB4Habilitada(ambiente)).toBe(false);
  });
});
