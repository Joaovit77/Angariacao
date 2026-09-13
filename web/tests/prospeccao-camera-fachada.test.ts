// @vitest-environment jsdom

/* ================================================================
   C5 — CÂMERA EM PÁGINA

   Regressão do smoke de 11/09: o input com capture="environment" troca
   de aplicativo e o Chrome Android descartou a aba por memória, sem
   entregar a foto na volta ("Devido à insuficiência de memória, não foi
   possível concluir a operação anterior"). A câmera passa a viver dentro
   da página; o input nativo fica como alternativa.
   ================================================================ */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  reservarFoto: vi.fn(),
  finalizarFoto: vi.fn(),
  // C7: a dedupe só avisa; nestes testes ela não encontra nada.
  buscarDuplicatas: vi.fn(async () => []),
}));

vi.mock("@/lib/useProspeccao", () => {
  const estado = { reservarFoto: cenario.reservarFoto, finalizarFoto: cenario.finalizarFoto };
  const useProspeccao = (seletor: (e: typeof estado) => unknown) => seletor(estado);
  useProspeccao.getState = () => estado;
  return { useProspeccao };
});

vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => ({ storage: { from: () => ({ upload: vi.fn(), createSignedUrl: vi.fn() }) } }),
}));

import CameraFachada, {
  RESTRICOES_CAMERA_FACHADA,
  cameraEmPaginaDisponivel,
  mensagemErroCamera,
} from "@/components/prospeccao/CameraFachada";
import CapturaFachada from "@/components/prospeccao/CapturaFachada";
import type { ResultadoProcessamentoFoto } from "@/lib/calculo/fotoFachada";

function fotoProcessada(): ResultadoProcessamentoFoto<Blob> {
  return {
    original: {
      conteudo: new Blob(["original"], { type: "image/jpeg" }),
      bytes: 390_000, largura: 1600, altura: 1067, qualidade: 0.74,
      mimeType: "image/jpeg", finalidade: "original",
    },
    miniatura: {
      conteudo: new Blob(["miniatura"], { type: "image/jpeg" }),
      bytes: 30_000, largura: 320, altura: 213, qualidade: 0.7,
      mimeType: "image/jpeg", finalidade: "miniatura",
    },
    exifPreservado: false,
  };
}

function streamFalso() {
  const parar = vi.fn();
  const stream = { getTracks: () => [{ stop: parar }] } as unknown as MediaStream;
  return { stream, parar };
}

function erroDom(nome: string) {
  const erro = new Error(nome);
  erro.name = nome;
  return erro;
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom não implementa play(); sem isto ele só reclama no console.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("câmera em página — disponibilidade e erros", () => {
  it("só existe quando o navegador expõe getUserMedia", () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    expect(cameraEmPaginaDisponivel()).toBe(false);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() }, configurable: true,
    });
    expect(cameraEmPaginaDisponivel()).toBe(true);
    if (original) Object.defineProperty(navigator, "mediaDevices", original);
    else delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  });

  it("pede a câmera traseira sem áudio", () => {
    expect(RESTRICOES_CAMERA_FACHADA.audio).toBe(false);
    expect(RESTRICOES_CAMERA_FACHADA.video).toMatchObject({ facingMode: { ideal: "environment" } });
  });

  it("traduz os erros do navegador em instruções, sempre apontando a alternativa", () => {
    expect(mensagemErroCamera(erroDom("NotAllowedError"))).toMatch(/não foi liberada/);
    expect(mensagemErroCamera(erroDom("NotFoundError"))).toMatch(/Nenhuma câmera/);
    expect(mensagemErroCamera(erroDom("NotReadableError"))).toMatch(/em uso/);
    expect(mensagemErroCamera(new Error("x"))).toMatch(/Não foi possível abrir/);
    for (const nome of ["NotAllowedError", "NotFoundError", "NotReadableError", "TypeError"]) {
      expect(mensagemErroCamera(erroDom(nome))).toMatch(/câmera do aparelho/);
    }
  });
});

describe("câmera em página — componente", () => {
  it("abre o stream, captura um quadro como JPEG e desliga a câmera", async () => {
    const { stream, parar } = streamFalso();
    const obterStream = vi.fn().mockResolvedValue(stream);
    const capturarQuadro = vi.fn().mockResolvedValue(new Blob(["quadro"], { type: "image/jpeg" }));
    const aoCapturar = vi.fn();
    render(createElement(CameraFachada, {
      aoCapturar, aoCancelar: vi.fn(), aoFalhar: vi.fn(),
      dependencias: { obterStream, capturarQuadro },
    }));
    expect(screen.getByText("Abrindo a câmera…")).toBeTruthy();
    const capturar = await screen.findByRole("button", { name: "Capturar" });
    await waitFor(() => expect((capturar as HTMLButtonElement).disabled).toBe(false));
    expect(obterStream).toHaveBeenCalledWith(RESTRICOES_CAMERA_FACHADA);
    fireEvent.click(capturar);
    await waitFor(() => expect(aoCapturar).toHaveBeenCalledTimes(1));
    const arquivo = aoCapturar.mock.calls[0][0] as File;
    expect(arquivo).toBeInstanceOf(File);
    expect(arquivo.type).toBe("image/jpeg");
    expect(arquivo.name).toBe("fachada.jpg");
    expect(parar).toHaveBeenCalled();
  });

  it("cancelar desliga a câmera", async () => {
    const { stream, parar } = streamFalso();
    const aoCancelar = vi.fn();
    const { unmount } = render(createElement(CameraFachada, {
      aoCapturar: vi.fn(), aoCancelar, aoFalhar: vi.fn(),
      dependencias: { obterStream: vi.fn().mockResolvedValue(stream) },
    }));
    await screen.findByRole("button", { name: "Capturar" });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoCancelar).toHaveBeenCalled();
    unmount();
    expect(parar).toHaveBeenCalled();
  });

  it("sem permissão, avisa o pai com a mensagem traduzida", async () => {
    const aoFalhar = vi.fn();
    render(createElement(CameraFachada, {
      aoCapturar: vi.fn(), aoCancelar: vi.fn(), aoFalhar,
      dependencias: { obterStream: vi.fn().mockRejectedValue(erroDom("NotAllowedError")) },
    }));
    await waitFor(() => expect(aoFalhar).toHaveBeenCalledWith(expect.stringMatching(/não foi liberada/)));
  });

  it("falha ao capturar o quadro fica na tela e permite tentar de novo", async () => {
    const { stream } = streamFalso();
    const capturarQuadro = vi.fn()
      .mockRejectedValueOnce(new Error("A câmera ainda não entregou imagem. Tente de novo."))
      .mockResolvedValueOnce(new Blob(["quadro"], { type: "image/jpeg" }));
    const aoCapturar = vi.fn();
    render(createElement(CameraFachada, {
      aoCapturar, aoCancelar: vi.fn(), aoFalhar: vi.fn(),
      dependencias: { obterStream: vi.fn().mockResolvedValue(stream), capturarQuadro },
    }));
    const capturar = await screen.findByRole("button", { name: "Capturar" });
    await waitFor(() => expect((capturar as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(capturar);
    await screen.findByRole("alert");
    expect(aoCapturar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Capturar" }));
    await waitFor(() => expect(aoCapturar).toHaveBeenCalledTimes(1));
  });
});

describe("câmera em página — dentro da captura da fachada", () => {
  it("regressão do smoke: fotografar não sai da página e a foto entra no mesmo processamento", async () => {
    const { stream } = streamFalso();
    const preparar = vi.fn().mockResolvedValue(fotoProcessada());
    const aoAntesDeCapturar = vi.fn();
    const aoEstadoArquivo = vi.fn();
    render(createElement(CapturaFachada, {
      aoAntesDeCapturar,
      aoEstadoArquivo,
      dependencias: {
        preparar,
        cameraDisponivel: true,
        camera: {
          obterStream: vi.fn().mockResolvedValue(stream),
          capturarQuadro: vi.fn().mockResolvedValue(new Blob(["quadro"], { type: "image/jpeg" })),
        },
      },
    }));
    // O botão principal é a câmera em página; o input nativo vira alternativa.
    const fotografar = screen.getByRole("button", { name: "Fotografar fachada" });
    expect(screen.getByLabelText("Usar a câmera do aparelho").getAttribute("capture")).toBe("environment");
    // Quem fotografou antes e registra depois escolhe da galeria: mesmo input, sem `capture`.
    const galeria = screen.getByLabelText("Escolher da galeria") as HTMLInputElement;
    expect(galeria.type).toBe("file");
    expect(galeria.hasAttribute("capture")).toBe(false);
    expect(galeria.getAttribute("accept")).toBe("image/*");
    fireEvent.click(fotografar);
    expect(aoAntesDeCapturar).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Visor da câmera")).toBeTruthy();
    const capturar = await screen.findByRole("button", { name: "Capturar" });
    await waitFor(() => expect((capturar as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(capturar);
    await screen.findByText("Foto pronta para registrar");
    expect(preparar).toHaveBeenCalledTimes(1);
    expect((preparar.mock.calls[0][0] as File).name).toBe("fachada.jpg");
    expect(aoEstadoArquivo).toHaveBeenLastCalledWith(
      expect.objectContaining({ pronta: true, processada: expect.objectContaining({ exifPreservado: false }) }),
    );
    expect(screen.queryByLabelText("Visor da câmera")).toBeNull();
  });

  it("se a câmera não abre, mostra o motivo e deixa o input nativo à mão", async () => {
    render(createElement(CapturaFachada, {
      dependencias: {
        cameraDisponivel: true,
        camera: { obterStream: vi.fn().mockRejectedValue(erroDom("NotAllowedError")) },
      },
    }));
    fireEvent.click(screen.getByRole("button", { name: "Fotografar fachada" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/não foi liberada/);
    expect(screen.queryByLabelText("Visor da câmera")).toBeNull();
    expect(screen.getByLabelText("Usar a câmera do aparelho")).toBeTruthy();
  });

  it("sem getUserMedia, o comportamento é o de antes: o input nativo é o único caminho", () => {
    render(createElement(CapturaFachada, { dependencias: { cameraDisponivel: false } }));
    expect(screen.queryByRole("button", { name: "Fotografar fachada" })).toBeNull();
    expect(screen.getByLabelText("Fotografar fachada").getAttribute("capture")).toBe("environment");
  });

  it("na retomada de uma reserva sem arquivo, continua pedindo a mesma foto pelo input", () => {
    render(createElement(CapturaFachada, {
      dependencias: { cameraDisponivel: true },
      foto: {
        id: "foto-1", estado: "reservada",
        caminho: "u/i/a/foto.jpg", caminhoMiniatura: "u/i/a/foto_thumb.jpg",
      } as never,
    }));
    expect(screen.queryByRole("button", { name: "Fotografar fachada" })).toBeNull();
    expect(screen.getByLabelText("Selecionar a mesma foto para retomar")).toBeTruthy();
  });
});
