/* Documentos legais (lib/legal) — o que precisa estar certo ANTES de
   oferecer o sistema a terceiros.

   Estes testes não julgam o mérito jurídico do texto (isso é revisão de
   advogado). Eles guardam o que é verificável por máquina e o que some
   sem ninguém notar: identificação do responsável em branco, versão
   fora de formato, e a coerência entre o que os dois documentos dizem
   e o que o sistema realmente faz. */
import { describe, expect, it } from "vitest";
import { IDENTIDADE, VERSAO_TERMOS, identidadeIncompleta, legalPublicavel } from "@/lib/legal/identidade";
import { PRIVACIDADE, TERMOS } from "@/lib/legal/conteudo";

const TEXTO_INTEIRO = [PRIVACIDADE, TERMOS]
  .flatMap((d) => d.secoes.flatMap((s) => [s.titulo, ...s.paragrafos]))
  .join("\n");

describe("identidade", () => {
  it("aponta exatamente os campos ainda em branco", () => {
    // Enquanto houver "PENDENTE", a página avisa em vez de exibir o
    // marcador no meio de um parágrafo como se fosse conteúdo.
    const faltando = identidadeIncompleta();
    for (const campo of faltando) {
      expect(IDENTIDADE[campo as keyof typeof IDENTIDADE]).toBe("PENDENTE");
    }
  });

  it("a versão é uma data ISO — é ela que dá sentido ao aceite", () => {
    expect(VERSAO_TERMOS).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("conteúdo", () => {
  it("nenhuma seção fica sem título ou sem texto", () => {
    for (const doc of [PRIVACIDADE, TERMOS]) {
      expect(doc.secoes.length).toBeGreaterThan(0);
      for (const s of doc.secoes) {
        expect(s.titulo.trim()).not.toBe("");
        expect(s.paragrafos.length).toBeGreaterThan(0);
        for (const p of s.paragrafos) expect(p.trim()).not.toBe("");
      }
    }
  });

  it("os marcadores de negrito são sempre pares", () => {
    // Ímpar deixaria um "**" cru visível no meio do documento — o
    // renderizador quebra a string no marcador e não tem como adivinhar.
    for (const doc of [PRIVACIDADE, TERMOS]) {
      for (const s of doc.secoes) {
        for (const p of s.paragrafos) {
          expect((p.match(/\*\*/g) || []).length % 2, p.slice(0, 60)).toBe(0);
        }
      }
    }
  });

  it("declara todo terceiro que realmente recebe dados", () => {
    /* O teste que mais importa aqui. Uma política que esquece um
       fornecedor não é um texto incompleto — é uma informação errada ao
       titular. Ao ligar uma integração nova, este teste falha até que
       alguém a declare. */
    for (const fornecedor of ["Supabase", "Vercel", "Evolution", "OpenAI", "Google"]) {
      expect(PRIVACIDADE.secoes.some((s) => s.paragrafos.join(" ").includes(fornecedor)), fornecedor).toBe(true);
    }
  });

  it("avisa sobre transferência internacional", () => {
    // OpenAI e Vercel processam fora do Brasil (art. 33 da LGPD).
    expect(TEXTO_INTEIRO).toMatch(/transferência internacional/i);
  });

  it("diz que áudio recebido é transcrito e enviado a terceiro", () => {
    // É o tratamento menos óbvio do sistema e o mais delicado: o áudio
    // que o proprietário gravou sai da nossa infra.
    expect(PRIVACIDADE.secoes.some((s) => /áudio/i.test(s.paragrafos.join(" ")))).toBe(true);
  });

  it("separa os dois papéis: controlador da conta e operador da carteira", () => {
    // A divisão que define quem responde quando um proprietário
    // perguntar de onde veio o telefone dele.
    expect(TEXTO_INTEIRO).toMatch(/CONTROLADOR/);
    expect(TEXTO_INTEIRO).toMatch(/OPERADORA/);
  });

  it("os termos atribuem ao corretor a base legal do dado do proprietário", () => {
    expect(TERMOS.secoes.some((s) => /base legal/i.test(s.paragrafos.join(" ")))).toBe(true);
  });

  it("os dois documentos carimbam a versão vigente", () => {
    expect(PRIVACIDADE.subtitulo).toContain(VERSAO_TERMOS);
    expect(TERMOS.subtitulo).toContain(VERSAO_TERMOS);
  });
});

describe("stand by — a camada legal fica inerte sem identidade", () => {
  it("não é publicável enquanto faltar identificação do responsável", () => {
    /* O contrato do "stand by": exigir aceite de um documento que não
       identifica quem responde nem oferece canal ao titular é colher um
       "eu aceito" que não vale — e ainda trancaria o corretor no meio do
       expediente por causa disso.

       Este teste acompanha o estado real do arquivo: hoje falta o CNPJ,
       então é falso. Ao preencher os três campos ele passa a ser
       verdadeiro, e é ISSO que liga o portão, a caixa no cadastro e os
       links do rodapé. Não há interruptor separado para esquecer de
       virar — a precondição e o gatilho são a mesma coisa. */
    expect(legalPublicavel()).toBe(identidadeIncompleta().length === 0);
  });

  it("os documentos continuam legíveis mesmo em stand by", () => {
    // A URL direta segue servindo para revisão (com o aviso de "não
    // publicável" na própria página). O que fica inerte é a COBRANÇA.
    expect(TERMOS.secoes.length).toBeGreaterThan(0);
    expect(PRIVACIDADE.secoes.length).toBeGreaterThan(0);
  });
});
