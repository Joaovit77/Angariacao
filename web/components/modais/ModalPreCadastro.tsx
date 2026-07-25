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
import { ORIGENS_IMOVEL } from "@/lib/constantes";
import { sugerirCodigoImovel } from "@/lib/codigoImovel";
import { todayISO } from "@/lib/datas";
import { descreverDuplicados, imoveisDuplicados } from "@/lib/calculo/duplicidade";
import { mensagemFalhaIa, type AnuncioExtraido } from "@/lib/calculo/ia";
import { fmtMoney } from "@/lib/formatadores";
import { buscarCep, geocodeEndereco, maskCEP } from "@/lib/geo";
import { extrairAnuncio } from "@/lib/ia";
import { prepararImagemParaIa } from "@/lib/imagem";
import { salvarImovel, uid } from "@/lib/mutacoes";
import { nomeProprio } from "@/lib/normalizacao";
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
  const origensExtras = useAppStore((s) => s.config.origensExtras);
  const iaDisponivel = useAppStore((s) => s.iaDisponivel);

  const [codigo, setCodigo] = useState(() => sugerirCodigoImovel(imoveis));
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  // Unidade e bloco são IDENTIDADE, não detalhe: no mesmo prédio o ap 101 e o
  // 202 são imóveis diferentes, de donos diferentes. Estão aqui, no modal de
  // cadastro mínimo, porque sem eles a checagem de duplicidade compara dois
  // apartamentos vizinhos como se fossem o mesmo imóvel e acusa falso a cada
  // unidade nova — e prédio é a maior parte do garimpo.
  const [unidade, setUnidade] = useState("");
  const [bloco, setBloco] = useState("");
  const [edificio, setEdificio] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("Londrina");
  const [proprietarioNome, setProprietarioNome] = useState("");
  const [proprietarioTelefone, setProprietarioTelefone] = useState("");
  // Sem padrão, pela mesma razão do ModalImovel: chutar a origem envenena o
  // ranking de canais. A diferença é que aqui ela vem preenchida quando a IA
  // consegue deduzir do material lido (placa é "Placa no imóvel", print da OLX
  // é "OLX / Canal Pro") — dedução a partir do que foi visto, não do primeiro
  // item da lista. Antes este modal não gravava origem NENHUMA, e todo imóvel
  // capturado rápido ficava invisível no Foco do dia e no ranking de canais.
  const [origemImovel, setOrigemImovel] = useState("");
  const [cepStatus, setCepStatus] = useState<Status>({ msg: "", tone: "" });
  const [salvando, setSalvando] = useState(false);

  // --- captura por foto/texto ---
  const [textoAnuncio, setTextoAnuncio] = useState("");
  const [lendo, setLendo] = useState(false);
  const [iaStatus, setIaStatus] = useState<Status>({ msg: "", tone: "" });
  // O que a IA leu além dos campos do formulário. Fica visível no resumo antes
  // de salvar — dado que o corretor não viu não deveria entrar na carteira em
  // silêncio, ainda que estes campos sejam inofensivos perto do telefone.
  const [extras, setExtras] = useState<Pick<
    AnuncioExtraido,
    "tipo" | "quartos" | "vagas" | "valorAluguel"
  > | null>(null);
  // Coordenadas geocodificadas a partir do CEP: gravadas junto do imóvel para
  // que a edição posterior já abra o mapa no ponto certo (sem rebuscar o CEP).
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // Derivado a cada render (nada de setState em efeito — regra do React
  // Compiler no CLAUDE.md). Este modal só checava código repetido; endereço
  // repetido passava batido, e é justamente o que o garimpo produz: a mesma
  // placa fotografada duas vezes, o mesmo anúncio visto na OLX e no Marketplace.
  const duplicados = imoveisDuplicados({ endereco, cidade, unidade, bloco }, imoveis, null);

  /** Aplica no formulário o que a IA leu. Só PREENCHE — quem salva é o
      corretor, depois de conferir. Campo que voltou null não apaga o que já
      estava digitado: a leitura complementa o cadastro, não o substitui. */
  function aplicarExtracao(a: AnuncioExtraido) {
    if (a.proprietarioNome) setProprietarioNome(nomeProprio(a.proprietarioNome));
    if (a.proprietarioTelefone) setProprietarioTelefone(a.proprietarioTelefone);
    if (a.endereco) setEndereco(a.endereco);
    if (a.unidade) setUnidade(a.unidade);
    if (a.bloco) setBloco(a.bloco);
    if (a.edificio) setEdificio(a.edificio);
    if (a.bairro) setBairro(a.bairro);
    if (a.cidade) setCidade(a.cidade);
    if (a.cep) setCep(maskCEP(a.cep));
    if (a.origemSugerida) setOrigemImovel(a.origemSugerida);
    setExtras({ tipo: a.tipo, quartos: a.quartos, vagas: a.vagas, valorAluguel: a.valorAluguel });

    const achouTelefone = !!a.proprietarioTelefone;
    if (a.confianca === "baixa") {
      setIaStatus({
        msg: "Li com dificuldade — confira cada campo antes de mandar a mensagem.",
        tone: "warn",
      });
    } else if (!achouTelefone) {
      setIaStatus({
        msg: "Li os dados do imóvel, mas não achei o telefone. Complete à mão.",
        tone: "warn",
      });
    } else {
      setIaStatus({ msg: "Campos preenchidos. Confira antes de salvar.", tone: "ok" });
    }
  }

  async function lerImagem(arquivo: File) {
    setLendo(true);
    setIaStatus({ msg: "Lendo a imagem...", tone: "" });
    let imagemBase64: string;
    try {
      imagemBase64 = await prepararImagemParaIa(arquivo);
    } catch {
      setLendo(false);
      setIaStatus({ msg: "Não consegui abrir essa imagem. Tente outra foto.", tone: "err" });
      return;
    }
    const r = await extrairAnuncio({ imagemBase64 });
    setLendo(false);
    if (!r.ok || !r.anuncio) {
      setIaStatus({ msg: r.mensagem || mensagemFalhaIa(r.falha || "falha-ia"), tone: "err" });
      return;
    }
    aplicarExtracao(r.anuncio);
  }

  async function lerTexto() {
    if (!textoAnuncio.trim()) {
      setIaStatus({ msg: "Cole o texto do anúncio primeiro.", tone: "err" });
      return;
    }
    setLendo(true);
    setIaStatus({ msg: "Lendo o anúncio...", tone: "" });
    const r = await extrairAnuncio({ texto: textoAnuncio });
    setLendo(false);
    if (!r.ok || !r.anuncio) {
      setIaStatus({ msg: r.mensagem || mensagemFalhaIa(r.falha || "falha-ia"), tone: "err" });
      return;
    }
    aplicarExtracao(r.anuncio);
  }

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

    // Endereço repetido AVISA, não bloqueia — mesma regra do ModalImovel:
    // recadastrar às vezes é proposital (um "Perdido" que voltou a atender).
    if (duplicados.length) {
      const seguir = confirm(`${descreverDuplicados(duplicados)}\n\nDeseja cadastrar assim mesmo?`);
      if (!seguir) return;
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
      unidade: unidade.trim(),
      bloco: bloco.trim(),
      edificio: edificio.trim(),
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      proprietarioNome: nomeProprio(proprietarioNome),
      proprietarioTelefone: proprietarioTelefone.trim(),
      cep: cep.trim(),
      origemImovel,
      // O que a IA leu além dos campos do formulário. Já foi mostrado no resumo
      // antes de salvar, e é editável depois no cadastro completo.
      tipo: extras?.tipo ?? null,
      quartos: extras?.quartos ?? null,
      vagas: extras?.vagas ?? null,
      valorAluguel: extras?.valorAluguel ?? null,
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
        {/* Sem chave no servidor (ou sem permissão na conta) o bloco nem
            aparece — e o pré-cadastro segue sendo o cadastro manual de sempre. */}
        {iaDisponivel && (
          <fieldset>
            <legend>Capturar de foto ou anúncio</legend>
            <div className="field-hint" style={{ marginBottom: "10px" }}>
              Fotografe a placa de &quot;aluga-se&quot;, mande o print do anúncio ou cole o texto. Os
              campos abaixo se preenchem — confira antes de salvar.
            </div>
            <div className="field-group">
              <label>Foto da placa ou print do anúncio</label>
              {/* capture="environment" faz o celular abrir a câmera traseira
                  direto, que é o caminho de quem está na rua vendo a placa. */}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={lendo}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  // Zera o input para que escolher a MESMA foto de novo (depois
                  // de uma leitura ruim) dispare o onChange outra vez.
                  e.target.value = "";
                  if (arquivo) lerImagem(arquivo);
                }}
              />
            </div>
            <div className="field-group">
              <label>Ou cole o texto do anúncio</label>
              <textarea
                rows={3}
                value={textoAnuncio}
                disabled={lendo}
                onChange={(e) => setTextoAnuncio(e.target.value)}
                placeholder="Cole aqui o anúncio da OLX, do Marketplace ou a mensagem que você recebeu."
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button type="button" className="btn btn-sm" onClick={lerTexto} disabled={lendo}>
                {lendo ? "Lendo..." : "✨ Ler com IA"}
              </button>
              <span className={`geocode-status ${iaStatus.tone}`}>{iaStatus.msg}</span>
            </div>
            {extras && (extras.tipo || extras.quartos || extras.vagas || extras.valorAluguel) && (
              <div className="field-hint" style={{ marginTop: "8px" }}>
                Também li e vou salvar:{" "}
                {[
                  extras.tipo,
                  extras.quartos ? `${extras.quartos} quarto(s)` : null,
                  extras.vagas ? `${extras.vagas} vaga(s)` : null,
                  extras.valorAluguel ? fmtMoney(extras.valorAluguel) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </fieldset>
        )}
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
            {duplicados.length > 0 && (
              <div className="field-hint" style={{ color: "var(--danger, #d64545)", fontWeight: 600 }}>
                ⚠️ {descreverDuplicados(duplicados)} Confira antes de cadastrar de novo.
              </div>
            )}
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Apartamento / unidade</label>
              <input
                type="text"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="Ex: 806"
              />
            </div>
            <div className="field-group">
              <label>Bloco / torre</label>
              <input
                type="text"
                value={bloco}
                onChange={(e) => setBloco(e.target.value)}
                placeholder="Ex: B"
              />
            </div>
          </div>
          <div className="field-hint">
            Em prédio, a unidade é o que separa um imóvel do outro — sem ela, dois apartamentos
            vizinhos parecem o mesmo cadastro.
          </div>
          <div className="field-group">
            <label>Edifício / condomínio</label>
            <input type="text" value={edificio} onChange={(e) => setEdificio(e.target.value)} />
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
          <div className="field-group">
            <label>Onde encontrou o imóvel</label>
            {/* Fixos + portais cadastrados pelo corretor, como no ModalImovel.
                Sem isto o imóvel some do Foco do dia e do ranking de canais. */}
            <select value={origemImovel} onChange={(e) => setOrigemImovel(e.target.value)}>
              <option value="">Não informado</option>
              {[...new Set([...ORIGENS_IMOVEL, ...origensExtras, ...(origemImovel ? [origemImovel] : [])])].map(
                (o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ),
              )}
            </select>
          </div>
        </fieldset>
        <fieldset>
          <legend>Proprietário</legend>
          <div className="field-row">
            <div className="field-group">
              <label>Nome do proprietário</label>
              {/* Caixa ajustada no blur — ver o comentário no ModalImovel. */}
              <input
                type="text"
                value={proprietarioNome}
                onChange={(e) => setProprietarioNome(e.target.value)}
                onBlur={(e) => setProprietarioNome(nomeProprio(e.target.value))}
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
