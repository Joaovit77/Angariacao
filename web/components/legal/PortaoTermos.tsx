"use client";

/* ================================================================
   PORTÃO DOS TERMOS

   Sem ele, todo o resto seria decoração: os documentos existiriam, a
   caixa no cadastro existiria, e as contas criadas ANTES disso — que
   hoje são todas — nunca teriam aceitado nada. O mesmo valeria a cada
   nova versão do texto.

   TRÊS CAMINHOS, e o desenho está em qual deles NÃO mostra tela:

   1. Já tem linha da versão vigente → não faz nada. É o caso de todo
      dia, e por isso a consulta é uma só, no boot.
   2. Não tem linha, mas o metadata da conta diz que a versão foi
      aceita no cadastro → grava a linha em silêncio e libera. Quem
      marcou a caixa há trinta segundos não pode ser recebido com um
      pedido para aceitar de novo. (Ver o comentário do `signUp` em
      TelaAuth: a linha não pôde nascer lá porque o cadastro com
      confirmação por e-mail não devolve sessão.)
   3. Não tem nem uma coisa nem outra → a tela aparece, e bloqueia.

   O bloqueio é a razão de este componente envolver o conteúdo em vez
   de ser um aviso no topo: um banner dispensável seria ignorado por
   todo mundo, para sempre, e aí "o usuário aceitou os termos" voltaria
   a ser uma frase sem lastro.

   Enquanto a resposta não chega, NÃO se mostra a tela de aceite — só o
   conteúdo normal. Piscar "aceite os termos" para quem já aceitou, a
   cada carregamento, seria pior que o problema que isto resolve.
   ================================================================ */
import { useCallback, useEffect, useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { aceitouVersaoAtual, registrarAceite } from "@/lib/legal/aceite";
import { legalPublicavel, VERSAO_TERMOS } from "@/lib/legal/identidade";
import { toast } from "@/lib/toast";

type Estado = "verificando" | "liberado" | "pendente";

export default function PortaoTermos({ children }: { children: React.ReactNode }) {
  const { usuario } = useSessao();
  const [estado, setEstado] = useState<Estado>("verificando");
  const [marcado, setMarcado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const userId = usuario?.id ?? null;
  // O que o cadastro declarou. `unknown` porque user_metadata é um
  // objeto livre — nada garante o formato além de quem escreveu lá.
  const versaoNoCadastro = usuario?.user_metadata?.termos_versao;

  useEffect(() => {
    /* INERTE enquanto os documentos não forem publicáveis (falta CNPJ,
       endereço ou contato do encarregado — ver `legalPublicavel`).
       Nem a consulta acontece: cobrar aceite de um texto que não
       identifica quem responde é colher um "eu aceito" que não vale, e
       ainda tranca o corretor no meio do expediente por causa disso. */
    if (!userId || !legalPublicavel()) return;
    let cancelado = false;

    aceitouVersaoAtual(userId).then(async (jaAceitou) => {
      if (cancelado) return;
      if (jaAceitou) {
        setEstado("liberado");
        return;
      }
      // Caminho 2: aceitou no cadastro, a linha é que ainda não existe.
      if (versaoNoCadastro === VERSAO_TERMOS) {
        await registrarAceite(userId);
        if (!cancelado) setEstado("liberado");
        return;
      }
      setEstado("pendente");
    });

    return () => {
      cancelado = true;
    };
  }, [userId, versaoNoCadastro]);

  const aceitar = useCallback(async () => {
    if (!userId) return;
    setSalvando(true);
    const r = await registrarAceite(userId);
    setSalvando(false);
    if (!r.ok) {
      toast("Não foi possível registrar o aceite. Tente de novo.", "error");
      return;
    }
    setEstado("liberado");
  }, [userId]);

  if (estado !== "pendente") return <>{children}</>;

  return (
    <div className="portao-termos">
      <div className="portao-caixa">
        <h2>Atualizamos nossos termos</h2>
        <p>
          Antes de continuar, precisamos do seu aceite aos documentos que regem o uso do sistema e o
          tratamento de dados pessoais. Eles explicam, entre outras coisas, <strong>quais dados dos
          proprietários</strong> são tratados aqui e <strong>de quem é a responsabilidade</strong> por
          eles.
        </p>
        <p className="portao-versao">Versão {VERSAO_TERMOS}</p>

        <label className="auth-aceite">
          <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} />
          <span>
            Li e aceito os{" "}
            <a href="/termos" target="_blank" rel="noopener noreferrer">
              Termos de Uso
            </a>{" "}
            e a{" "}
            <a href="/privacidade" target="_blank" rel="noopener noreferrer">
              Política de Privacidade
            </a>
            .
          </span>
        </label>

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={!marcado || salvando}
          onClick={() => void aceitar()}
        >
          {salvando ? "Registrando…" : "Aceitar e continuar"}
        </button>
      </div>
    </div>
  );
}
