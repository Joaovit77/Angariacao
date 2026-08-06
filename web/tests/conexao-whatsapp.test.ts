/* Conexão do WhatsApp (lib/calculo/conexaoWhatsapp) — as partes puras.

   O que estes testes guardam são as duas regras que evitam o pior
   comportamento possível desta tela: exibir QR na hora errada (o que
   derruba a sessão que estava subindo) e martelar a Evolution com
   consultas quando não há nada a esperar — a mesma instância que
   precisa estar livre para mandar mensagem. */
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  deveMostrarQr,
  intervaloConsultaMs,
  mensagemConexao,
  mensagemConexaoDeTerceiro,
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

/* ------------------------------------------------------------------
   UM CAMINHO SÓ ATÉ A EVOLUTION

   As três sutilezas de `_conexao.ts` foram MEDIDAS contra a Evolution
   real em 01/08/2026, não deduzidas da documentação: o número só vem de
   `fetchInstances` (o `connectionState` não traz `owner`), a resposta
   daquele endpoint INCLUI o token da instância, e o QR aparece em três
   formatos diferentes conforme a versão.

   Uma segunda cópia escrita a partir dos docs nasceria com o campo
   "conectado como…" eternamente vazio — sem erro nenhum, e portanto sem
   ninguém notar. É o mesmo raciocínio de `inserirCompromisso`: o que
   protege não é ter escrito certo uma vez, é não haver um segundo lugar
   onde escrever errado. */
describe("nenhuma rota fala com a Evolution por fora do miolo compartilhado", () => {
  // fileURLToPath, e não `.pathname`: no Windows aquele devolve "/C:/..." e o
  // join monta "C:\C:\..." — o teste quebraria só na máquina do corretor.
  const raiz = fileURLToPath(new URL("..", import.meta.url));

  /* Os nomes vêm do `readdirSync` recursivo, que os devolve relativos à
     pasta E com o separador do sistema. A troca por "/" usa `sep`, e não
     uma regex com barra invertida: no Windows o teste compararia
     "whatsapp\_conexao.ts" com "whatsapp/_conexao.ts" e falharia só lá. */
  const fontes = readdirSync(join(raiz, "app/api"), { recursive: true, encoding: "utf8" })
    .filter((nome) => nome.endsWith(".ts"))
    .map((nome) => ({
      rota: nome.split(sep).join("/"),
      texto: readFileSync(join(raiz, "app/api", nome), "utf8"),
    }));

  /** Quais rotas mencionam um endpoint da Evolution. */
  function quemChama(endpoint: string): string[] {
    return fontes.filter((f) => f.texto.includes(endpoint)).map((f) => f.rota);
  }

  it("só `_conexao.ts` consulta o estado da instância", () => {
    expect(quemChama("instance/connectionState")).toEqual(["whatsapp/_conexao.ts"]);
  });

  it("só `_conexao.ts` pede o QR", () => {
    // Pedir o QR faz a Evolution COMEÇAR a parear. Um segundo lugar que
    // chamasse isso poderia dispará-lo numa varredura, derrubando a
    // sessão de quem estava conectado.
    expect(quemChama("instance/connect/")).toEqual(["whatsapp/_conexao.ts"]);
  });

  it("o endpoint que devolve o token da instância é consultado num lugar só", () => {
    expect(quemChama("instance/fetchInstances")).toEqual(["whatsapp/_conexao.ts"]);
  });
});

/* As duas VOZES do mesmo vocabulário.

   As frases do corretor estão na primeira pessoa ("Seu WhatsApp", "Leia
   o código abaixo com o celular"), e o painel de admin mostra o número
   de OUTRA pessoa. Reusá-las ali produzia "Seu WhatsApp está conectado"
   embaixo da conta de um corretor — numa tela cujo trabalho inteiro é
   não confundir a conta de um com a do outro. No estado desconectado
   era pior: a instrução manda ler o QR com o celular, e quem olha a tela
   não tem o celular certo na mão. */
describe("mensagemConexaoDeTerceiro", () => {
  const ESTADOS: EstadoConexao[] = [
    "conectado",
    "desconectado",
    "conectando",
    "sem-instancia",
    "nao-configurado",
    "falha",
  ];

  it("cobre os mesmos estados da voz do corretor", () => {
    // Estado novo tem que ganhar as DUAS vozes: a que faltar volta a ser
    // `undefined` na tela, sem erro nenhum.
    for (const estado of ESTADOS) {
      expect(mensagemConexaoDeTerceiro(estado)).toBeTruthy();
      expect(mensagemConexao(estado)).toBeTruthy();
    }
  });

  it("nunca fala na primeira pessoa com quem olha a conta alheia", () => {
    for (const estado of ESTADOS) {
      expect(mensagemConexaoDeTerceiro(estado)).not.toMatch(/\bSeu\b|\bSua\b/);
    }
  });

  it("no desconectado, diz de quem é o celular que precisa ler o QR", () => {
    // A frase do corretor manda "leia com o celular"; seguida pelo admin,
    // parearia a instância daquele corretor com o aparelho errado.
    expect(mensagemConexaoDeTerceiro("desconectado")).toContain("DESTE corretor");
  });
});
