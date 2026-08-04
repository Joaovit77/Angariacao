/* Protocolos da imobiliária — o mapeador e o que ele garante.

   Não há oráculo do app antigo aqui: a feature nasceu depois da migração. O
   que estes testes fixam é o contrato de dados que o resto depende: `arquivado`
   nunca chega `null` ao app (quem lê filtra por ele para decidir o que vai à
   IA, e `null` passaria pelo `!p.arquivado` de um jeito e pelo `filter` de
   outro), e o texto vai ao banco já aparado. */
import { describe, expect, it } from "vitest";
import { fromDbProtocolo, toDbProtocolo, type DbProtocoloRow } from "@/lib/persistencia/mapeadores";
import type { Protocolo } from "@/lib/tipos";

const USER_ID = "11111111-2222-3333-4444-555555555555";

const BASE: Protocolo = {
  id: "p1",
  titulo: "Taxa de administração",
  conteudo: "10% sobre o valor do aluguel.",
  arquivado: false,
};

describe("toDbProtocolo", () => {
  it("leva os campos e carimba o dono", () => {
    const row = toDbProtocolo(BASE, USER_ID);
    expect(row).toEqual({
      id: "p1",
      user_id: USER_ID,
      titulo: "Taxa de administração",
      conteudo: "10% sobre o valor do aluguel.",
      arquivado: false,
    });
  });

  it("apara espaço em volta — título com sobra viraria outro protocolo na tela", () => {
    const row = toDbProtocolo({ ...BASE, titulo: "  Prazo  ", conteudo: "\n30 meses.\n" }, USER_ID);
    expect(row.titulo).toBe("Prazo");
    expect(row.conteudo).toBe("30 meses.");
  });
});

describe("fromDbProtocolo", () => {
  const row: DbProtocoloRow = {
    id: "p1",
    user_id: USER_ID,
    titulo: "Taxa de administração",
    conteudo: "10% sobre o valor do aluguel.",
    arquivado: false,
  };

  it("volta sem o user_id (o app não escopa nada por ele — quem escopa é o RLS)", () => {
    expect(fromDbProtocolo(row)).toEqual(BASE);
  });

  it("arquivado null vira false: é o campo que decide o que vai para a IA", () => {
    expect(fromDbProtocolo({ ...row, arquivado: null }).arquivado).toBe(false);
  });
});
