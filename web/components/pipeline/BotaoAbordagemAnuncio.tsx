"use client";

/* ================================================================
   BOTÃO: ABORDAGEM A PARTIR DO ANÚNCIO

   Gera a primeira mensagem ao proprietário lendo o anúncio que ele
   mesmo publicou, e abre o ModalWhatsapp já creditando a abordagem
   "Análise do anúncio (IA)" do catálogo.

   Duas decisões de tela:

   - **Só aparece com anúncio retido.** Sem `textoAnuncio` a IA não tem
     o que analisar e a mensagem sairia genérica — que é exatamente o
     que o corretor já tem nos roteiros dele. Como a retenção começou
     agora, o botão nasce aparecendo só nos garimpos novos, e isso é
     honesto: é neles que a feature funciona.

   - **Diz onde está registrando.** A abordagem é criada no catálogo na
     primeira geração, e efeito colateral silencioso no que alimenta o
     ranking é o tipo de coisa que faz o corretor desconfiar do número
     depois. Melhor ele ler antes.
   ================================================================ */
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { mensagemFalhaIa } from "@/lib/calculo/ia";
import { ABORDAGEM_ANALISE_ANUNCIO } from "@/lib/constantes";
import { abordagemDoAnuncio } from "@/lib/ia";
import { garantirAbordagemDoAnuncio } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";
import type { Imovel } from "@/lib/tipos";

export default function BotaoAbordagemAnuncio({ imovel }: { imovel: Imovel }) {
  const { usuario } = useSessao();
  const iaDisponivel = useAppStore((s) => s.iaDisponivel);
  const abrirWhatsappAbordagem = useUiModal((s) => s.abrirWhatsappAbordagem);
  const [gerando, setGerando] = useState(false);

  if (!iaDisponivel) return null;

  async function gerar() {
    if (!usuario) return;
    setGerando(true);
    /* A abordagem do catálogo primeiro: sem ela não há id estável para
       creditar, e a mensagem sairia fora do ranking — que era o motivo da
       feature. Falhar aqui não vira envio sem crédito, vira aviso. */
    const abordagem = await garantirAbordagemDoAnuncio(usuario.id);
    if (!abordagem) {
      setGerando(false);
      return;
    }
    const r = await abordagemDoAnuncio(imovel.id);
    setGerando(false);
    if (!r.ok || !r.abordagem) {
      toast(r.mensagem || mensagemFalhaIa(r.falha || "falha-ia"), "error");
      return;
    }
    const pontos = r.abordagem.pontos;
    if (pontos.length > 0) toast(`Apoiada em: ${pontos.join(", ")}.`);
    abrirWhatsappAbordagem(
      imovel.id,
      r.abordagem.mensagem,
      abordagem.id,
      r.sugestaoId
        ? { id: r.sugestaoId, textoSugerido: r.abordagem.mensagem }
        : undefined,
    );
  }

  return (
    <div className="drawer-section">
      <div className="drawer-section-title">Abordagem pelo anúncio</div>
      <div className="drawer-notas-resumo">
        <span className="drawer-notes">
          {`Primeira mensagem escrita a partir do anúncio dele. Registra em "${ABORDAGEM_ANALISE_ANUNCIO}", que entra no ranking.`}
        </span>
        <button type="button" className="btn btn-sm" onClick={gerar} disabled={gerando}>
          {gerando ? "Escrevendo..." : "Gerar abordagem"}
        </button>
      </div>
    </div>
  );
}
