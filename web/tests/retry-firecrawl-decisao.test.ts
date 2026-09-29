import { describe, expect, it } from "vitest";
import {
  CAUSAS_REDE_RETRY_FIRECRAWL,
  decidirRetryFirecrawl,
  MAX_TENTATIVAS_FIRECRAWL_COM_RETRY,
  STATUS_HTTP_RETRY_FIRECRAWL,
  type FalhaAquisicaoFirecrawl,
} from "@/lib/calculo/retryFirecrawl";
import { segundosRetryAfter } from "@/lib/calculo/retryAfter";

/* R5: a decisão pura, sem rede nem relógio. Os valores de orçamento seguem
   a rota da Central: 60 s por aquisição e 35 s de reserva. */
const AQUISICAO_MS = 60_000;
const RESERVA_MS = 35_000;
const ORCAMENTO_FOLGADO = 115_000;

function falha(parcial: Partial<FalhaAquisicaoFirecrawl>): FalhaAquisicaoFirecrawl {
  return { codigo: "firecrawl_http_falhou", statusHttp: null, causaRede: null, retryAfterMs: null, ...parcial };
}

function decidir(f: FalhaAquisicaoFirecrawl, extra: Partial<Parameters<typeof decidirRetryFirecrawl>[0]> = {}) {
  return decidirRetryFirecrawl({
    falha: f,
    portal: "olx",
    politicaHabilitada: true,
    tentativa: 1,
    restanteMs: ORCAMENTO_FOLGADO,
    duracaoMaximaTentativaMs: AQUISICAO_MS,
    reservaPosAquisicaoMs: RESERVA_MS,
    jitter: 0.5,
    ...extra,
  });
}

describe("R5: decidirRetryFirecrawl", () => {
  it("as allowlists são exatamente as aprovadas, e o teto é 2", () => {
    expect([...STATUS_HTTP_RETRY_FIRECRAWL].sort()).toEqual([502, 503, 504]);
    expect([...CAUSAS_REDE_RETRY_FIRECRAWL].sort()).toEqual(["EAI_AGAIN", "ECONNRESET", "UND_ERR_SOCKET"]);
    expect(MAX_TENTATIVAS_FIRECRAWL_COM_RETRY).toBe(2);
  });

  it.each([502, 503, 504])("%i repete com espera de ~1 s", (statusHttp) => {
    expect(decidir(falha({ statusHttp }))).toEqual({ retentar: true, motivo: "firecrawl_5xx", esperaMs: 1_000 });
  });

  it.each(["ECONNRESET", "UND_ERR_SOCKET", "EAI_AGAIN"])("rede %s repete", (causaRede) => {
    expect(decidir(falha({ codigo: "firecrawl_indisponivel", causaRede })))
      .toEqual({ retentar: true, motivo: "firecrawl_rede_transitoria", esperaMs: 1_000 });
  });

  it("o jitter fica entre 750 e 1250 ms e nunca zera a espera", () => {
    const espera = (jitter: number) => {
      const decisao = decidir(falha({ statusHttp: 503 }), { jitter });
      return decisao.retentar ? decisao.esperaMs : null;
    };
    expect(espera(0)).toBe(750);
    expect(espera(0.999999)).toBe(1_250);
    expect(espera(-3)).toBe(750);
    expect(espera(7)).toBe(1_250);
    expect(espera(Number.NaN)).toBe(1_000);
  });

  it("429 repete só com Retry-After válido de até 5 s, esperando exatamente ele", () => {
    expect(decidir(falha({ codigo: "firecrawl_429", statusHttp: 429, retryAfterMs: 3_000 })))
      .toEqual({ retentar: true, motivo: "firecrawl_429", esperaMs: 3_000 });
    expect(decidir(falha({ codigo: "firecrawl_429", statusHttp: 429, retryAfterMs: 5_000 })))
      .toMatchObject({ retentar: true, esperaMs: 5_000 });
    expect(decidir(falha({ codigo: "firecrawl_429", statusHttp: 429, retryAfterMs: 0 })))
      .toMatchObject({ retentar: true, esperaMs: 0 });
  });

  it.each([
    ["ausente", null],
    ["acima de 5 s", 5_001],
    ["negativo", -1],
    ["não finito", Number.POSITIVE_INFINITY],
  ])("429 com Retry-After %s não repete", (_nome, retryAfterMs) => {
    expect(decidir(falha({ codigo: "firecrawl_429", statusHttp: 429, retryAfterMs })))
      .toEqual({ retentar: false, motivo: "retry_after_invalido" });
  });

  it.each([400, 401, 402, 403, 404, 408, 409, 422, 425, 500, 501, 505, 599])("HTTP %i não repete", (statusHttp) => {
    expect(decidir(falha({ statusHttp }))).toEqual({ retentar: false, motivo: "falha_nao_transitoria" });
  });

  it.each([
    ["timeout", falha({ codigo: "firecrawl_timeout" })],
    ["ENOTFOUND", falha({ codigo: "firecrawl_indisponivel", causaRede: "ENOTFOUND" })],
    ["ETIMEDOUT fora da allowlist", falha({ codigo: "firecrawl_indisponivel", causaRede: "ETIMEDOUT" })],
    ["rede sem causa", falha({ codigo: "firecrawl_indisponivel" })],
    ["success:false", falha({ codigo: "firecrawl_resposta_falhou", statusHttp: 200 })],
    ["JSON inválido", falha({ codigo: "firecrawl_resposta_invalida", statusHttp: 200 })],
    ["HTML vazio", falha({ codigo: "firecrawl_html_invalido", statusHttp: 200 })],
    ["portal com erro", falha({ codigo: "portal_http_falhou", statusHttp: 200 })],
    ["parser", falha({ codigo: "parser_falhou" })],
    ["status 503 com código de outra falha", falha({ codigo: "portal_http_falhou", statusHttp: 503 })],
  ])("%s não repete", (_nome, f) => {
    expect(decidir(f)).toEqual({ retentar: false, motivo: "falha_nao_transitoria" });
  });

  it("sem política, nunca repete", () => {
    expect(decidir(falha({ statusHttp: 503 }), { politicaHabilitada: false }))
      .toEqual({ retentar: false, motivo: "politica_ausente" });
  });

  it("o Chaves na Mão não repete: o fallback HTTP é sua segunda via", () => {
    expect(decidir(falha({ statusHttp: 503 }), { portal: "chaves-na-mao" }))
      .toEqual({ retentar: false, motivo: "portal_com_fallback" });
  });

  it.each(["olx", "wimoveis", "viva-real", "zap"] as const)("%s pode repetir", (portal) => {
    expect(decidir(falha({ statusHttp: 503 }), { portal }).retentar).toBe(true);
  });

  it("nunca autoriza uma terceira tentativa", () => {
    expect(decidir(falha({ statusHttp: 503 }), { tentativa: 2 }))
      .toEqual({ retentar: false, motivo: "limite_tentativas" });
    expect(decidir(falha({ statusHttp: 503 }), { tentativa: 3 }))
      .toEqual({ retentar: false, motivo: "limite_tentativas" });
  });

  it("só repete se couberem espera + nova aquisição + reserva", () => {
    const limite = 1_000 + AQUISICAO_MS + RESERVA_MS;
    expect(decidir(falha({ statusHttp: 503 }), { restanteMs: limite }).retentar).toBe(true);
    expect(decidir(falha({ statusHttp: 503 }), { restanteMs: limite - 1 }))
      .toEqual({ retentar: false, motivo: "orcamento_insuficiente" });
    expect(decidir(falha({ codigo: "firecrawl_429", statusHttp: 429, retryAfterMs: 5_000 }), { restanteMs: 99_999 }))
      .toEqual({ retentar: false, motivo: "orcamento_insuficiente" });
    expect(decidir(falha({ statusHttp: 503 }), { restanteMs: 1 }).retentar).toBe(false);
    expect(decidir(falha({ statusHttp: 503 }), { restanteMs: Number.NaN }).retentar).toBe(false);
  });

  it("uma primeira falha tardia na Central não repete (rota de 120 s)", () => {
    // Falhou aos 30 s: sobram 90 s, menos que 1 s + 60 s + 35 s.
    expect(decidir(falha({ statusHttp: 503 }), { restanteMs: 90_000 }).retentar).toBe(false);
  });
});

describe("R5: segundosRetryAfter (mesma regra do Investigador)", () => {
  it.each([
    ["3", 3], [" 0 ", 0], ["120", 120],
  ])("'%s' → %i", (valor, esperado) => {
    expect(segundosRetryAfter(valor)).toBe(esperado);
  });

  it.each([null, undefined, "", "-1", "1.5", "abc", "Wed, 21 Oct 2026 07:28:00 GMT", "99999999999999999999"])(
    "'%s' não é interpretado",
    (valor) => {
      expect(segundosRetryAfter(valor)).toBeUndefined();
    },
  );
});
