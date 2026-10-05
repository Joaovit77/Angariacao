// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModalRetomada from "@/components/modais/ModalRetomada";
import ModalImovel from "@/components/modais/ModalImovel";
import ModalMensagemAgendada from "@/components/modais/ModalMensagemAgendada";
import MensagensAgendadasView from "@/components/mensagens/MensagensAgendadasView";
import { fromDbMensagem } from "@/lib/mensagensAgendadas";
import type { DbMensagemAgendada } from "@/lib/mensagensAgendadas";
import { useUiModal } from "@/lib/uiModal";
import { useAppStore } from "@/lib/store";
import type { Imovel } from "@/lib/tipos";
import { ERROS_RETOMADA } from "@/lib/calculo/retomada";

const estado = vi.hoisted(() => ({ habilitada: true, imovel: { id: "i", retirado: true, status: "Publicado", proprietario_nome: "Ana", endereco: "Rua Tijuca, 112", proprietario_telefone: "43999990000" }, programacao: null as Record<string, unknown> | null, erro: null as string | null, posts: [] as Record<string, unknown>[], escritasComuns: [] as Record<string, unknown>[], toasts: [] as string[] }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: () => ({
  auth: { getSession: async () => ({ data: { session: { access_token: "teste-local" } } }) },
  from: () => { const q = { select: () => q, eq: () => q, maybeSingle: () => q, insert: (p: Record<string, unknown>) => { estado.escritasComuns.push(p); return q; }, update: (p: Record<string, unknown>) => { estado.escritasComuns.push(p); return q; }, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: estado.programacao, error: null }).then(resolve) }; return q; },
}) }));
vi.mock("@/components/SessaoProvider", () => ({ useSessao: () => ({ usuario: { id: "u" } }), captadorPadrao: () => "Corretora", rotuloUsuario: () => "Corretora" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/useCidadePadraoDaConta", () => ({ useCidadePadraoDaConta: () => ({ origem: "nenhuma", cidade: null, uf: null }) }));
vi.mock("@/lib/toast", () => ({ toast: (t: string) => estado.toasts.push(t) }));
vi.mock("@/lib/useMensagensAgendadas", () => ({ useMensagensAgendadas: () => ({ itens: estado.programacao ? [fromDbMensagem(estado.programacao as unknown as DbMensagemAgendada)] : [], carregando: false, erro: null, recarregar: vi.fn() }) }));

const futuro = { id: "m", imovel_id: "i", user_id: "u", tipo: "retomada-retirado", agenda_id: null, status: "agendada", updated_at: "versao", nome_proprietario: "Ana", telefone: "43999990000", mensagem: "Texto salvo", data_envio: "2099-04-04T12:00:00.000Z" };
beforeEach(() => {
  estado.habilitada = true; estado.imovel.proprietario_nome = "Ana"; estado.imovel.endereco = "Rua Tijuca, 112"; estado.imovel.retirado = true; estado.imovel.proprietario_telefone = "43999990000"; estado.programacao = null; estado.erro = null; estado.posts = []; estado.toasts = []; estado.escritasComuns = [];
  useUiModal.getState().abrirRetomada("i");
  vi.stubGlobal("fetch", vi.fn(async (url: string, opcoes?: RequestInit) => {
    if (!url.startsWith("/api/retomadas")) throw new Error("Endpoint externo proibido");
    if (url.includes("capacidade")) return Response.json({ habilitada: estado.habilitada });
    if (!estado.habilitada) return Response.json({ ok: false, erro: "feature-desabilitada" }, { status: 403 });
    if (opcoes?.method === "POST") {
      estado.posts.push(JSON.parse(opcoes.body as string));
      if (estado.erro) return Response.json({ ok: false, erro: estado.erro }, { status: 409 });
      return Response.json({ ok: true, valor: futuro });
    }
    return Response.json({ ok: true, valor: { imovel: estado.imovel, programacao: estado.programacao } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const abrir = async () => { render(createElement(ModalRetomada, { retomadaImovelId: "i" })); await screen.findByLabelText("Texto da retomada"); };
const preencher = (nome: string, valor: string) => fireEvent.change(screen.getByLabelText(nome), { target: { value: valor } });
const clicar = async (nome: string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: nome })); }); };

describe("B4: interface local", () => {
  it("nova programação preenche o default aprovado, continua editável e não envia", async () => {
    await abrir();
    const texto = screen.getByLabelText("Texto da retomada") as HTMLTextAreaElement;
    expect(texto.value).toBe("Olá, Ana! Tudo bem? Estou retomando nosso contato sobre o imóvel da Rua Tijuca, 112. Gostaria de saber se ele continua fora de disponibilidade ou se podemos conversar novamente sobre a possibilidade de anunciá-lo conosco.");
    expect(texto.readOnly).toBe(false); expect(texto.disabled).toBe(false);
    preencher("Texto da retomada", "Texto escolhido pelo usuário");
    expect(texto.value).toBe("Texto escolhido pelo usuário");
    await clicar("3 meses"); expect(texto.value).toBe("Texto escolhido pelo usuário");
    expect(estado.posts).toEqual([]); expect(estado.escritasComuns).toEqual([]);
    expect(vi.mocked(fetch).mock.calls.every(([url, opcoes]) => String(url).startsWith("/api/retomadas") && opcoes?.method !== "POST")).toBe(true);
  });
  it("edição usa sempre o texto persistido, até quando vazio ou contexto muda", async () => {
    estado.imovel.proprietario_nome = "Alexandre";
    estado.programacao = { ...futuro, mensagem: "" };
    await abrir(); expect((screen.getByLabelText("Texto da retomada") as HTMLTextAreaElement).value).toBe("");
    expect(estado.posts).toEqual([]); expect(estado.escritasComuns).toEqual([]);
  });
  it("abre, mantém destinatário readonly, aviso explícito, atalhos, campos e fecha", async () => {
    await abrir();
    expect((screen.getByLabelText("Destinatário (somente leitura)") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText(/Programar retomada não reativa/)).toBeTruthy();
    const meses = (await import("@/lib/calculo/retomada")).dataPadraoRetomada;
    expect((screen.getByLabelText("Data da retomada") as HTMLInputElement).value).toBe(meses().data);
    expect((screen.getByLabelText("Horário de Brasília") as HTMLInputElement).value).toBe("09:00");
    for (const m of [3, 6, 12] as const) { await clicar(`${m} meses`); expect((screen.getByLabelText("Data da retomada") as HTMLInputElement).value).toBe(meses(m).data); }
    await clicar("Fechar retomada"); expect(useUiModal.getState().modal).toBeNull();
  });
  it("valida texto e data, salva somente programação e fecha após sucesso", async () => {
    await abrir(); preencher("Texto da retomada", ""); await clicar("Programar retomada"); expect(screen.getByRole("alert").textContent).toBe(ERROS_RETOMADA["texto-ausente"]);
    preencher("Texto da retomada", "Olá"); preencher("Data da retomada", "2000-01-01");
    await clicar("Programar retomada"); expect(screen.getByRole("alert").textContent).toBe(ERROS_RETOMADA["data-invalida"]);
    preencher("Data da retomada", "2099-04-04"); await clicar("Programar retomada");
    expect(estado.posts).toEqual([{ retomadaImovelId: "i", data: "2099-04-04", hora: "09:00", texto: "Olá", acao: "salvar" }]);
    expect(useUiModal.getState().modal).toBeNull();
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).startsWith("/api/retomadas"))).toBe(true);
  });
  it("carrega e edita programação existente sem perder id/versão; conflito fica aberto", async () => {
    estado.programacao = { ...futuro }; await abrir();
    expect((screen.getByLabelText("Texto da retomada") as HTMLTextAreaElement).value).toBe("Texto salvo");
    preencher("Texto da retomada", "Texto editado"); estado.erro = "conflito-edicao";
    await clicar("Salvar programação");
    expect(estado.posts[0]).toMatchObject({ id: "m", versao: "versao", texto: "Texto editado" });
    expect(screen.getByRole("alert").textContent).toBe(ERROS_RETOMADA["conflito-edicao"]);
    expect(useUiModal.getState().modal).not.toBeNull(); expect(estado.toasts).toEqual([]);
    estado.erro = null; await clicar("Salvar programação"); expect(useUiModal.getState().modal).toBeNull();
  });
  it.each(["destinatario", "ativo", "processando"])("bloqueia salvar em %s", async (caso) => {
    if (caso === "destinatario") estado.imovel.proprietario_telefone = "123";
    if (caso === "ativo") estado.imovel.retirado = false;
    if (caso === "processando") estado.programacao = { ...futuro, status: "processando" };
    await abrir(); expect((screen.getByRole("button", { name: caso === "processando" ? "Salvar programação" : "Programar retomada" }) as HTMLButtonElement).disabled).toBe(true); expect(estado.posts).toEqual([]);
  });
  it("flag OFF impede abrir formulário mesmo via identidade explícita", async () => {
    estado.habilitada = false; render(createElement(ModalRetomada, { retomadaImovelId: "i" }));
    expect((await screen.findByRole("alert")).textContent).toBe(ERROS_RETOMADA["feature-desabilitada"]);
    expect(screen.queryByLabelText("Texto da retomada")).toBeNull();
  });
  it("cancelamento confirmado usa o caminho protegido e não muda o imóvel", async () => {
    estado.programacao = { ...futuro }; await abrir();
    vi.stubGlobal("confirm", vi.fn(() => true));
    await clicar("Cancelar programação");
    expect(estado.posts[0]).toMatchObject({ id: "m", versao: "versao", acao: "cancelar", retomadaImovelId: "i" });
    expect(estado.imovel.retirado).toBe(true);
  });
  it("reabrir não herda texto nem versão do formulário anterior", async () => {
    estado.programacao = { ...futuro }; await abrir(); cleanup();
    estado.programacao = null; await abrir();
    expect((screen.getByLabelText("Texto da retomada") as HTMLTextAreaElement).value).toBe("Olá, Ana! Tudo bem? Estou retomando nosso contato sobre o imóvel da Rua Tijuca, 112. Gostaria de saber se ele continua fora de disponibilidade ou se podemos conversar novamente sobre a possibilidade de anunciá-lo conosco.");
    expect(screen.queryByRole("button", { name: "Salvar programação" })).toBeNull();
  });
  it("persisted edit da gestão de mensagens seleciona a lógica específica", async () => {
    estado.programacao = { ...futuro }; render(createElement(ModalMensagemAgendada, { id: "m" }));
    expect(await screen.findByLabelText("Texto da retomada")).toBeTruthy(); expect(screen.queryByText("Preencher manualmente")).toBeNull();
  });
  it("conflito de identidades no modal nunca abre formulário comum", () => {
    render(createElement(ModalMensagemAgendada, { retomadaImovelId: "i", imovelIdRelacionado: "outro" }));
    expect(screen.getByRole("alert").textContent).toBe(ERROS_RETOMADA["estado-incompativel"]); expect(screen.queryByText("Agendar envio")).toBeNull();
  });
  it("lista de mensagens não oferece cancelamento genérico para retomada", async () => {
    estado.programacao = { ...futuro }; render(createElement(MensagensAgendadasView));
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    await clicar("Ver programação");
    expect(useUiModal.getState().modal).toMatchObject({ tipo: "mensagemAgendada", id: "m" });
    expect(estado.escritasComuns).toEqual([]);
  });
  it("mensagem comum manual continua agendando pelo caminho existente", async () => {
    render(createElement(ModalMensagemAgendada));
    await clicar("Preencher manualmente");
    fireEvent.change(screen.getByPlaceholderText("Ex.: João da Silva"), { target: { value: "Contato seguro" } });
    fireEvent.change(screen.getByPlaceholderText("(43) 99999-9999"), { target: { value: "43999990000" } });
    fireEvent.change(screen.getByPlaceholderText("Escreva qualquer mensagem personalizada"), { target: { value: "Mensagem comum de teste" } });
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2099-04-04" } });
    await clicar("Agendar envio");
    expect(estado.escritasComuns).toHaveLength(1);
    expect(estado.escritasComuns[0]).toMatchObject({ tipo: "livre", agenda_id: null, imovel_id: null, mensagem: "Mensagem comum de teste", telefone: "43999990000" });
    expect(estado.posts).toEqual([]);
  });
  it.each([[true, true], [false, true], [true, false]])("ModalImovel: flag=%s / retirado=%s", async (habilitada, retirado) => {
    estado.habilitada = habilitada;
    useAppStore.setState({ imoveis: [{ id: "i", codigo: "LD-901", endereco: "Rua de teste, 20", bairro: "Centro", cidade: "Londrina", estado: "PR", tipo: "Casa", status: "Publicado", retirado, proprietarioNome: "Ana", proprietarioTelefone: "43999990000", notas: [], tentativas: [], statusHistory: [] } as Imovel] });
    render(createElement(ModalImovel, { id: "i" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    if (habilitada && retirado) {
      await screen.findByRole("button", { name: "Programar retomada" }); await clicar("Programar retomada");
      expect(useUiModal.getState().modal).toEqual({ tipo: "mensagemAgendada", retomadaImovelId: "i" });
    } else expect(screen.queryByRole("button", { name: "Programar retomada" })).toBeNull();
  });
});
