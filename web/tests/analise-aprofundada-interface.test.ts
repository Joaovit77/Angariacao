// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistenteProvider } from "@/components/assistente/AssistenteProvider";
import ConversaAssistente from "@/components/assistente/ConversaAssistente";
import { useAppStore } from "@/lib/store";

describe("Análise aprofundada — interação inicial", () => {
  beforeEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    useAppStore.setState({
      imoveis: [{
        id: "11111111-1111-4111-8111-111111111111",
        codigo: "ANG-42",
        endereco: "Rua Segura, 100",
        status: "Publicado",
        retirado: false,
      }],
    });
  });

  afterEach(() => {
    useAppStore.setState({ imoveis: [] });
  });

  it("abre na conversa, exige imóvel e deixa Atendimento desmarcado", () => {
    render(createElement(AssistenteProvider, null, createElement(ConversaAssistente)));

    fireEvent.click(screen.getByRole("button", { name: "Análise aprofundada" }));
    const executar = screen.getByRole("button", { name: "Executar análise" }) as HTMLButtonElement;
    const atendimento = screen.getByRole("checkbox", { name: /Atendimento/ }) as HTMLInputElement;
    const seletor = screen.getByRole("combobox", { name: "Imóvel obrigatório" }) as HTMLSelectElement;
    expect(seletor.value).toBe("");
    expect(executar.disabled).toBe(true);
    expect(atendimento.checked).toBe(false);

    fireEvent.change(seletor, {
      target: { value: "11111111-1111-4111-8111-111111111111" },
    });
    fireEvent.click(atendimento);
    expect(executar.disabled).toBe(false);
    expect(atendimento.checked).toBe(true);
    expect(screen.getByText("Mercado e comparáveis")).toBeTruthy();
    expect(screen.getByText("Protocolos")).toBeTruthy();
  });
});
