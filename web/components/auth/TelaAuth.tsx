"use client";

/* ================================================================
   TELA DE LOGIN / CADASTRO
   Port das linhas 17–172 do index.html original (vitrine + card com
   as 4 abas) e das funções switchAuthTab/wireAuthForms/
   togglePasswordVisibility/updatePasswordStrength do app.js.
   Mesmos textos, mesma estrutura, mesmas classes CSS.
   ================================================================ */
import Image from "next/image";
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { traduzErroAuth } from "@/lib/auth/erros";
import { getSupabase } from "@/lib/persistencia/supabase";
import { toast } from "@/lib/toast";
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
      <div className="auth-layout">
        <Vitrine />

        {/* FORMULÁRIO DE ACESSO */}
        <div className="auth-box">
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
