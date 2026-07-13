import { describe, it, expect } from "vitest";
import { sugerirCodigoImovel } from "@/lib/codigoImovel";

const cods = (...codigos: string[]) => codigos.map((codigo) => ({ codigo }));

describe("sugerirCodigoImovel", () => {
  it("sem imóveis começa em LD-01 (dois dígitos)", () => {
    expect(sugerirCodigoImovel([])).toBe("LD-01");
  });

  it("pega o próximo número mantendo dois dígitos", () => {
    expect(sugerirCodigoImovel(cods("LD-07", "LD-03"))).toBe("LD-08");
  });

  it("passa para três dígitos ao virar a casa", () => {
    expect(sugerirCodigoImovel(cods("LD-99"))).toBe("LD-100");
  });

  it("preserva larguras maiores já existentes", () => {
    expect(sugerirCodigoImovel(cods("LD-0234", "LD-0230"))).toBe("LD-0235");
  });

  it("preserva a largura do zero-padding existente", () => {
    expect(sugerirCodigoImovel(cods("LD-000012"))).toBe("LD-000013");
  });

  it("ignora códigos de outros prefixos e vazios", () => {
    expect(sugerirCodigoImovel(cods("ABC-0999", "", "LD-0007"))).toBe("LD-0008");
  });

  it("casa o prefixo sem ligar para maiúsculas/minúsculas ou separador", () => {
    expect(sugerirCodigoImovel(cods("ld 0041"))).toBe("LD-0042");
  });

  it("aceita prefixo padrão customizado", () => {
    expect(sugerirCodigoImovel(cods("SP-0003"), "SP-")).toBe("SP-0004");
  });
});
