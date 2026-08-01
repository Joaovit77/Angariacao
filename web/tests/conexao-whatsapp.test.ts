/* Conexão do WhatsApp (lib/calculo/conexaoWhatsapp) — as partes puras.

   O que estes testes guardam são as duas regras que evitam o pior
   comportamento possível desta tela: exibir QR na hora errada (o que
   derruba a sessão que estava subindo) e martelar a Evolution com
   consultas quando não há nada a esperar — a mesma instância que
   precisa estar livre para mandar mensagem. */
import { describe, expect, it } from "vitest";
import {
  deveMostrarQr,
  intervaloConsultaMs,
  mensagemConexao,
  qrParaImagem,
  traduzirEstado,
  type EstadoConexao,
} from "@/lib/calculo/conexaoWhatsapp";

describe("traduzirEstado", () => {
  it("só `open` significa conectado", () => {
    expect(traduzirEstado("open")).toBe("conectado");
    expect(traduzirEstado("OPEN")).toBe("conectado");
    expect(traduzirEstado("connecting")).toBe("conectando");
    expect(traduzirEstado("close")).toBe("desconectado");
  });

  it("estado desconhecido vira desconectado, não falha", () => {
    /* Um estado novo que a Evolution invente significa, na prática,
       "não está pronto para enviar" — e a ação certa para o corretor
       continua sendo reconectar, não abrir chamado. Traduzir para
       "falha" o mandaria pedir ajuda quando ele mesmo resolveria. */
    expect(traduzirEstado("algo-novo")).toBe("desconectado");
    expect(traduzirEstado(null)).toBe("desconectado");
    expect(traduzirEstado(undefined)).toBe("desconectado");
    expect(traduzirEstado("")).toBe("desconectado");
  });
});

describe("deveMostrarQr", () => {
  it("mostra só quando desconectado E o código veio", () => {
    expect(deveMostrarQr("desconectado", "abc")).toBe(true);
    expect(deveMostrarQr("desconectado", null)).toBe(false);
    expect(deveMostrarQr("desconectado", "")).toBe(false);
  });

  it("NÃO mostra enquanto está conectando, mesmo com código em mãos", () => {
    /* A regra que evita o pior caso da tela: em "conectando" o QR já
       foi lido e a sessão está subindo. Exibir outro faria o corretor
       escanear de novo, e o segundo pareamento derruba o primeiro —
       ele ficaria num laço sem entender por que nunca conecta. */
    expect(deveMostrarQr("conectando", "abc")).toBe(false);
  });

  it("não mostra nos estados em que QR não resolve nada", () => {
    for (const e of ["conectado", "sem-instancia", "nao-configurado", "falha"] as EstadoConexao[]) {
      expect(deveMostrarQr(e, "abc"), e).toBe(false);
    }
  });
});

describe("intervaloConsultaMs", () => {
  it("consulta rápido só enquanto há algo mudando", () => {
    expect(intervaloConsultaMs("desconectado")).toBe(3000);
    expect(intervaloConsultaMs("conectando")).toBe(3000);
  });

  it("conectado consulta devagar", () => {
    // A tela só confirma algo que já vale, e cada consulta ocupa a
    // instância que precisa estar livre para enviar.
    expect(intervaloConsultaMs("conectado")).toBeGreaterThan(intervaloConsultaMs("desconectado"));
  });

  it("para de consultar quando insistir não muda nada", () => {
    // Sem instância cadastrada ou sem Evolution no ambiente, repetir a
    // pergunta é gastar chamada para receber sempre a mesma resposta.
    expect(intervaloConsultaMs("sem-instancia")).toBe(0);
    expect(intervaloConsultaMs("nao-configurado")).toBe(0);
    expect(intervaloConsultaMs("falha")).toBe(0);
  });
});

describe("qrParaImagem", () => {
  it("aceita base64 cru e já prefixado", () => {
    // A Evolution devolve os dois formatos conforme a versão; fixar um
    // só deixaria a imagem quebrada aparecer apenas em produção.
    expect(qrParaImagem("AAAA")).toBe("data:image/png;base64,AAAA");
    expect(qrParaImagem("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });

  it("vazio vira null, nunca string vazia", () => {
    // `<img src="">` faz o browser requisitar a própria página e sujar
    // o console com erro.
    expect(qrParaImagem("")).toBeNull();
    expect(qrParaImagem(null)).toBeNull();
    expect(qrParaImagem("   ")).toBeNull();
  });
});

describe("mensagemConexao", () => {
  it("todo estado tem frase, e nenhuma é vazia", () => {
    const estados: EstadoConexao[] = [
      "conectado",
      "desconectado",
      "conectando",
      "sem-instancia",
      "nao-configurado",
      "falha",
    ];
    for (const e of estados) expect(mensagemConexao(e).trim(), e).not.toBe("");
  });

  it("sem instância manda falar com o responsável, não oferece QR", () => {
    // Quem resolve esse caso é o admin (cadastrar a instância), não o
    // corretor — oferecer um código que não existe só o faria esperar.
    expect(mensagemConexao("sem-instancia")).toMatch(/responsável/i);
  });
});
