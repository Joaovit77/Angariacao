"use client";

/* ================================================================
   TELA DE ACESSO
   A página é a APRESENTAÇÃO (Vitrine, largura toda); o formulário
   com as 4 abas — login, cadastro, "esqueci a senha" e a nova senha —
   vive num MODAL, chamado pelo cabeçalho ou pelos CTAs da página.
   Antes ele dividia a tela com a vitrine e roubava o palco dela.

   O modal é local, e não o ModalOverlay/uiModal do painel, de
   propósito: aquele importa os doze modais da área logada (store,
   mutações, Supabase) e arrastá-lo para cá jogaria o app inteiro no
   pacote de quem ainda nem entrou. O que se reaproveita são as
   classes CSS, para o visual não divergir.
   ================================================================ */
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { traduzErroAuth } from "@/lib/auth/erros";
import { getSupabase } from "@/lib/persistencia/supabase";
import { toast } from "@/lib/toast";
import RodapeApp from "@/components/RodapeApp";
import CabecalhoAuth from "./CabecalhoAuth";
import CampoSenha from "./CampoSenha";
import Vitrine from "./Vitrine";

export type AbaAuth = "login" | "signup" | "forgot" | "reset";

/** Mensagem sob o formulário: erro (vermelho) ou confirmação (verde). */
interface Aviso {
  texto: string;
  cor: string;
}

const SEM_AVISO: Aviso = { texto: "", cor: "var(--bad)" };

const ESTILO_BOTAO_SUBMIT = { width: "100%", justifyContent: "center", padding: "11px" };

function IconeEmail() {
  return (
    <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </svg>
  );
}

export default function TelaAuth({ recuperacao = false }: { recuperacao?: boolean }) {
  const { sincronizarSessao } = useSessao();
  const [abaEscolhida, setAba] = useState<AbaAuth>("login");

  // O PASSWORD_RECOVERY chega depois da primeira renderização (o Supabase lê o
  // hash da URL de forma assíncrona), então a aba é derivada — não sincronizada
  // por efeito. Equivale ao switchAuthTab("reset") do app antigo, que também
  // ignorava a aba anterior enquanto a recuperação estava em curso.
  const aba: AbaAuth = recuperacao ? "reset" : abaEscolhida;

  // Quem chega pelo link do e-mail não clicou em nada: o modal já nasce aberto
  // na nova senha. Derivado, pelo mesmo motivo da aba — mas dispensável, senão
  // fechá-lo seria impossível enquanto a recuperação estivesse em curso.
  const [aberto, setAberto] = useState(false);
  const [recuperacaoDispensada, setRecuperacaoDispensada] = useState(false);
  const modalAberto = aberto || (recuperacao && !recuperacaoDispensada);

  const dialogoRef = useRef<HTMLDivElement | null>(null);
  const focoAnteriorRef = useRef<HTMLElement | null>(null);

  function abrir(qual: AbaAuth) {
    focoAnteriorRef.current = document.activeElement as HTMLElement | null;
    setAba(qual);
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
    if (recuperacao) setRecuperacaoDispensada(true);
    focoAnteriorRef.current?.focus();
  }

  // Esc fecha e o Tab circula dentro do diálogo — enquanto ele está aberto, o
  // resto da página é decoração. Clicar no fundo NÃO fecha, como nos modais do
  // painel: um clique fora não deve custar a senha já digitada.
  useEffect(() => {
    if (!modalAberto) return;

    // Repete o corpo de fechar() em vez de depender dela: uma função nova a
    // cada render reexecutaria este efeito, e o foco pularia de volta para o
    // primeiro campo no meio da digitação.
    const encerrar = () => {
      setAberto(false);
      if (recuperacao) setRecuperacaoDispensada(true);
      focoAnteriorRef.current?.focus();
    };

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        encerrar();
        return;
      }
      if (e.key !== "Tab") return;
      const focaveis = dialogoRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focaveis || focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);
    // Trava a rolagem da apresentação atrás do modal.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogoRef.current?.querySelector<HTMLElement>("input")?.focus();

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [modalAberto, aba, recuperacao]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginSenha, setLoginSenha] = useState("");
  const [avisoLogin, setAvisoLogin] = useState<Aviso>(SEM_AVISO);

  const [signupNome, setSignupNome] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupSenha, setSignupSenha] = useState("");
  const [avisoSignup, setAvisoSignup] = useState<Aviso>(SEM_AVISO);

  const [forgotEmail, setForgotEmail] = useState("");
  const [avisoForgot, setAvisoForgot] = useState<Aviso>(SEM_AVISO);

  const [resetSenha, setResetSenha] = useState("");
  const [avisoReset, setAvisoReset] = useState<Aviso>(SEM_AVISO);

  async function enviarLogin(e: React.FormEvent) {
    e.preventDefault();
    setAvisoLogin(SEM_AVISO);
    const { error } = await getSupabase().auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginSenha,
    });
    if (error) setAvisoLogin({ texto: traduzErroAuth(error), cor: "var(--bad)" });
  }

  async function enviarSignup(e: React.FormEvent) {
    e.preventDefault();
    setAvisoSignup(SEM_AVISO);
    const { error } = await getSupabase().auth.signUp({
      email: signupEmail.trim(),
      password: signupSenha,
      options: { data: { name: signupNome.trim() } },
    });
    if (error) {
      setAvisoSignup({ texto: traduzErroAuth(error), cor: "var(--bad)" });
      return;
    }
    setAvisoSignup({
      texto: "Conta criada! Se pedir confirmação por e-mail, confira sua caixa de entrada.",
      cor: "var(--good)",
    });
  }

  async function enviarForgot(e: React.FormEvent) {
    e.preventDefault();
    setAvisoForgot(SEM_AVISO);
    const { error } = await getSupabase().auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) {
      setAvisoForgot({ texto: traduzErroAuth(error), cor: "var(--bad)" });
      return;
    }
    setAvisoForgot({
      texto: "Link enviado! Confira seu e-mail (e a caixa de spam, por garantia).",
      cor: "var(--good)",
    });
  }

  async function enviarReset(e: React.FormEvent) {
    e.preventDefault();
    setAvisoReset(SEM_AVISO);
    const { error } = await getSupabase().auth.updateUser({ password: resetSenha });
    if (error) {
      setAvisoReset({ texto: traduzErroAuth(error), cor: "var(--bad)" });
      return;
    }
    toast("Senha atualizada com sucesso.");
    await sincronizarSessao();
  }

  const abasVisiveis = aba !== "forgot" && aba !== "reset";

  return (
    <div className="auth-screen" id="auth-screen">
      <CabecalhoAuth aoEntrar={() => abrir("login")} aoCriarConta={() => abrir("signup")} />

      <Vitrine aoEntrar={() => abrir("login")} aoCriarConta={() => abrir("signup")} />

      <RodapeApp variante="auth" />

      {/* FORMULÁRIO DE ACESSO — modal sobre a apresentação */}
      <div className={`auth-modal-overlay${modalAberto ? " open" : ""}`}>
        <div
          className="auth-box"
          role="dialog"
          aria-modal="true"
          aria-label="Acesso à conta"
          ref={dialogoRef}
        >
          <button type="button" className="auth-box-fechar" onClick={fechar} aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <div
            className="brand auth-box-brand"
            style={{ border: "none", padding: 0, marginBottom: "8px", justifyContent: "center" }}
          >
            <Image className="brand-mark" src="/logo.png" alt="Angariações" width={52} height={52} />
            <div className="brand-text">
              <span className="brand-title">Angariações</span>
              <span className="brand-sub">Controle de Locação</span>
            </div>
          </div>
          <p className="auth-tagline">Cada login vê só os próprios imóveis.</p>

          {abasVisiveis && (
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab${aba === "login" ? " active" : ""}`}
                onClick={() => setAba("login")}
              >
                Entrar
              </button>
              <button
                type="button"
                className={`auth-tab${aba === "signup" ? " active" : ""}`}
                onClick={() => setAba("signup")}
              >
                Criar conta
              </button>
            </div>
          )}

          {aba === "login" && (
            <form className="auth-form" onSubmit={enviarLogin}>
              <div className="field-group">
                <label>E-mail</label>
                <div className="input-icon-wrap">
                  <IconeEmail />
                  <input
                    type="email"
                    required
                    placeholder="voce@imobiliaria.com"
                    autoComplete="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="field-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <label>Senha</label>
                  <a
                    href="#"
                    className="auth-link-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      setAba("forgot");
                    }}
                  >
                    Esqueci minha senha
                  </a>
                </div>
                <CampoSenha
                  value={loginSenha}
                  onChange={setLoginSenha}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <button type="submit" className="btn btn-primary" style={ESTILO_BOTAO_SUBMIT}>
                Entrar
              </button>
              <div className="auth-error" style={{ color: avisoLogin.cor }}>
                {avisoLogin.texto}
              </div>
            </form>
          )}

          {aba === "signup" && (
            <form className="auth-form" onSubmit={enviarSignup}>
              <div className="field-group">
                <label>Nome</label>
                <div className="input-icon-wrap">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21a8 8 0 0 0-16 0" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <input
                    type="text"
                    required
                    placeholder="Seu nome"
                    autoComplete="name"
                    value={signupNome}
                    onChange={(e) => setSignupNome(e.target.value)}
                  />
                </div>
              </div>
              <div className="field-group">
                <label>E-mail</label>
                <div className="input-icon-wrap">
                  <IconeEmail />
                  <input
                    type="email"
                    required
                    placeholder="voce@imobiliaria.com"
                    autoComplete="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="field-group">
                <label>Senha</label>
                <CampoSenha
                  value={signupSenha}
                  onChange={setSignupSenha}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  minLength={6}
                  comForca
                />
              </div>
              <button type="submit" className="btn btn-primary" style={ESTILO_BOTAO_SUBMIT}>
                Criar conta
              </button>
              <div className="auth-error" style={{ color: avisoSignup.cor }}>
                {avisoSignup.texto}
              </div>
              <div className="auth-hint">
                Cada conta é isolada — você só vê os imóveis que cadastrar com esse login.
              </div>
            </form>
          )}

          {aba === "forgot" && (
            <form className="auth-form" onSubmit={enviarForgot}>
              <p className="auth-tagline" style={{ margin: "0 0 16px 0" }}>
                Enviamos um link de recuperação para o seu e-mail.
              </p>
              <div className="field-group">
                <label>E-mail</label>
                <div className="input-icon-wrap">
                  <IconeEmail />
                  <input
                    type="email"
                    required
                    placeholder="voce@imobiliaria.com"
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={ESTILO_BOTAO_SUBMIT}>
                Enviar link de recuperação
              </button>
              <div className="auth-error" style={{ color: avisoForgot.cor }}>
                {avisoForgot.texto}
              </div>
              <div style={{ textAlign: "center", marginTop: "14px" }}>
                <a
                  href="#"
                  className="auth-link-sm"
                  onClick={(e) => {
                    e.preventDefault();
                    setAba("login");
                  }}
                >
                  ← Voltar para o login
                </a>
              </div>
            </form>
          )}

          {aba === "reset" && (
            <form className="auth-form" onSubmit={enviarReset}>
              <p className="auth-tagline" style={{ margin: "0 0 16px 0" }}>
                Defina sua nova senha.
              </p>
              <div className="field-group">
                <label>Nova senha</label>
                <CampoSenha
                  value={resetSenha}
                  onChange={setResetSenha}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  minLength={6}
                  comForca
                />
              </div>
              <button type="submit" className="btn btn-primary" style={ESTILO_BOTAO_SUBMIT}>
                Salvar nova senha
              </button>
              <div className="auth-error" style={{ color: avisoReset.cor }}>
                {avisoReset.texto}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
