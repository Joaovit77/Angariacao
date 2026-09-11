// @vitest-environment jsdom

/* ================================================================
   C5 — RASCUNHO DE CAPTURA: sobreviver à ida à câmera

   Regressão do smoke real de 11/09: no Android, abrir a câmera descartou
   a aba e a página recarregou — foto processada, texto e modal sumiram.
   Uma perda em três voltas da câmera. Estes testes provam que o rascunho
   é guardado ANTES de a aba correr risco e restaurado ao remontar, e que
   a rede de segurança nunca atrapalha a captura quando não existe.
   ================================================================ */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  estado: {
    itens: [] as unknown[],
    detalhe: null as unknown,
    selecionadoId: null as string | null,
    pagina: 1,
    porPagina: 24,
    total: 0,
    temMais: false,
    carregando: false,
    salvando: false,
    erro: null as string | null,
    carregarPagina: vi.fn(),
    carregarDetalhe: vi.fn(),
    limparSelecao: vi.fn(),
    criar: vi.fn(),
    adicionarAvistamento: vi.fn(),
    corrigirObservacao: vi.fn(),
    reservarFoto: vi.fn(),
    finalizarFoto: vi.fn(),
    descartar: vi.fn(),
    confirmarEtiqueta: vi.fn(),
    contestarEtiqueta: vi.fn(),
    definirTipo: vi.fn(),
  },
  abrirModal: vi.fn(),
  fecharModal: vi.fn(),
  usuario: { id: "usuario-1" },
  upload: vi.fn(),
}));

vi.mock("@/lib/useProspeccao", () => {
  const useProspeccao = (seletor: (estado: typeof cenario.estado) => unknown) =>
    seletor(cenario.estado);
  useProspeccao.getState = () => cenario.estado;
  return { useProspeccao };
});

vi.mock("@/lib/uiModal", () => ({
  useUiModal: (seletor: (estado: {
    abrirModal: typeof cenario.abrirModal;
    fecharModal: typeof cenario.fecharModal;
  }) => unknown) => seletor({ abrirModal: cenario.abrirModal, fecharModal: cenario.fecharModal }),
}));

vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ estado: "auth", usuario: cenario.usuario }),
}));

vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: () => ({
        upload: cenario.upload,
        createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: new Error("ausente") }),
      }),
    },
  }),
}));

import ModalAvistamento from "@/components/modais/ModalAvistamento";
import CapturaFachada from "@/components/prospeccao/CapturaFachada";
import ProspeccaoView from "@/components/prospeccao/ProspeccaoView";
import type { ResultadoProcessamentoFoto } from "@/lib/calculo/fotoFachada";
import {
  TTL_RASCUNHO_CAPTURA_MS,
  avaliarRascunho,
  camposVazios,
  criarArmazemIndexedDb,
  criarArmazemMemoria,
  rascunhoExpirado,
  rascunhoPertenceAoContexto,
  rascunhoTemConteudo,
  type RascunhoCaptura,
} from "@/lib/rascunhoCaptura";

beforeEach(() => {
  vi.clearAllMocks();
  cenario.estado.detalhe = null;
  cenario.estado.itens = [];
  cenario.upload.mockResolvedValue({ error: null });
  cenario.estado.reservarFoto.mockResolvedValue({
    fotoId: "foto-1",
    caminho: "usuario-1/identificado-1/avistamento-1/foto.jpg",
    caminhoMiniatura: "usuario-1/identificado-1/avistamento-1/foto_thumb.jpg",
    repetida: false,
  });
  cenario.estado.finalizarFoto.mockResolvedValue(true);
});
afterEach(cleanup);

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

function rascunho(extra: Partial<RascunhoCaptura> = {}): RascunhoCaptura {
  return {
    usuarioId: "usuario-1",
    imovelIdentificadoId: null,
    salvoEm: new Date().toISOString(),
    campos: { ...camposVazios(), data: "2026-09-11", hora: "16:22", observacao: "Casa fechada" },
    foto: fotoProcessada(),
    destino: null,
    reserva: null,
    ...extra,
  };
}

const semIndexedDb = () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });
  return () => {
    if (original) Object.defineProperty(globalThis, "indexedDB", original);
    else delete (globalThis as { indexedDB?: unknown }).indexedDB;
  };
};

describe("rascunho de captura — lógica pura", () => {
  it("expira depois do prazo e trata data inválida como expirada", () => {
    const agora = Date.parse("2026-09-11T19:00:00Z");
    expect(rascunhoExpirado({ salvoEm: "2026-09-11T18:00:00Z" }, agora)).toBe(false);
    expect(rascunhoExpirado(
      { salvoEm: new Date(agora - TTL_RASCUNHO_CAPTURA_MS - 1).toISOString() },
      agora,
    )).toBe(true);
    expect(rascunhoExpirado({ salvoEm: "não é data" }, agora)).toBe(true);
  });

  it("só pertence ao mesmo usuário e ao mesmo contexto", () => {
    const base = { usuarioId: "usuario-1", imovelIdentificadoId: null };
    expect(rascunhoPertenceAoContexto(base, "usuario-1", null)).toBe(true);
    expect(rascunhoPertenceAoContexto(base, "usuario-2", null)).toBe(false);
    expect(rascunhoPertenceAoContexto(base, "usuario-1", "identificado-1")).toBe(false);
    expect(rascunhoPertenceAoContexto(
      { ...base, imovelIdentificadoId: "identificado-1" }, "usuario-1", "identificado-1",
    )).toBe(true);
  });

  it("data e hora sozinhas não são conteúdo — foto, texto ou destino são", () => {
    const so = { campos: { ...camposVazios(), data: "2026-09-11", hora: "16:22" }, foto: null, destino: null };
    expect(rascunhoTemConteudo(so)).toBe(false);
    expect(rascunhoTemConteudo({ ...so, campos: { ...so.campos, observacao: "x" } })).toBe(true);
    expect(rascunhoTemConteudo({ ...so, foto: fotoProcessada() })).toBe(true);
    expect(rascunhoTemConteudo({
      ...so, destino: { imovelIdentificadoId: "a", avistamentoId: "b" },
    })).toBe(true);
  });

  it("avaliarRascunho distingue nenhum, expirado, outro contexto e restaurável", () => {
    const agora = Date.now();
    expect(avaliarRascunho(null, "usuario-1", null, agora)).toBe("nenhum");
    expect(avaliarRascunho(
      rascunho({ salvoEm: new Date(agora - TTL_RASCUNHO_CAPTURA_MS - 1).toISOString() }),
      "usuario-1", null, agora,
    )).toBe("expirado");
    expect(avaliarRascunho(rascunho(), "usuario-1", "identificado-9", agora)).toBe("outro-contexto");
    expect(avaliarRascunho(rascunho(), "usuario-2", null, agora)).toBe("outro-contexto");
    expect(avaliarRascunho(
      rascunho({ foto: null, campos: camposVazios() }), "usuario-1", null, agora,
    )).toBe("nenhum");
    expect(avaliarRascunho(rascunho(), "usuario-1", null, agora)).toBe("restauravel");
  });

  it("o armazém em memória guarda um rascunho por usuário", async () => {
    const armazem = criarArmazemMemoria();
    await armazem.salvar(rascunho());
    await armazem.salvar(rascunho({ usuarioId: "usuario-2" }));
    expect((await armazem.ler("usuario-1"))?.campos.observacao).toBe("Casa fechada");
    await armazem.salvar(rascunho({ campos: { ...camposVazios(), observacao: "Nova" } }));
    expect((await armazem.ler("usuario-1"))?.campos.observacao).toBe("Nova");
    await armazem.limpar("usuario-1");
    expect(await armazem.ler("usuario-1")).toBeNull();
    expect(await armazem.ler("usuario-2")).not.toBeNull();
  });

  it("o adaptador IndexedDB falha em silêncio quando a API não existe", async () => {
    const restaurar = semIndexedDb();
    try {
      const armazem = criarArmazemIndexedDb();
      await expect(armazem.ler("usuario-1")).resolves.toBeNull();
      await expect(armazem.salvar(rascunho())).resolves.toBeUndefined();
      await expect(armazem.limpar("usuario-1")).resolves.toBeUndefined();
    } finally {
      restaurar();
    }
  });
});

describe("rascunho de captura — captura da fachada", () => {
  it("entrega a foto processada ao pai para ser guardada", async () => {
    const aoEstadoArquivo = vi.fn();
    const preparar = vi.fn().mockResolvedValue(fotoProcessada());
    render(createElement(CapturaFachada, {
      aoEstadoArquivo,
      dependencias: { preparar },
    }));
    fireEvent.change(screen.getByLabelText("Fotografar fachada"), {
      target: { files: [new File(["fachada"], "fachada.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => {
      expect(aoEstadoArquivo).toHaveBeenCalledWith(
        expect.objectContaining({ pronta: true, processada: expect.objectContaining({ exifPreservado: false }) }),
      );
    });
  });

  it("avisa o pai ANTES de a câmera abrir — o último instante em que a página está viva", () => {
    const aoAntesDeCapturar = vi.fn();
    render(createElement(CapturaFachada, { aoAntesDeCapturar }));
    fireEvent.click(screen.getByText("Fotografar fachada"));
    expect(aoAntesDeCapturar).toHaveBeenCalledTimes(1);
  });

  it("nasce pronta a partir de uma foto restaurada, sem passar pelo input", () => {
    render(createElement(CapturaFachada, { fotoInicial: fotoProcessada() }));
    expect(screen.getByText("Foto pronta para registrar")).toBeTruthy();
    expect(screen.getByText("Salve o avistamento para iniciar o envio.")).toBeTruthy();
  });

  it("reutiliza a reserva restaurada em vez de reservar de novo, e avisa o pai", async () => {
    const aoReserva = vi.fn();
    const reserva = {
      fotoId: "foto-1",
      caminho: "usuario-1/identificado-1/avistamento-1/foto.jpg",
      caminhoMiniatura: "usuario-1/identificado-1/avistamento-1/foto_thumb.jpg",
      repetida: false,
    };
    const reservar = vi.fn();
    const enviarObjeto = vi.fn().mockResolvedValue(null);
    const finalizar = vi.fn().mockResolvedValue(true);
    render(createElement(CapturaFachada, {
      imovelIdentificadoId: "identificado-1",
      avistamentoId: "avistamento-1",
      fotoInicial: fotoProcessada(),
      reservaInicial: reserva,
      aoReserva,
      dependencias: { reservar, enviarObjeto, finalizar },
    }));
    await waitFor(() => expect(finalizar).toHaveBeenCalledWith("identificado-1", "foto-1"));
    expect(reservar).not.toHaveBeenCalled();
    expect(enviarObjeto).toHaveBeenCalledTimes(2);
    expect(aoReserva).toHaveBeenCalledWith(reserva);
  });
});

describe("rascunho de captura — modal (regressão do smoke)", () => {
  it("restaura foto e texto de um registro interrompido antes de salvar", async () => {
    const armazem = criarArmazemMemoria();
    await armazem.salvar(rascunho());
    render(createElement(ModalAvistamento, { armazemRascunho: armazem }));
    await screen.findByText("Registro não concluído restaurado.");
    expect((screen.getByLabelText("Observação (opcional)") as HTMLTextAreaElement).value)
      .toBe("Casa fechada");
    // A foto voltou processada: não pede para fotografar de novo.
    expect(screen.getByText("Foto pronta para registrar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registrar e enviar foto" })).toBeTruthy();
    expect(screen.getByText(/Nada foi enviado ainda/)).toBeTruthy();
  });

  it("com o avistamento já salvo, não cria de novo: vai direto ao envio com o destino guardado", async () => {
    const armazem = criarArmazemMemoria();
    await armazem.salvar(rascunho({
      destino: { imovelIdentificadoId: "identificado-1", avistamentoId: "avistamento-1" },
    }));
    render(createElement(ModalAvistamento, { armazemRascunho: armazem }));
    await screen.findByText("Concluir envio da foto");
    await waitFor(() => expect(cenario.estado.finalizarFoto).toHaveBeenCalledWith("identificado-1", "foto-1"));
    expect(cenario.estado.criar).not.toHaveBeenCalled();
    expect(cenario.estado.adicionarAvistamento).not.toHaveBeenCalled();
    expect(cenario.estado.reservarFoto).toHaveBeenCalledWith(
      "identificado-1", "avistamento-1", expect.objectContaining({ largura: 1600 }),
    );
    // Concluído: o rascunho sai do aparelho e o modal fecha.
    await waitFor(async () => expect(await armazem.ler("usuario-1")).toBeNull());
    expect(cenario.fecharModal).toHaveBeenCalled();
  });

  it("guarda o texto digitado no instante em que a câmera vai abrir", async () => {
    const armazem = criarArmazemMemoria();
    const salvar = vi.spyOn(armazem, "salvar");
    render(createElement(ModalAvistamento, { armazemRascunho: armazem }));
    await waitFor(() => expect(screen.getByText("Fotografar fachada")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Observação (opcional)"), { target: { value: "placa no portão" } });
    fireEvent.click(screen.getByText("Fotografar fachada"));
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const guardado = await armazem.ler("usuario-1");
    expect(guardado?.campos.observacao).toBe("placa no portão");
    expect(guardado?.imovelIdentificadoId).toBeNull();
  });

  it("não restaura rascunho de outro contexto nem expirado, e apaga o expirado", async () => {
    const armazem = criarArmazemMemoria();
    await armazem.salvar(rascunho({ imovelIdentificadoId: "identificado-9" }));
    const { unmount } = render(createElement(ModalAvistamento, { armazemRascunho: armazem }));
    await waitFor(() => expect(screen.getByText("Fotografar fachada")).toBeTruthy());
    expect(screen.queryByText(/restaurado/)).toBeNull();
    expect(await armazem.ler("usuario-1")).not.toBeNull();
    unmount();

    await armazem.salvar(rascunho({
      salvoEm: new Date(Date.now() - TTL_RASCUNHO_CAPTURA_MS - 1000).toISOString(),
    }));
    render(createElement(ModalAvistamento, { armazemRascunho: armazem }));
    await waitFor(async () => expect(await armazem.ler("usuario-1")).toBeNull());
    expect(screen.queryByText(/restaurado/)).toBeNull();
  });

  it("cancelar antes de salvar apaga o rascunho; descartar também", async () => {
    const armazem = criarArmazemMemoria();
    await armazem.salvar(rascunho());
    render(createElement(ModalAvistamento, { armazemRascunho: armazem }));
    await screen.findByText("Registro não concluído restaurado.");
    fireEvent.click(screen.getByRole("button", { name: "Descartar rascunho" }));
    await waitFor(async () => expect(await armazem.ler("usuario-1")).toBeNull());
    expect(cenario.fecharModal).toHaveBeenCalled();
  });

  it("sem IndexedDB o modal funciona como antes", async () => {
    const restaurar = semIndexedDb();
    try {
      render(createElement(ModalAvistamento, {}));
      await waitFor(() => expect(screen.getByText("Fotografar fachada")).toBeTruthy());
      expect(screen.getByRole("button", { name: "Salvar avistamento" })).toBeTruthy();
      expect(screen.queryByText(/restaurado/)).toBeNull();
    } finally {
      restaurar();
    }
  });
});

describe("rascunho de captura — a página avisa depois da recarga", () => {
  it("mostra 'Retomar' quando há rascunho restaurável e abre o modal no contexto certo", async () => {
    const armazem = criarArmazemMemoria();
    await armazem.salvar(rascunho());
    render(createElement(ProspeccaoView, { armazemRascunho: armazem }));
    await screen.findByText("Um registro de campo não foi concluído.");
    expect(screen.getByText(/Foto e dados de/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retomar" }));
    expect(cenario.abrirModal).toHaveBeenCalledWith("avistamento", undefined);
  });

  it("com destino guardado, diz que a foto ficou pendente e reabre no identificado", async () => {
    const armazem = criarArmazemMemoria();
    await armazem.salvar(rascunho({
      imovelIdentificadoId: "identificado-1",
      destino: { imovelIdentificadoId: "identificado-1", avistamentoId: "avistamento-1" },
    }));
    render(createElement(ProspeccaoView, { armazemRascunho: armazem }));
    await screen.findByText("Uma foto ficou pendente de envio.");
    fireEvent.click(screen.getByRole("button", { name: "Retomar" }));
    expect(cenario.abrirModal).toHaveBeenCalledWith("avistamento", "identificado-1");
  });

  it("sem rascunho, a página não mostra aviso nenhum", async () => {
    render(createElement(ProspeccaoView, { armazemRascunho: criarArmazemMemoria() }));
    await waitFor(() => expect(cenario.estado.carregarPagina).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Retomar" })).toBeNull();
  });
});
