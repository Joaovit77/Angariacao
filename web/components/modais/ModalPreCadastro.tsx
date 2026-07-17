"use client";

/* ================================================================
   MODAL: PRÉ-CADASTRO RÁPIDO
   Disparo rápido de angariação: com o mínimo (telefone + endereço +
   nome, e o CEP preenchendo o resto), cria o imóvel já em "Novo
   contato" marcado como pré-cadastro e abre o WhatsApp com a
   mensagem padrão de confirmação de endereço. O proprietário
   confirma/corrige na conversa; depois o corretor edita e confirma
   pelo modal completo — o que limpa a marca de pré-cadastro.
   ================================================================ */
import { useState } from "react";
import { captadorPadrao, useSessao } from "@/components/SessaoProvider";
import { sugerirCodigoImovel } from "@/lib/codigoImovel";
import { todayISO } from "@/lib/datas";
import { buscarCep, geocodeEndereco, maskCEP } from "@/lib/geo";
import { salvarImovel, uid } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";
import type { Imovel, StatusHistoryEntry } from "@/lib/tipos";

interface Status {
  msg: string;
  tone: "" | "ok" | "warn" | "err";
}

export default function ModalPreCadastro() {
  const abrirModal = useUiModal((s) => s.abrirModal);
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const imoveis = useAppStore((s) => s.imoveis);

  const [codigo, setCodigo] = useState(() => sugerirCodigoImovel(imoveis));
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("Londrina");
  const [proprietarioNome, setProprietarioNome] = useState("");
  const [proprietarioTelefone, setProprietarioTelefone] = useState("");
  const [cepStatus, setCepStatus] = useState<Status>({ msg: "", tone: "" });
  const [salvando, setSalvando] = useState(false);
  // Coordenadas geocodificadas a partir do CEP: gravadas junto do imóvel para
  // que a edição posterior já abra o mapa no ponto certo (sem rebuscar o CEP).
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  async function aoBuscarCep() {
    const raw = cep.replace(/\D/g, "");
    if (raw.length !== 8) {
      setCepStatus({ msg: "CEP inválido — precisa ter 8 dígitos.", tone: "err" });
      return;
    }
    setCepStatus({ msg: "Buscando...", tone: "" });
    let data;
    try {
      data = await buscarCep(raw);
    } catch {
      setCepStatus({ msg: "Não foi possível buscar o CEP agora. Verifique sua conexão.", tone: "err" });
      return;
    }
    if (data.erro) {
      setCepStatus({ msg: "CEP não encontrado.", tone: "err" });
      return;
    }
    let novoEndereco = endereco;
    if (data.logradouro) {
      const numeroDigitado = (endereco.match(/,\s*(.+)$/) || [])[1];
      novoEndereco = numeroDigitado ? `${data.logradouro}, ${numeroDigitado}` : data.logradouro;
      setEndereco(novoEndereco);
    }
    const novoBairro = data.bairro || bairro;
    const novaCidade = data.localidade || cidade;
    if (data.bairro) setBairro(data.bairro);
    if (data.localidade) setCidade(data.localidade);
    setCepStatus({ msg: "Endereço preenchido a partir do CEP.", tone: "ok" });

    // Geocodifica em segundo plano e guarda as coordenadas. Assim, quando o
    // corretor abrir a edição depois, o mini-mapa já aparece no ponto do CEP —
    // sem precisar clicar em "Buscar CEP" de novo. É um bônus silencioso: se
    // falhar, o cadastro segue normalmente e a edição ainda pode localizar.
    try {
      const found = await geocodeEndereco(novoEndereco.trim(), novoBairro.trim(), novaCidade.trim());
      if (found) {
        setLatitude(found.lat);
        setLongitude(found.lon);
      }
    } catch {
      /* silencioso — coordenadas são opcionais aqui */
    }
  }

  async function salvar() {
    if (!usuario) return;
    const enderecoLimpo = endereco.trim();
    if (!enderecoLimpo) {
      toast("Informe ao menos o endereço do imóvel.", "error");
      return;
    }

    const codigoLimpo = codigo.trim();
    if (codigoLimpo) {
      const jaExiste = imoveis.some((i) => (i.codigo || "").trim().toLowerCase() === codigoLimpo.toLowerCase());
      if (jaExiste) {
        toast(`Já existe um imóvel com o código "${codigoLimpo}".`, "error");
        return;
      }
    }

    setSalvando(true);

    // Garante as coordenadas ANTES de salvar. A geocodificação disparada no
    // "Buscar CEP" roda em segundo plano e faz várias tentativas no Nominatim
    // (leva alguns segundos); se o corretor clicar rápido em salvar, ela ainda
    // não terminou e latitude/longitude estariam null — o imóvel iria sem
    // localização e a edição depois abriria sem o mapa (tinha que rebuscar).
    // Se as coordenadas já vieram do segundo plano, reusa e não rebusca.
    let lat = latitude;
    let lng = longitude;
    if (lat == null) {
      try {
        const found = await geocodeEndereco(enderecoLimpo, bairro.trim(), cidade.trim());
        if (found) {
          lat = found.lat;
          lng = found.lon;
        }
      } catch {
        /* silencioso — coordenadas são opcionais; a edição ainda pode localizar */
      }
    }

    const hoje = todayISO();
    const historico: StatusHistoryEntry[] = [{ status: "Novo contato", date: hoje }];
    const data: Imovel = {
      id: uid(),
      codigo: codigoLimpo,
      endereco: enderecoLimpo,
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      proprietarioNome: proprietarioNome.trim(),
      proprietarioTelefone: proprietarioTelefone.trim(),
      cep: cep.trim(),
      latitude: lat,
      longitude: lng,
      status: "Novo contato",
      dataAngariacao: hoje,
      // O pré-cadastro não pergunta o captador (é o modal de 3 campos), mas
      // quem cadastra é quem captou — sem isso a linha nasce com captador
      // vazio e some dos filtros/relatórios por captador.
      responsavel: captadorPadrao(usuario, imoveis),
      statusHistory: historico,
      preCadastro: true,
    };

    const { ok } = await salvarImovel(data, usuario.id, false);
    setSalvando(false);
    if (!ok) return;

    // Abre o modal de WhatsApp já na "Confirmação de endereço" — o corretor
    // revisa/edita o texto (e pode salvar como modelo) antes de enviar.
    abrirModal("whatsapp", data.id, "confirmacao-endereco");
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Pré-cadastro rápido</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <p className="section-note" style={{ marginBottom: "14px" }}>
          Cadastro rápido para já mandar a confirmação de endereço no WhatsApp. O imóvel entra no
          funil como <strong>pré-cadastro</strong>; depois é só editar e confirmar os dados.
        </p>
        <fieldset>
          <legend>Dados do imóvel</legend>
          <div className="field-row">
            <div className="field-group">
              <label>Código do imóvel</label>
              <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex: LD-01" />
            </div>
            <div className="field-group">
              <label>CEP</label>
              <div className="geocode-box">
                <input
                  type="text"
                  value={cep}
                  placeholder="00000-000"
                  maxLength={9}
                  style={{ maxWidth: "140px" }}
                  onChange={(e) => setCep(maskCEP(e.target.value))}
                  onBlur={() => {
                    if (cep.replace(/\D/g, "").length === 8) aoBuscarCep();
                  }}
                />
                <button type="button" className="btn btn-sm" onClick={aoBuscarCep}>
                  🔍 Buscar
                </button>
              </div>
            </div>
          </div>
          <span className={`geocode-status ${cepStatus.tone}`}>{cepStatus.msg}</span>
          <div className="field-group">
            <label>Endereço</label>
            <input
              type="text"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, número"
            />
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Bairro</label>
              <input type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Cidade</label>
              <input type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Proprietário</legend>
          <div className="field-row">
            <div className="field-group">
              <label>Nome do proprietário</label>
              <input
                type="text"
                value={proprietarioNome}
                onChange={(e) => setProprietarioNome(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label>Telefone (WhatsApp)</label>
              <input
                type="tel"
                value={proprietarioTelefone}
                onChange={(e) => setProprietarioTelefone(e.target.value)}
                placeholder="(43) 9...."
              />
            </div>
          </div>
          <div className="field-hint">
            Ao salvar, abre a mensagem de confirmação de endereço para você revisar, editar e enviar
            pelo WhatsApp.
          </div>
        </fieldset>
      </div>
      <div className="modal-foot">
        <div></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Criar e escrever WhatsApp"}
          </button>
        </div>
      </div>
    </>
  );
}
