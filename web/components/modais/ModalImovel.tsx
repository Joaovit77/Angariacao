"use client";

/* ================================================================
   MODAL: IMÓVEL (criação / edição)
   Port de openImovelModal() + saveImovel() + buscarCEP() +
   geocodeEndereco() + abrirNoGoogleMaps() (app.js, 6A).

   A mudança de status passa por aplicarMudancaDeStatus(), o único
   ponto que empurra {status, date} no statusHistory — invariante
   §3.1 do MIGRATION_NEXT.md.
   ================================================================ */
import { useState } from "react";
import dynamic from "next/dynamic";
import { useSessao } from "@/components/SessaoProvider";
import {
  FORMAS_ABORDAGEM,
  MOTIVOS_PERDA,
  ORIGENS_IMOVEL,
  STATUS_ALL,
  STATUS_TERMINAL_NEGATIVE,
  TIPOS_IMOVEL,
} from "@/lib/constantes";
import { todayISO } from "@/lib/datas";
import { fmtMoney } from "@/lib/formatadores";
import { buscarCep, geocodeEndereco, maskCEP } from "@/lib/geo";
import { aplicarMudancaDeStatus, excluirImovel, numOrNull, salvarImovel, uid } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";
import type { Imovel, StatusHistoryEntry } from "@/lib/tipos";

const MiniMapa = dynamic(() => import("./MiniMapa"), { ssr: false });

const TERMINAIS: readonly string[] = STATUS_TERMINAL_NEGATIVE;

/** Um status sem pausa: saídas laterais e Locado não têm follow-up a pausar. */
const semPausa = (status: string) => TERMINAIS.includes(status) || status === "Locado";
/** "Sem resposta" é saída lateral, mas não pede motivo. */
const pedeMotivo = (status: string) => TERMINAIS.includes(status) && status !== "Sem resposta";

interface Status {
  msg: string;
  tone: "" | "ok" | "warn" | "err";
}

export default function ModalImovel({ id }: { id?: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const imoveis = useAppStore((s) => s.imoveis);
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);

  const imovel = id ? imoveis.find((i) => i.id === id) || null : null;

  const [codigo, setCodigo] = useState(imovel?.codigo ?? "");
  const [referenciaCrm, setReferenciaCrm] = useState(imovel?.referenciaCrm ?? "");
  const [tipo, setTipo] = useState(imovel?.tipo ?? "Apartamento");
  const [cep, setCep] = useState(imovel?.cep ?? "");
  const [endereco, setEndereco] = useState(imovel?.endereco ?? "");
  const [bairro, setBairro] = useState(imovel?.bairro ?? "");
  const [cidade, setCidade] = useState(imovel?.cidade ?? "Londrina");
  const [quartos, setQuartos] = useState(imovel?.quartos != null ? String(imovel.quartos) : "");
  const [banheiros, setBanheiros] = useState(imovel?.banheiros != null ? String(imovel.banheiros) : "");
  const [vagas, setVagas] = useState(imovel?.vagas != null ? String(imovel.vagas) : "");
  const [valorAluguel, setValorAluguel] = useState(imovel?.valorAluguel != null ? String(imovel.valorAluguel) : "");
  const [valorCondominio, setValorCondominio] = useState(
    imovel?.valorCondominio != null ? String(imovel.valorCondominio) : "",
  );
  const [origemImovel, setOrigemImovel] = useState(imovel?.origemImovel ?? ORIGENS_IMOVEL[0]);
  const [imobiliariaConcorrente, setImobiliariaConcorrente] = useState(imovel?.imobiliariaConcorrente ?? "");
  const [proprietarioNome, setProprietarioNome] = useState(imovel?.proprietarioNome ?? "");
  const [proprietarioTelefone, setProprietarioTelefone] = useState(imovel?.proprietarioTelefone ?? "");
  const [formaAbordagem, setFormaAbordagem] = useState(imovel?.formaAbordagem ?? FORMAS_ABORDAGEM[0]);
  const [dataAngariacao, setDataAngariacao] = useState(imovel?.dataAngariacao ?? todayISO());
  const [responsavel, setResponsavel] = useState(imovel?.responsavel ?? "");
  const [status, setStatus] = useState(imovel?.status ?? "Novo contato");
  const [observacoes, setObservacoes] = useState(imovel?.observacoes ?? "");
  const [pausadoAte, setPausadoAte] = useState(imovel?.pausadoAte ?? "");
  const [criarLembretePausa, setCriarLembretePausa] = useState(true);
  const [motivoPerda, setMotivoPerda] = useState(imovel?.motivoPerda ?? "");
  const [motivoPerdaOutro, setMotivoPerdaOutro] = useState(imovel?.motivoPerdaOutro ?? "");
  const [comissaoRecebida, setComissaoRecebida] = useState(!!imovel?.comissaoRecebida);
  const [comissaoRecebidaValor, setComissaoRecebidaValor] = useState(
    imovel?.comissaoRecebidaValor != null ? String(imovel.comissaoRecebidaValor) : "",
  );
  const [comissaoRecebidaData, setComissaoRecebidaData] = useState(imovel?.comissaoRecebidaData || todayISO());

  const [latitude, setLatitude] = useState<number | null>(imovel?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(imovel?.longitude ?? null);
  const [mapaVisivel, setMapaVisivel] = useState(imovel?.latitude != null);
  const [zoomMapa, setZoomMapa] = useState(16);

  const [cepStatus, setCepStatus] = useState<Status>({ msg: "", tone: "" });
  const [geocodeStatus, setGeocodeStatus] = useState<Status>({
    msg: imovel?.latitude ? "Localização definida" : "Ainda não localizado",
    tone: "",
  });
  const [salvando, setSalvando] = useState(false);

  const concorrentes = [...new Set([...imoveis.map((i) => i.imobiliariaConcorrente), imobiliariaConcorrente]
    .map((v) => (v || "").trim())
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  async function aoBuscarCep() {
    const raw = cep.replace(/\D/g, "");
    if (raw.length !== 8) {
      setCepStatus({ msg: "CEP inválido — precisa ter 8 dígitos.", tone: "err" });
      return;
    }
    setCepStatus({ msg: "Buscando...", tone: "" });
    let dadosEndereco: { logradouro?: string; bairro?: string; localidade?: string };
    try {
      const data = await buscarCep(raw);
      if (data.erro) {
        setCepStatus({ msg: "CEP não encontrado.", tone: "err" });
        return;
      }
      dadosEndereco = data;
    } catch {
      setCepStatus({ msg: "Não foi possível buscar o CEP agora. Verifique sua conexão.", tone: "err" });
      return;
    }

    // Mantém eventual número já digitado, só troca o nome da rua
    let novoEndereco = endereco;
    if (dadosEndereco.logradouro) {
      const numeroDigitado = (endereco.match(/,\s*(.+)$/) || [])[1];
      novoEndereco = numeroDigitado ? `${dadosEndereco.logradouro}, ${numeroDigitado}` : dadosEndereco.logradouro;
      setEndereco(novoEndereco);
    }
    const novoBairro = dadosEndereco.bairro || bairro;
    const novaCidade = dadosEndereco.localidade || cidade;
    if (dadosEndereco.bairro) setBairro(dadosEndereco.bairro);
    if (dadosEndereco.localidade) setCidade(dadosEndereco.localidade);

    setCepStatus({ msg: "Endereço preenchido a partir do CEP.", tone: "ok" });
    toast("Endereço preenchido pelo CEP.");

    // Já aproveita para localizar no mapa automaticamente
    await localizarNoMapa(novoEndereco, novoBairro, novaCidade);
  }

  async function localizarNoMapa(end = endereco, bai = bairro, cid = cidade) {
    const enderecoCompleto = end.trim();
    if (!enderecoCompleto) {
      toast("Preencha o endereço antes de localizar no mapa.", "error");
      return;
    }
    setGeocodeStatus({ msg: "Buscando...", tone: "" });
    let found;
    try {
      found = await geocodeEndereco(enderecoCompleto, bai.trim(), cid.trim());
    } catch {
      setGeocodeStatus({ msg: "Não foi possível buscar agora. Verifique sua conexão.", tone: "err" });
      return;
    }

    if (!found) {
      setGeocodeStatus({ msg: "Endereço não encontrado. Você pode arrastar o pino manualmente.", tone: "err" });
      setMapaVisivel(true);
      return;
    }

    setLatitude(found.lat);
    setLongitude(found.lon);
    setZoomMapa(found.usedFallback ? 15 : 16);
    setMapaVisivel(true);
    setGeocodeStatus({
      msg: found.usedFallback
        ? "Número exato não encontrado — pino aproximado pela rua/bairro. Arraste para ajustar."
        : "Localização encontrada — arraste o pino se precisar ajustar.",
      tone: found.usedFallback ? "warn" : "ok",
    });
  }

  function abrirNoGoogleMaps() {
    if (!endereco.trim()) {
      toast("Preencha o endereço antes de conferir no Google Maps.", "error");
      return;
    }
    const query = [endereco.trim(), bairro.trim(), cidade.trim(), "Brasil"].filter(Boolean).join(", ");
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, "_blank");
    // garante que o mini-mapa já esteja visível para facilitar clicar no ponto
    // certo assim que a pessoa voltar da aba do Google Maps
    setMapaVisivel(true);
  }

  async function salvar() {
    if (!usuario) return;
    const enderecoLimpo = endereco.trim();
    if (!enderecoLimpo) {
      toast("Informe o endereço do imóvel.", "error");
      return;
    }
    if (!dataAngariacao) {
      toast("Informe a data do primeiro contato.", "error");
      return;
    }

    const historico: StatusHistoryEntry[] = imovel
      ? [...(imovel.statusHistory || [])]
      : [{ status: "Novo contato", date: dataAngariacao }];

    const data: Imovel = {
      id: imovel ? imovel.id : uid(),
      codigo: codigo.trim(),
      referenciaCrm: referenciaCrm.trim(),
      cep: cep.trim(),
      endereco: enderecoLimpo,
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      tipo,
      quartos: numOrNull(quartos),
      banheiros: numOrNull(banheiros),
      vagas: numOrNull(vagas),
      valorAluguel: numOrNull(valorAluguel) || 0,
      valorCondominio: numOrNull(valorCondominio) || 0,
      proprietarioNome: proprietarioNome.trim(),
      proprietarioTelefone: proprietarioTelefone.trim(),
      formaAbordagem,
      origemImovel,
      imobiliariaConcorrente: imobiliariaConcorrente.trim(),
      latitude,
      longitude,
      dataAngariacao,
      responsavel: responsavel.trim(),
      status,
      observacoes: observacoes.trim(),
      statusHistory: historico,
      pausadoAte: semPausa(status) ? null : pausadoAte || null,
      motivoPerda: pedeMotivo(status) ? motivoPerda : "",
      motivoPerdaOutro: pedeMotivo(status) && motivoPerda === "Outro" ? motivoPerdaOutro.trim() : "",
      comissaoRecebida: status === "Locado" ? comissaoRecebida : false,
      comissaoRecebidaValor: status === "Locado" ? numOrNull(comissaoRecebidaValor) : null,
      comissaoRecebidaData: status === "Locado" ? comissaoRecebidaData || null : null,
    };

    aplicarMudancaDeStatus(data, status, imovel ? imovel.status : null);

    setSalvando(true);
    const { ok } = await salvarImovel(data, usuario.id, !!data.pausadoAte && criarLembretePausa);
    setSalvando(false);
    if (ok) fecharModal();
  }

  async function excluir() {
    if (!imovel) return;
    const ok = await excluirImovel(imovel.id);
    if (ok) fecharModal();
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">{imovel ? "Editar imóvel" : "Nova angariação"}</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <fieldset>
          <legend>Dados do imóvel</legend>
          <div className="field-row-3">
            <div className="field-group">
              <label>Código do imóvel</label>
              <input type="text" value={codigo ?? ""} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex: LD-0234" />
            </div>
            <div className="field-group">
              <label>Referência CRM</label>
              <input type="text" value={referenciaCrm ?? ""} onChange={(e) => setReferenciaCrm(e.target.value)} placeholder="Ex: 45231" />
            </div>
            <div className="field-group">
              <label>Tipo do imóvel</label>
              <select value={tipo ?? ""} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_IMOVEL.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-hint" style={{ marginTop: "-6px" }}>
            A <strong>Referência CRM</strong> é o código que o sistema da imobiliária gera para o
            imóvel angariado — aparece nos relatórios.
          </div>
          <div className="field-group">
            <label>CEP</label>
            <div className="geocode-box">
              <input
                type="text"
                value={cep ?? ""}
                placeholder="00000-000"
                maxLength={9}
                style={{ maxWidth: "160px" }}
                onChange={(e) => setCep(maskCEP(e.target.value))}
                onBlur={() => {
                  if (cep.replace(/\D/g, "").length === 8) aoBuscarCep();
                }}
              />
              <button type="button" className="btn btn-sm" onClick={aoBuscarCep}>
                🔍 Buscar CEP
              </button>
              <span className={`geocode-status ${cepStatus.tone}`}>{cepStatus.msg}</span>
            </div>
            <div className="field-hint">Preenche endereço, bairro e cidade automaticamente e já localiza no mapa.</div>
          </div>
          <div className="field-group">
            <label>Endereço</label>
            <input type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número" />
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Bairro</label>
              <input type="text" value={bairro ?? ""} onChange={(e) => setBairro(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Cidade</label>
              <input type="text" value={cidade ?? ""} onChange={(e) => setCidade(e.target.value)} />
            </div>
          </div>
          <div className="field-row-3">
            <div className="field-group">
              <label>Quartos</label>
              <input type="number" min="0" value={quartos} onChange={(e) => setQuartos(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Banheiros</label>
              <input type="number" min="0" value={banheiros} onChange={(e) => setBanheiros(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Vagas de garagem</label>
              <input type="number" min="0" value={vagas} onChange={(e) => setVagas(e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Valor do aluguel (R$)</label>
              <input type="number" min="0" step="0.01" value={valorAluguel} onChange={(e) => setValorAluguel(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Valor do condomínio (R$)</label>
              <input type="number" min="0" step="0.01" value={valorCondominio} onChange={(e) => setValorCondominio(e.target.value)} />
            </div>
          </div>
          <div className="field-group">
            <label>Onde encontrou o imóvel</label>
            <select value={origemImovel ?? ""} onChange={(e) => setOrigemImovel(e.target.value)}>
              {ORIGENS_IMOVEL.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label>Já está com outra imobiliária?</label>
            <input
              type="text"
              list="imobiliarias-concorrentes-list"
              value={imobiliariaConcorrente ?? ""}
              onChange={(e) => setImobiliariaConcorrente(e.target.value)}
              placeholder="Selecione ou digite uma nova imobiliária"
            />
            <datalist id="imobiliarias-concorrentes-list">
              {concorrentes.map((nome) => (
                <option key={nome} value={nome}></option>
              ))}
            </datalist>
            <div className="field-hint">
              Selecione uma imobiliária já usada ou digite um novo nome. Ao salvar, o novo nome
              aparecerá como opção nos próximos cadastros.
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Localização no mapa</legend>
          <div className="geocode-box">
            <button type="button" className="btn btn-sm" onClick={() => localizarNoMapa()}>
              📍 Buscar aproximado
            </button>
            <button type="button" className="btn btn-sm" onClick={abrirNoGoogleMaps}>
              🔗 Conferir no Google Maps
            </button>
            <span className={`geocode-status ${geocodeStatus.tone}`}>{geocodeStatus.msg}</span>
          </div>
          <MiniMapa
            lat={latitude}
            lng={longitude}
            zoom={zoomMapa}
            visivel={mapaVisivel}
            aoEscolherPonto={(la, ln, origem) => {
              setLatitude(la);
              setLongitude(ln);
              setGeocodeStatus({
                msg: origem === "clique" ? "Localização definida manualmente pelo clique." : "Localização ajustada manualmente.",
                tone: "ok",
              });
            }}
          />
          <div className="map-mini-hint">
            <strong>Para o pino ficar no lugar certo:</strong> clique em &quot;Conferir no Google
            Maps&quot; pra ver a casa exata, depois clique nesse ponto aqui no mapinha abaixo (não
            precisa arrastar — um clique já reposiciona o pino).
          </div>
        </fieldset>

        <fieldset>
          <legend>Proprietário</legend>
          <div className="field-row">
            <div className="field-group">
              <label>Nome do proprietário</label>
              <input type="text" value={proprietarioNome ?? ""} onChange={(e) => setProprietarioNome(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Telefone</label>
              <input
                type="tel"
                value={proprietarioTelefone ?? ""}
                onChange={(e) => setProprietarioTelefone(e.target.value)}
                placeholder="(43) 9...."
              />
            </div>
          </div>
          <div className="field-group">
            <label>Forma de abordagem</label>
            <select value={formaAbordagem ?? ""} onChange={(e) => setFormaAbordagem(e.target.value)}>
              {FORMAS_ABORDAGEM.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend>Funil &amp; status</legend>
          <div className="field-row">
            <div className="field-group">
              <label>Data do primeiro contato</label>
              <input type="date" value={dataAngariacao ?? ""} onChange={(e) => setDataAngariacao(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Responsável</label>
              <input type="text" value={responsavel ?? ""} onChange={(e) => setResponsavel(e.target.value)} />
            </div>
          </div>
          <div className="field-group">
            <label>Status atual</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_ALL.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="field-hint">
              O imóvel só conta como &quot;angariado&quot; nas metas e no dashboard quando o status
              chega em <strong>Angariado</strong> — mudar o status registra a data automaticamente
              para esse e outros cálculos.
            </div>
          </div>
          <div className="field-group">
            <label>Observações</label>
            <textarea
              value={observacoes ?? ""}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas gerais, combinados com o proprietário..."
            />
          </div>
        </fieldset>

        <fieldset style={semPausa(status) ? { display: "none" } : undefined}>
          <legend>Pausar follow-up</legend>
          <div className="field-group">
            <label>Retomar contato a partir de</label>
            <input type="date" value={pausadoAte ?? ""} onChange={(e) => setPausadoAte(e.target.value)} />
            <div className="field-hint">
              Use quando o proprietário pedir pra falar depois (viagem, férias, etc). Enquanto a data
              não chegar, o sistema não marca esse imóvel como &quot;parado&quot;.
            </div>
          </div>
          <div className="field-group" style={pausadoAte ? undefined : { display: "none" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", textTransform: "none", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={criarLembretePausa}
                onChange={(e) => setCriarLembretePausa(e.target.checked)}
              />
              Criar lembrete na agenda para essa data
            </label>
          </div>
        </fieldset>

        <fieldset style={pedeMotivo(status) ? undefined : { display: "none" }}>
          <legend>Motivo</legend>
          <div className="field-group">
            <label>Por que não avançou</label>
            <select value={motivoPerda ?? ""} onChange={(e) => setMotivoPerda(e.target.value)}>
              <option value="">Não informado</option>
              {MOTIVOS_PERDA.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group" style={motivoPerda === "Outro" ? undefined : { display: "none" }}>
            <label>Detalhe</label>
            <input
              type="text"
              value={motivoPerdaOutro ?? ""}
              onChange={(e) => setMotivoPerdaOutro(e.target.value)}
              placeholder="Descreva o motivo"
            />
          </div>
        </fieldset>

        <fieldset style={status === "Locado" ? undefined : { display: "none" }}>
          <legend>Comissão</legend>
          <div className="field-group">
            <label style={{ display: "flex", alignItems: "center", gap: "8px", textTransform: "none", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={comissaoRecebida}
                onChange={(e) => setComissaoRecebida(e.target.checked)}
              />
              Comissão recebida
            </label>
          </div>
          <div className="field-row" style={{ display: comissaoRecebida ? "grid" : "none" }}>
            <div className="field-group">
              <label>Valor recebido (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={comissaoRecebidaValor}
                onChange={(e) => setComissaoRecebidaValor(e.target.value)}
                placeholder={`Estimativa: ${fmtMoney((numOrNull(valorAluguel) || 0) * (comissaoPercent / 100))}`}
              />
            </div>
            <div className="field-group">
              <label>Data do recebimento</label>
              <input type="date" value={comissaoRecebidaData ?? ""} onChange={(e) => setComissaoRecebidaData(e.target.value)} />
            </div>
          </div>
        </fieldset>
      </div>
      <div className="modal-foot">
        <div>
          {imovel && (
            <button type="button" className="btn btn-ghost btn-danger" onClick={excluir}>
              Excluir imóvel
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : imovel ? "Salvar alterações" : "Cadastrar imóvel"}
          </button>
        </div>
      </div>
    </>
  );
}
