import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(new URL("../app/style.css", import.meta.url), "utf8");

describe("Agenda responsiva", () => {
  it("libera a largura da lista antes de os cartões ficarem espremidos", () => {
    expect(CSS).toContain("@media (max-width: 1180px){ .agenda-layout{ grid-template-columns: 1fr; } }");
    expect(CSS).toContain(".agenda-layout > :first-child{ min-width:0; }");
  });
});
