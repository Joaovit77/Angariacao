// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  from: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: storage.from.mockImplementation(() => ({
        createSignedUrl: storage.createSignedUrl,
      })),
    },
  }),
}));

import CapturaFachada, {
  ErroEnvioFachada,
  executarEnvioFachada,
} from "@/components/prospeccao/CapturaFachada";
import type { ResultadoProcessamentoFoto } from "@/lib/calculo/fotoFachada";
import type { FotoAvistamento } from "@/lib/prospeccao";

beforeEach(() => {
  vi.clearAllMocks();
  storage.createSignedUrl.mockResolvedValue({ data: null, error: new Error("ausente") });
});
afterEach(cleanup);

function fotoProcessada(): ResultadoProcessamentoFoto<Blob> {
  return {
    original: {
      conteudo: new Blob(["original"], { type: "image/jpeg" }),
      bytes: 390_000,
      largura: 1600,
      altura: 1067,
      qualidade: 0.74,
      mimeType: "image/jpeg",
      finalidade: "original",
    },
    miniatura: {
      conteudo: new Blob(["miniatura"], { type: "image/jpeg" }),
      bytes: 30_000,
      largura: 320,
      altura: 213,
      qualidade: 0.7,
      mimeType: "image/jpeg",
      finalidade: "miniatura",
    },
    exifPreservado: false,
  };
}

function promessaPendente<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function arquivoDeTeste(): File {
  return new File(["fachada"], "fachada.jpg", { type: "image/jpeg" });
}

function dependenciasComSucesso() {
  return {
    preparar: vi.fn().mockResolvedValue(fotoProcessada()),
    reservar: vi.fn().mockResolvedValue(reserva),
    enviarObjeto: vi.fn().mockResolvedValue(null),
    finalizar: vi.fn().mockResolvedValue(true),
  };
}

const prazosCurtos = {
  processamentoMs: 5,
  reservaMs: 5,
  uploadMs: 5,
  finalizacaoMs: 5,
};

const destino = { imovelIdentificadoId: "identificado-1", avistamentoId: "avistamento-1" };
const reserva = {
  fotoId: "foto-1",
  caminho: "usuario/identificado-1/avistamento-1/foto.jpg",
  caminhoMiniatura: "usuario/identificado-1/avistamento-1/foto_thumb.jpg",
  repetida: false,
};

describe("C5 — reserva, upload e finalização da fachada", () => {
  it("só entrega o destino à captura depois de o avistamento ser salvo", () => {
    const modal = readFileSync(
      resolve("components/modais/ModalAvistamento.tsx"),
      "utf8",
    );
    expect(modal.indexOf("const sucesso = imovelIdentificadoId")).toBeGreaterThan(-1);
    expect(modal.indexOf("setDestinoFoto({")).toBeGreaterThan(
      modal.indexOf("const sucesso = imovelIdentificadoId"),
    );
    expect(modal).toContain("imovelIdentificadoId={destinoFoto?.imovelIdentificadoId}");
    expect(modal).toContain("avistamentoId={destinoFoto?.avistamentoId}");
  });

  it("reserva antes de subir os dois caminhos exatos e só então finaliza", async () => {
    const ordem: string[] = [];
    const reservar = vi.fn(async () => { ordem.push("reserva"); return reserva; });
    const enviarObjeto = vi.fn(async (caminho: string) => {
      ordem.push(`upload:${caminho}`);
      return null;
    });
    const finalizar = vi.fn(async () => { ordem.push("finalização"); return true; });

    await executarEnvioFachada(
      destino,
      fotoProcessada(),
      { reservar, enviarObjeto, finalizar },
      () => undefined,
    );

    expect(ordem).toEqual([
      "reserva",
      `upload:${reserva.caminho}`,
      `upload:${reserva.caminhoMiniatura}`,
      "finalização",
    ]);
    expect(reservar).toHaveBeenCalledWith("identificado-1", "avistamento-1", {
      largura: 1600,
      altura: 1067,
      bytes: 390_000,
    });
    expect(enviarObjeto.mock.calls.map(([caminho]) => caminho)).toEqual([
      reserva.caminho,
      reserva.caminhoMiniatura,
    ]);
  });

  it("repete a reserva e aceita conflito somente nos mesmos caminhos reservados", async () => {
    const reservar = vi.fn().mockResolvedValue({ ...reserva, repetida: true });
    const enviarObjeto = vi.fn().mockResolvedValue({
      statusCode: "409",
      error: "Duplicate",
      message: "The resource already exists",
    });
    const finalizar = vi.fn().mockResolvedValue(true);

    await expect(executarEnvioFachada(
      destino,
      fotoProcessada(),
      { reservar, enviarObjeto, finalizar },
      () => undefined,
    )).resolves.toMatchObject({ fotoId: "foto-1", repetida: true });
    expect(enviarObjeto).toHaveBeenNthCalledWith(
      1,
      reserva.caminho,
      expect.any(Blob),
      "image/jpeg",
    );
    expect(enviarObjeto).toHaveBeenNthCalledWith(
      2,
      reserva.caminhoMiniatura,
      expect.any(Blob),
      "image/jpeg",
    );
    expect(finalizar).toHaveBeenCalledOnce();
  });

  it("mantém falha após a reserva recuperável e nunca simula finalização", async () => {
    const etapas: string[] = [];
    const finalizar = vi.fn();
    await expect(executarEnvioFachada(
      destino,
      fotoProcessada(),
      {
        reservar: vi.fn().mockResolvedValue(reserva),
        enviarObjeto: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ message: "Policy denied" }),
        finalizar,
      },
      (etapa) => etapas.push(etapa),
    )).rejects.toEqual(expect.objectContaining<Partial<ErroEnvioFachada>>({
      reservaCriada: true,
    }));
    expect(etapas).toEqual([
      "reservando",
      "enviando-original",
      "enviando-miniatura",
      "envio-nao-concluido",
    ]);
    expect(finalizar).not.toHaveBeenCalled();
  });

  it("mantém uma reserva interrompida visível para retomada", () => {
    render(createElement(CapturaFachada, {
      imovelIdentificadoId: "identificado-1",
      avistamentoId: "avistamento-1",
      foto: {
        id: "foto-1",
        estado: "reservada",
        caminho: reserva.caminho,
        caminhoMiniatura: reserva.caminhoMiniatura,
      } as FotoAvistamento,
    }));
    expect(screen.getByText("Envio não concluído")).toBeTruthy();
    expect(screen.getByText(/reserva existente/)).toBeTruthy();
    expect(screen.getByLabelText("Selecionar a mesma foto para retomar").getAttribute("capture"))
      .toBe("environment");
  });

  it("assina a miniatura ativa por 300 segundos e tolera objeto ausente", async () => {
    const fotoAtiva = {
      id: "foto-1",
      estado: "ativa",
      caminho: reserva.caminho,
      caminhoMiniatura: reserva.caminhoMiniatura,
    } as FotoAvistamento;
    const { unmount } = render(createElement(CapturaFachada, { foto: fotoAtiva }));
    await waitFor(() => expect(screen.getByText("Imagem indisponível")).toBeTruthy());
    expect(storage.from).toHaveBeenCalledWith("fachadas");
    expect(storage.createSignedUrl).toHaveBeenCalledWith(reserva.caminhoMiniatura, 300);

    storage.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://projeto.supabase.co/storage/v1/object/sign/fachadas/foto" },
      error: null,
    });
    unmount();
    render(createElement(CapturaFachada, { foto: fotoAtiva }));
    await waitFor(() => {
      expect(screen.getByAltText("Fachada registrada neste avistamento")).toBeTruthy();
    });
  });

  it("não informa conclusão antes de a RPC de finalização confirmar", async () => {
    let confirmar!: (sucesso: boolean) => void;
    const etapas: string[] = [];
    const finalizar = vi.fn((imovelId: string, fotoId: string) => {
      void imovelId;
      void fotoId;
      return new Promise<boolean>((resolve) => { confirmar = resolve; });
    });
    const execucao = executarEnvioFachada(
      destino,
      fotoProcessada(),
      {
        reservar: vi.fn().mockResolvedValue(reserva),
        enviarObjeto: vi.fn().mockResolvedValue(null),
        finalizar,
      },
      (etapa) => etapas.push(etapa),
    );
    await vi.waitFor(() => expect(etapas.at(-1)).toBe("finalizando"));
    expect(etapas).not.toContain("concluido");
    confirmar(true);
    await execucao;
    expect(etapas.at(-1)).toBe("concluido");
  });

  it("não apresenta a espera pelo salvamento como progresso congelado em 15%", async () => {
    const dependencias = dependenciasComSucesso();
    const { container } = render(createElement(CapturaFachada, { dependencias, prazos: prazosCurtos }));

    fireEvent.change(screen.getByLabelText("Fotografar fachada"), {
      target: { files: [arquivoDeTeste()] },
    });

    await waitFor(() => expect(screen.getByText("Foto pronta para registrar")).toBeTruthy());
    expect(screen.getByText(/salve o avistamento para iniciar o envio/i)).toBeTruthy();
    expect(container.querySelector("progress")).toBeNull();
    expect(container.textContent).not.toContain("15%");
    expect(dependencias.reservar).not.toHaveBeenCalled();
  });

  it.each([
    "processamento",
    "reserva",
    "upload-original",
    "upload-miniatura",
    "finalizacao",
  ] as const)("encerra %s pendente como erro recuperável e permite retry", async (falha) => {
    const dependencias = dependenciasComSucesso();

    if (falha === "processamento") {
      dependencias.preparar.mockImplementationOnce(() => promessaPendente());
    } else if (falha === "reserva") {
      dependencias.reservar.mockImplementationOnce(() => promessaPendente());
    } else if (falha === "upload-original") {
      dependencias.enviarObjeto.mockImplementationOnce(() => promessaPendente());
    } else if (falha === "upload-miniatura") {
      dependencias.enviarObjeto
        .mockResolvedValueOnce(null)
        .mockImplementationOnce(() => promessaPendente());
    } else {
      dependencias.finalizar.mockImplementationOnce(() => promessaPendente());
    }

    const aoConcluir = vi.fn();
    const { container } = render(createElement(CapturaFachada, {
      ...destino,
      dependencias,
      prazos: prazosCurtos,
      aoConcluir,
    }));

    fireEvent.change(screen.getByLabelText("Fotografar fachada"), {
      target: { files: [arquivoDeTeste()] },
    });

    await waitFor(() => expect(screen.getByText("Envio não concluído")).toBeTruthy());
    expect(container.querySelector("progress")).toBeNull();
    const retry = screen.getByRole("button", { name: "Tentar novamente" });
    expect(retry).toBeTruthy();
    expect(aoConcluir).not.toHaveBeenCalled();
    if (falha === "upload-original" || falha === "upload-miniatura" || falha === "finalizacao") {
      expect(screen.queryByLabelText("Fotografar fachada")).toBeNull();
    }

    fireEvent.click(retry);
    await waitFor(() => expect(aoConcluir).toHaveBeenCalledOnce());
    expect(screen.getByText("Concluído")).toBeTruthy();
  });

  it("conclui o caminho feliz inteiro sem chegar a 100% antes da finalização", async () => {
    const dependencias = dependenciasComSucesso();
    let concluirFinalizacao!: (resultado: boolean) => void;
    dependencias.finalizar.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => { concluirFinalizacao = resolve; }),
    );
    const aoConcluir = vi.fn();
    const { container } = render(createElement(CapturaFachada, {
      ...destino,
      dependencias,
      prazos: { ...prazosCurtos, finalizacaoMs: 1_000 },
      aoConcluir,
    }));

    fireEvent.change(screen.getByLabelText("Fotografar fachada"), {
      target: { files: [arquivoDeTeste()] },
    });

    await waitFor(() => expect(screen.getByText("Finalizando")).toBeTruthy());
    expect(container.textContent).not.toContain("100%");
    expect(aoConcluir).not.toHaveBeenCalled();

    concluirFinalizacao(true);
    await waitFor(() => expect(aoConcluir).toHaveBeenCalledOnce());
    expect(screen.getByText("Concluído")).toBeTruthy();
    expect(container.textContent).toContain("100%");
  });
});
