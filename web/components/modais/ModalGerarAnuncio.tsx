"use client";

/* ================================================================
   MODAL: TÍTULO E DESCRIÇÃO PARA O PORTAL

   O imóvel foi captado e vira anúncio. A FICHA de lançamento é
   montada no Sistema Principal (Sophia) e quem publica é outra
   pessoa da imobiliária — este modal não recria a ficha, e é
   decisão: os campos dela aqui fariam digitar duas vezes e criariam
   duas fontes de verdade sobre o mesmo imóvel. O que a Sophia não faz
   é escrever o TEXTO, e é só isso que sai daqui, para colar lá.

   Três escolhas de tela:

   - **As fontes ficam à vista.** O corretor vê o que o painel já sabe
     antes de gerar. Sem isso, um texto que omitiu a metragem parece
     um texto ruim, quando é um texto honesto — a IA não tinha o dado.

   - **A caixa de colar é o caminho principal, não um extra.** O
     cadastro não tem área, andar nem mobília de propósito, então sem
     colar a ficha o anúncio sai magro. É por isso que o `faltando`
     volta da rota: ele transforma a caixa vazia num pedido concreto.

   - **O resultado é EDITÁVEL, e nada é gravado.** Mesma regra do
     resto do sistema: a IA sugere, o corretor confirma. O texto vai
     para a Sophia pela mão dele, e um anúncio é oferta pública — o
     último olho antes da publicação é o dele.
   ================================================================ */
import { useState } from "react";
import { CARACTERISTICAS_AUSENTES, fatosDoCadastro, mensagemFalhaIa } from "@/lib/calculo/ia";
import { enderecoComUnidade } from "@/lib/calculo/whatsapp";
import { gerarAnuncio } from "@/lib/ia";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

export default function ModalGerarAnuncio({ imovelId }: { imovelId: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const imoveis = useAppStore((s) => s.imoveis);
  const iaDisponivel = useAppStore((s) => s.iaDisponivel);
  const imovel = imoveis.find((i) => i.id === imovelId) || null;

  const [caracteristicas, setCaracteristicas] = useState("");
  const [gerando, setGerando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [faltando, setFaltando] = useState<string[]>([]);
  const [gerou, setGerou] = useState(false);

  if (!imovel) {
    return (
      <>
        <div className="modal-head">
          <div className="modal-title">Anúncio do imóvel</div>
          <button type="button" className="icon-btn" onClick={fecharModal}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="section-note">Imóvel não encontrado.</p>
        </div>
      </>
    );
  }

  const fatos = fatosDoCadastro(imovel);
  const temOriginal = !!(imovel.textoAnuncio || "").trim();

  async function gerar() {
    if (!imovel) return;
    setGerando(true);
    const r = await gerarAnuncio(imovel.id, caracteristicas.trim());
    setGerando(false);
    if (!r.ok || !r.anuncioGerado) {
      toast(r.mensagem || mensagemFalhaIa(r.falha || "falha-ia"), "error");
      return;
    }
    setTitulo(r.anuncioGerado.titulo);
    setDescricao(r.anuncioGerado.descricao);
    setFaltando(r.anuncioGerado.faltando || []);
    setGerou(true);
  }

  async function copiar(texto: string, oQue: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast(`${oQue} copiado.`);
    } catch {
      toast("Não foi possível copiar. Selecione o texto e copie à mão.", "error");
    }
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Anúncio do imóvel</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <p className="section-note" style={{ marginBottom: "14px" }}>
          {`Título e descrição para o portal — ${enderecoComUnidade(imovel)}. Confira e cole na ficha do Sistema Principal.`}
        </p>

        <fieldset>
          <legend>De onde sai o texto</legend>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            {fatos.length > 0
              ? `Do cadastro: ${fatos.map((f) => f.replace(/^- /, "")).join("; ")}.`
              : "O cadastro deste imóvel está sem características — só o que você colar abaixo será usado."}
            {temOriginal && " Também é usado o anúncio original do proprietário, guardado no garimpo."}
          </div>
          <div className="field-group">
            <label>Características da ficha (Sistema Principal)</label>
            <textarea
              rows={6}
              value={caracteristicas}
              onChange={(e) => setCaracteristicas(e.target.value)}
              placeholder={"Cole aqui a ficha do imóvel: área em m², andar, mobília, o que tem no condomínio…"}
            />
            <div className="field-hint">
              O painel não guarda esses campos — eles vivem na ficha do Sistema Principal. Sem eles o
              texto sai mais magro, porque a IA só pode afirmar o que tem fonte.
            </div>
          </div>
        </fieldset>

        {!iaDisponivel && (
          <p className="section-note">
            A geração por IA não está liberada nesta conta. Fale com o responsável pelo sistema.
          </p>
        )}

        {gerou && (
          <fieldset>
            <legend>Resultado</legend>
            {faltando.length > 0 && (
              <p className="section-note" style={{ marginTop: 0 }}>
                {`Ficou de fora por falta de fonte: ${faltando.join(", ")}. Cole esses dados acima e gere de novo.`}
              </p>
            )}
            <div className="field-group">
              <label>Título</label>
              <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              <div className="field-hint">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => copiar(titulo, "Título")}
                >
                  Copiar título
                </button>
              </div>
            </div>
            <div className="field-group">
              <label>Descrição</label>
              <textarea
                rows={10}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
              <div className="field-hint">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => copiar(descricao, "Descrição")}
                >
                  Copiar descrição
                </button>
              </div>
            </div>
            <p className="field-hint">
              Confira antes de publicar: anúncio é oferta pública, e sai com o nome da imobiliária.
            </p>
          </fieldset>
        )}
      </div>
      <div className="modal-foot">
        <div className="field-hint">
          {`A IA só afirma o que está nas fontes acima — o que faltar, ela omite (${CARACTERISTICAS_AUSENTES.length} características possíveis).`}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Fechar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={gerar}
            disabled={gerando || !iaDisponivel}
          >
            {gerando ? "Gerando..." : gerou ? "Gerar de novo" : "Gerar título e descrição"}
          </button>
        </div>
      </div>
    </>
  );
}
