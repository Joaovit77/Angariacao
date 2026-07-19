"use client";

/* ================================================================
   SESSÃO (auth + boot)
   Port da seção 7 do app.js: o onAuthStateChange é a única fonte
   de verdade da autenticação e continua 100% no browser (decisão
   §4 do MIGRATION_NEXT.md — nada de sessão no servidor).

   Equivalências com o app antigo:
   - PASSWORD_RECOVERY  -> estado "recuperacao" (a raiz mostra o
     form "Defina sua nova senha"), sem seguir para o app.
   - sessão presente    -> estado "auth" + carregarEstado() no store
     (o que handleAuthenticated() fazia).
   - sem sessão         -> estado "anon" + limparEstado().

   O erro de carregamento é tratado aqui como no loadState() antigo:
   console.error + toast, e o app segue renderizando com o estado
   vazio (não trava a tela).
   ================================================================ */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { iaConfigurada } from "@/lib/ia";
import { valorMaisUsado } from "@/lib/normalizacao";
import { carregarEstado } from "@/lib/persistencia/carregarEstado";
import { getSupabase } from "@/lib/persistencia/supabase";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Imovel } from "@/lib/tipos";

/** "carregando" = ainda não sabemos se há sessão (antes do INITIAL_SESSION). */
export type EstadoSessao = "carregando" | "anon" | "auth" | "recuperacao";

interface Sessao {
  estado: EstadoSessao;
  usuario: User | null;
  /** Relê a sessão do Supabase e entra no app — usado após definir a nova senha. */
  sincronizarSessao: () => Promise<void>;
}

const SessaoContext = createContext<Sessao>({
  estado: "carregando",
  usuario: null,
  sincronizarSessao: async () => {},
});

export function useSessao(): Sessao {
  return useContext(SessaoContext);
}

/** Rótulo do usuário na sidebar — igual ao app antigo. */
export function rotuloUsuario(usuario: User | null): string {
  if (!usuario) return "";
  const nome = usuario.user_metadata?.name;
  return typeof nome === "string" && nome ? nome : (usuario.email ?? "");
}

/** Nome gravado na conta (só existe se foi digitado no "Criar conta").
    Diferente do rotuloUsuario de propósito: aqui NÃO vale cair no e-mail,
    porque "fulano@imobiliaria.com" viraria um captador com esse nome no
    Pipeline, nos filtros e nos relatórios — pior que vazio. */
function nomeCaptador(usuario: User | null): string {
  const nome = usuario?.user_metadata?.name;
  return typeof nome === "string" ? nome.trim() : "";
}

/**
 * Captador para pré-preencher um imóvel novo. O nome da conta vem primeiro,
 * mas boa parte das contas não tem nome nenhum (quem criou sem preencher, ou
 * por seed) — então cai no captador que o próprio usuário mais usa nos seus
 * imóveis, que é o mesmo dado visto por outro ângulo. Conta nova e sem
 * imóveis não tem de onde tirar: devolve "" e o campo fica vazio, como antes.
 */
export function captadorPadrao(usuario: User | null, imoveis: Imovel[]): string {
  return nomeCaptador(usuario) || valorMaisUsado(imoveis.map((i) => i.responsavel));
}

const ESTADO_VAZIO = { imoveis: [], metas: {}, agenda: [], abordagens: [], config: { comissaoPercent: 100, agendaTipos: [], whatsappModelos: [] } };

export default function SessaoProvider({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<{ estado: EstadoSessao; usuario: User | null }>({
    estado: "carregando",
    usuario: null,
  });
  const setEstado = useAppStore((s) => s.setEstado);
  const limparEstado = useAppStore((s) => s.limparEstado);
  const setIaDisponivel = useAppStore((s) => s.setIaDisponivel);

  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        // Chegou pelo link de "esqueci minha senha" do e-mail — mostra a
        // tela de definir nova senha em vez do fluxo normal.
        setSessao({ estado: "recuperacao", usuario: null });
        return;
      }
      if (session && session.user) setSessao({ estado: "auth", usuario: session.user });
      else setSessao({ estado: "anon", usuario: null });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const usuarioId = sessao.usuario?.id ?? null;

  // Boot: carrega o estado uma vez por usuário autenticado (loadState()).
  useEffect(() => {
    if (sessao.estado !== "auth" || !usuarioId) return;
    let cancelado = false;
    carregarEstado()
      .then((estado) => {
        if (!cancelado) setEstado(estado);
      })
      .catch((e) => {
        if (cancelado) return;
        console.error("Falha ao carregar dados do Supabase:", e);
        toast("Não foi possível carregar seus dados. Verifique sua conexão.", "error");
        setEstado(ESTADO_VAZIO);
      });
    return () => {
      cancelado = true;
    };
  }, [sessao.estado, usuarioId, setEstado]);

  // A IA está configurada neste ambiente? Uma consulta por sessão, só para a
  // UI decidir se mostra os botões. Independente do carregamento dos dados:
  // se esta falhar, o app inteiro segue — só fica sem os botões de IA.
  useEffect(() => {
    if (sessao.estado !== "auth") return;
    let cancelado = false;
    iaConfigurada().then((disponivel) => {
      if (!cancelado) setIaDisponivel(disponivel);
    });
    return () => {
      cancelado = true;
    };
  }, [sessao.estado, setIaDisponivel]);

  // Logout: zera o store (o app antigo perdia o STATE ao recarregar a página).
  useEffect(() => {
    if (sessao.estado === "anon") limparEstado();
  }, [sessao.estado, limparEstado]);

  // Depois de trocar a senha o Supabase já autentica a sessão normalmente —
  // é o que o handleAuthenticated() pós-updateUser fazia no app antigo.
  const sincronizarSessao = useCallback(async () => {
    const {
      data: { session },
    } = await getSupabase().auth.getSession();
    if (session && session.user) setSessao({ estado: "auth", usuario: session.user });
  }, []);

  const valor = useMemo<Sessao>(
    () => ({ ...sessao, sincronizarSessao }),
    [sessao, sincronizarSessao],
  );

  return <SessaoContext.Provider value={valor}>{children}</SessaoContext.Provider>;
}
