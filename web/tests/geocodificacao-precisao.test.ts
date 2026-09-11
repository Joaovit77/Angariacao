import { describe, expect, it } from "vitest";
import { tentativasGeocode } from "@/lib/geo";

describe("precisão de cada tentativa de geocodificação", () => {
  it("declara endereço, rua e bairro conforme o que cada consulta contém", () => {
    const tentativas = tentativasGeocode("Rua Bélgica, 1413", "Igapó", "Londrina");
    expect(tentativas.map((item) => item.precisao)).toEqual(["endereco", "rua", "rua", "bairro"]);
    expect(tentativas[0].consulta).toBe("Rua Bélgica, 1413, Igapó, Londrina, Brasil");
    expect(tentativas[3].consulta).toBe("Igapó, Londrina, Brasil");
  });

  it("nunca chama de endereço uma consulta sem número", () => {
    const tentativas = tentativasGeocode("Rua Bélgica", "Igapó", "Londrina");
    expect(tentativas.map((item) => item.precisao)).toEqual(["rua", "rua", "bairro"]);
    expect(tentativas.some((item) => item.precisao === "endereco")).toBe(false);
  });

  it("rotula como cidade a última tentativa quando não há bairro", () => {
    const tentativas = tentativasGeocode("Rua Bélgica, 1413", "", "Londrina");
    expect(tentativas.at(-1)).toEqual({ consulta: "Londrina, Brasil", precisao: "cidade" });
    expect(tentativas.some((item) => item.precisao === "bairro")).toBe(false);
  });
});
