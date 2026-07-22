/* Celebração ao salvar (lib/calculo/celebracao) — feature nova da
   pós-migração. A função é determinística a partir dos parâmetros (o mês
   entra como argumento, não vem do relógio), então os testes fixam o
   contrato com fixtures de statusHistory controlado.

   O que estes testes guardam, acima de tudo, é a regra do CRUZAMENTO:
   comemorar estado em vez de transição faria toda reedição de um imóvel
   já angariado jogar confete na tela. */
import { describe, expect, it } from "vitest";
import { celebracaoAoSalvar } from "@/lib/calculo/celebracao";
import type { Imovel, Metas } from "@/lib/tipos";

let seq = 0;
function imovel(overrides: Partial<Imovel>): Imovel {
  seq += 1;
  return { id: `c${seq}`, endereco: `Rua ${seq}`, status: "Novo contato", ...overrides };
}

function angariadoEm(data: string, overrides: Partial<Imovel> = {}): Imovel {
  return imovel({
    status: "Angariado",
    statusHistory: [
      { status: "Novo contato", date: data },
      { status: "Angariado", date: data },
    ],
    ...overrides,
  });
}

const MES = "2026-07";
const METAS_5: Metas = { [MES]: { angariacoes: 5, locados: 0, comissao: 0, faturamento: 0 } };
const SEM_METAS: Metas = {};

describe("celebracaoAoSalvar — quando NÃO comemora", () => {
  it("não comemora imóvel que ainda não chegou em Angariado", () => {
    const antes = imovel({ statusHistory: [{ status: "Novo contato", date: "2026-07-01" }] });
    const depois = { ...antes, status: "Visita agendada", statusHistory: [...antes.statusHistory!, { status: "Visita agendada", date: "2026-07-05" }] };
    expect(celebracaoAoSalvar(antes, depois, [antes], [depois], METAS_5, MES)).toBeNull();
  });

  it("não recomemora a reedição de um imóvel JÁ angariado", () => {
    const antes = angariadoEm("2026-07-03");
    const depois = { ...antes, proprietarioTelefone: "43999990000" };
    expect(celebracaoAoSalvar(antes, depois, [antes], [depois], METAS_5, MES)).toBeNull();
  });

  it("não recomemora quando o imóvel avança de Angariado para Locado", () => {
    const antes = angariadoEm("2026-07-03");
    const depois = {
      ...antes,
      status: "Locado",
      statusHistory: [...antes.statusHistory!, { status: "Locado", date: "2026-07-20" }],
    };
    expect(celebracaoAoSalvar(antes, depois, [antes], [depois], METAS_5, MES)).toBeNull();
  });
});

describe("celebracaoAoSalvar — angariação", () => {
  it("comemora a primeira entrada em Angariado, mesmo em imóvel novo (antes = null)", () => {
    const novo = angariadoEm("2026-07-10", { codigo: "LD-07" });
    const c = celebracaoAoSalvar(null, novo, [], [novo], SEM_METAS, MES);
    expect(c?.tipo).toBe("angariacao");
    expect(c?.mensagem).toContain("LD-07");
    expect(c?.detalhe).toBe("1ª angariação do mês");
  });

  it("usa o endereço quando o imóvel não tem código", () => {
    const novo = angariadoEm("2026-07-10", { endereco: "Rua das Flores, 120" });
    const c = celebracaoAoSalvar(null, novo, [], [novo], SEM_METAS, MES);
    expect(c?.mensagem).toContain("Rua das Flores, 120");
  });

  it("informa quantas faltam para a meta, no plural e no singular", () => {
    const previos = [angariadoEm("2026-07-01"), angariadoEm("2026-07-02")];
    const novo = angariadoEm("2026-07-10");
    const c = celebracaoAoSalvar(null, novo, previos, [...previos, novo], METAS_5, MES);
    expect(c?.detalhe).toBe("3ª angariação do mês · faltam 2 para a meta");

    const previos4 = [...previos, angariadoEm("2026-07-05")];
    const quarto = angariadoEm("2026-07-11");
    const c2 = celebracaoAoSalvar(null, quarto, previos4, [...previos4, quarto], METAS_5, MES);
    expect(c2?.detalhe).toBe("4ª angariação do mês · falta 1 para a meta");
  });

  it("angariações de OUTROS meses não entram na contagem do mês", () => {
    const previos = [angariadoEm("2026-06-20"), angariadoEm("2026-06-25")];
    const novo = angariadoEm("2026-07-02");
    const c = celebracaoAoSalvar(null, novo, previos, [...previos, novo], SEM_METAS, MES);
    expect(c?.detalhe).toBe("1ª angariação do mês");
  });
});

describe("celebracaoAoSalvar — meta batida", () => {
  function quatroAngariados(): Imovel[] {
    return ["2026-07-01", "2026-07-03", "2026-07-06", "2026-07-09"].map((d) => angariadoEm(d));
  }

  it("comemora a meta — e não a angariação — quando a angariação é a que fecha a conta", () => {
    const previos = quatroAngariados();
    const quinto = angariadoEm("2026-07-15", { codigo: "LD-99" });
    const c = celebracaoAoSalvar(null, quinto, previos, [...previos, quinto], METAS_5, MES);
    expect(c?.tipo).toBe("meta");
    expect(c?.mensagem).toContain("5 de 5 angariações");
    expect(c?.detalhe).toContain("LD-99");
  });

  it("não recomemora a meta nas angariações seguintes do mesmo mês", () => {
    const cinco = [...quatroAngariados(), angariadoEm("2026-07-15")];
    const sexto = angariadoEm("2026-07-18");
    const c = celebracaoAoSalvar(null, sexto, cinco, [...cinco, sexto], METAS_5, MES);
    expect(c?.tipo).toBe("angariacao");
    // Já passou da meta: nada de "faltam N".
    expect(c?.detalhe).toBe("6ª angariação do mês");
  });

  it("meta zerada/inexistente nunca vira comemoração de meta", () => {
    const previos = quatroAngariados();
    const quinto = angariadoEm("2026-07-15");
    const zerada: Metas = { [MES]: { angariacoes: 0, locados: 0, comissao: 0, faturamento: 0 } };
    expect(celebracaoAoSalvar(null, quinto, previos, [...previos, quinto], zerada, MES)?.tipo).toBe("angariacao");
    expect(celebracaoAoSalvar(null, quinto, previos, [...previos, quinto], SEM_METAS, MES)?.tipo).toBe("angariacao");
  });

  it("comemora quando a angariação PULA o alvo (meta reduzida depois)", () => {
    // Meta 2 com 1 angariado: a próxima já cruza.
    const metas2: Metas = { [MES]: { angariacoes: 2, locados: 0, comissao: 0, faturamento: 0 } };
    const previos = [angariadoEm("2026-07-01")];
    const novo = angariadoEm("2026-07-08");
    expect(celebracaoAoSalvar(null, novo, previos, [...previos, novo], metas2, MES)?.tipo).toBe("meta");
  });
});
