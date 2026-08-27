"use client";

/* ================================================================
   CONEXÃO COM O GOOGLE AGENDA (bloco de Configurações)

   Só três estados possíveis, e cada um mostra UMA coisa:
   servidor sem as chaves -> explica e some; desconectado -> o botão;
   conectado -> em qual conta, e como desfazer.

   O e-mail não é enfeite. Quem tem conta pessoal e conta de trabalho
   autoriza uma sem perceber e depois procura a visita na outra —
   dizer "conectado como fulano@gmail.com" é o que evita isso.
   ================================================================ */
import { useEffect, useState } from "react";
import {
  conectarGoogle,
  desconectarGoogle,
  estadoConexaoGoogle,
  type EstadoConexaoGoogle,
} from "@/lib/googleAgenda";
import { toast } from "@/lib/toast";

export default function ConexaoGoogle() {
  const [estado, setEstado] = useState<EstadoConexaoGoogle | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Consulta uma vez ao montar. A seção é remontada ao ser selecionada, então
  // isto reflete o estado atual sem manter uma segunda fonte no store global.
  useEffect(() => {
    let vivo = true;
    estadoConexaoGoogle().then((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function conectar() {
    setOcupado(true);
    const r = await conectarGoogle();
    // Em caso de sucesso a página navega para o Google e este componente
    // desmonta — só o erro volta para cá.
    if (!r.ok) {
      setOcupado(false);
      toast(r.mensagem || "Não foi possível iniciar a conexão.", "error");
    }
  }

  async function desconectar() {
    if (!confirm("Desconectar o Google Agenda? Os compromissos já criados continuam lá, mas param de ser atualizados."))
      return;
    setOcupado(true);
    const r = await desconectarGoogle();
    setOcupado(false);
    if (!r.ok) {
      toast(r.mensagem || "Não foi possível desconectar.", "error");
      return;
    }
    setEstado({ configurado: true, conectado: false, email: null });
    toast("Google Agenda desconectado.");
  }

  if (!estado) return null;

  if (!estado.configurado) {
    return (
      <div className="field-group">
        <label>Google Agenda</label>
        <div className="field-hint">
          A integração não está configurada neste servidor. É preciso definir as credenciais do
          Google nas variáveis de ambiente.
        </div>
      </div>
    );
  }

  return (
    <div className="field-group">
      <label>Google Agenda</label>
      {estado.conectado ? (
        <>
          <div className="google-conectado">
            <span className="google-ok">✓ Conectado</span>
            {estado.email && <span className="google-email">{estado.email}</span>}
          </div>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            Os compromissos criados aqui aparecem na sua Agenda do Google, com lembrete no celular.
            Concluir um compromisso marca o evento com ✓; excluir remove o evento.
          </div>
          <button type="button" className="btn btn-sm" onClick={desconectar} disabled={ocupado}>
            Desconectar
          </button>
        </>
      ) : (
        <>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            Conecte para que visitas e retornos marcados aqui apareçam na sua Agenda do Google — é
            de lá que sai o lembrete no celular. A sincronização é de mão única: o painel manda, o
            Google recebe.
          </div>
          <button type="button" className="btn btn-sm btn-primary" onClick={conectar} disabled={ocupado}>
            {ocupado ? "Abrindo o Google..." : "Conectar Google Agenda"}
          </button>
        </>
      )}
    </div>
  );
}
