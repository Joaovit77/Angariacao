/* ================================================================
   VISIBILIDADE DE PROPRIETÁRIOS COM MÚLTIPLOS IMÓVEIS NA UI

   Testa o agrupamento canônico por telefone (sem nunca agrupar por nome
   ou telefone inválido), a ordenação operacional (ativos -> Locado ->
   Retirados -> Perdido/Cancelado), o índice O(n) de Mensagens, a sugestão
   conservadora de nome único e a integração na UI (Mensagens, Drawer do
   Pipeline e ModalImovel).
   ================================================================ */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  mapaOutrosImoveisPorId,
  nomeSugeridoDoProprietario,
  outrosImoveisDoProprietario,
  outrosImoveisPorTelefone,
} from "@/lib/calculo/contextoProprietario";
import type { Imovel } from "@/lib/tipos";

function imovel(parcial: Partial<Imovel>): Imovel {
  return {
    id: crypto.randomUUID(),
    codigo: "LD-1",
    endereco: "Rua Exemplo, 100",
    bairro: "Centro",
    cidade: "Londrina",
    tipo: "Apartamento",
    status: "Novo contato",
    retirado: false,
    dataAngariacao: "2026-10-01",
    statusHistory: [],
    proprietarioNome: "Maria Silva",
    proprietarioTelefone: "(43) 99999-0001",
    ...parcial,
  } as Imovel;
}

describe("outrosImoveisPorTelefone e outrosImoveisDoProprietario", () => {
  it("agrupa variações do mesmo telefone canônico (DDI, máscara e 9º dígito) e exclui o próprio imóvel", () => {
    const a = imovel({ id: "a", codigo: "LD-200", proprietarioTelefone: "(43) 99802-4316", status: "Publicado" });
    const b = imovel({ id: "b", codigo: "LD-201", proprietarioTelefone: "554398024316", status: "Angariado" });
    const c = imovel({ id: "c", codigo: "LD-202", proprietarioTelefone: "43 998024316", status: "Perdido" });
    const outroDono = imovel({ id: "d", codigo: "LD-999", proprietarioNome: "Maria Silva", proprietarioTelefone: "(43) 99999-1111" });

    const encontrados = outrosImoveisDoProprietario(a, [a, b, c, outroDono]);
    expect(encontrados.map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("NUNCA agrupa por nome quando o telefone está ausente, inválido ou diferente", () => {
    const semTel1 = imovel({ id: "s1", proprietarioNome: "João Carlos", proprietarioTelefone: "" });
    const semTel2 = imovel({ id: "s2", proprietarioNome: "João Carlos", proprietarioTelefone: "123" });
    const comTel = imovel({ id: "s3", proprietarioNome: "João Carlos", proprietarioTelefone: "(43) 99999-2222" });

    expect(outrosImoveisDoProprietario(semTel1, [semTel1, semTel2, comTel])).toEqual([]);
    expect(outrosImoveisDoProprietario(semTel2, [semTel1, semTel2, comTel])).toEqual([]);
    expect(outrosImoveisPorTelefone("123", [semTel1, semTel2, comTel])).toEqual([]);
  });

  it("ordena ativos primeiro, depois Locado, depois Retirados e por último Perdido/Cancelado", () => {
    const atual = imovel({ id: "atual", codigo: "LD-10", status: "Angariado" });
    const perdido = imovel({ id: "perdido", codigo: "LD-11", status: "Perdido", dataAngariacao: "2026-11-20" });
    const retirado = imovel({ id: "retirado", codigo: "LD-12", status: "Publicado", retirado: true, dataAngariacao: "2026-11-25" });
    const locado = imovel({ id: "locado", codigo: "LD-13", status: "Locado", dataAngariacao: "2026-11-10" });
    const ativoAntigo = imovel({ id: "ativo-1", codigo: "LD-14", status: "Novo contato", dataAngariacao: "2026-10-01" });
    const ativoRecente = imovel({ id: "ativo-2", codigo: "LD-15", status: "Publicado", dataAngariacao: "2026-11-15" });

    const lista = outrosImoveisDoProprietario(atual, [perdido, retirado, locado, ativoAntigo, ativoRecente, atual]);
    expect(lista.map((i) => i.id)).toEqual(["ativo-2", "ativo-1", "locado", "retirado", "perdido"]);
  });

  it("funciona no modo criação (sem ignorarImovelId) assim que um telefone existente é digitado", () => {
    const existente = imovel({ id: "e1", codigo: "LD-300", proprietarioTelefone: "(43) 99123-4567" });
    expect(outrosImoveisPorTelefone("4391234567", [existente], null).map((i) => i.id)).toEqual(["e1"]);
  });
});

describe("mapaOutrosImoveisPorId e nomeSugeridoDoProprietario", () => {
  it("indexa apenas telefones com 2+ imóveis e exclui o próprio id de cada entrada", () => {
    const a = imovel({ id: "a", codigo: "LD-1", proprietarioTelefone: "(43) 99800-0001" });
    const b = imovel({ id: "b", codigo: "LD-2", proprietarioTelefone: "4398000001" });
    const unico = imovel({ id: "u", codigo: "LD-3", proprietarioTelefone: "(43) 99800-0002" });

    const mapa = mapaOutrosImoveisPorId([a, b, unico]);
    expect(mapa.get("a")?.map((i) => i.id)).toEqual(["b"]);
    expect(mapa.get("b")?.map((i) => i.id)).toEqual(["a"]);
    expect(mapa.has("u")).toBe(false);
  });

  it("sugere nome somente quando todos os imóveis concordam; nomes divergentes retornam null", () => {
    const a = imovel({ proprietarioNome: "Maria Silva" });
    const b = imovel({ proprietarioNome: "maria silva " });
    const semNome = imovel({ proprietarioNome: "" });
    const outroNome = imovel({ proprietarioNome: "José Silva" });

    expect(nomeSugeridoDoProprietario([a, b, semNome])).toBe("Maria Silva");
    expect(nomeSugeridoDoProprietario([semNome])).toBeNull();
    expect(nomeSugeridoDoProprietario([a, outroNome])).toBeNull();
  });
});

describe("contrato de UI — Mensagens, Drawer do Pipeline e ModalImovel", () => {
  const ler = (caminho: string) => readFileSync(join(process.cwd(), caminho), "utf8");

  it("Mensagens mostra selo na lista e seção clicável no painel lateral de contexto", () => {
    const central = ler("components/respostas/CentralMensagensView.tsx");
    expect(central).toContain("mapaOutrosImoveisPorId(imoveis)");
    expect(central).toContain('className="mensagens-multi-imoveis"');
    expect(central).toContain("Outros imóveis deste proprietário");
    expect(central).toContain('temConversa ? aoSelecionarConversa(outro.id) : abrirModal("imovel", outro.id)');
  });

  it("Pipeline Drawer e ModalImovel exibem os outros imóveis com troca rápida", () => {
    const pipeline = ler("components/pipeline/PipelineView.tsx");
    const modal = ler("components/modais/ModalImovel.tsx");
    expect(pipeline).toContain("outrosImoveisDoProprietario(imovel, imoveis)");
    expect(pipeline).toContain("Outros imóveis deste proprietário");
    expect(pipeline).toContain("abrirDrawer(outro.id)");

    expect(modal).toContain("outrosImoveisPorTelefone(proprietarioTelefone, imoveis, imovel?.id ?? null)");
    expect(modal).toContain("nomeSugeridoDoProprietario(outros)");
    expect(modal).toContain('abrirModal("imovel", outro.id)');

    // Trocar de um imóvel para outro dentro do ModalImovel precisa remontar o formulário.
    const overlay = ler("components/modais/ModalOverlay.tsx");
    expect(overlay).toContain('<ModalImovel key={modal.id ?? "novo"}');
  });
});
