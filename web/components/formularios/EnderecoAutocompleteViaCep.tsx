"use client";

/* ================================================================
   INPUT REUTILIZÁVEL: ENDEREÇO → CEP (VIACEP)

   Pesquisa gratuita por UF + cidade + logradouro. O input continua
   totalmente manual: falha, ausência de resultado ou cidade diferente
   nunca impede o cadastro. Debounce, cancelamento e cache evitam uso
   massivo do serviço público.
   ================================================================ */
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  chaveResultadoViaCep,
  mapearEnderecoViaCep,
  prepararPesquisaEnderecoViaCep,
  type EnderecoViaCepSelecionado,
  type PesquisaEnderecoViaCep,
  type ResultadoEnderecoViaCep,
} from "@/lib/calculo/enderecoViaCep";

const ESPERA_MS = 500;
const LIMITE_SUGESTOES = 6;
const cache = new Map<string, ResultadoEnderecoViaCep[]>();

interface Props {
  value: string;
  cidade: string;
  estado: string;
  onChange: (valor: string) => void;
  onSelecionar: (endereco: EnderecoViaCepSelecionado) => void;
  placeholder?: string;
}

export type { EnderecoViaCepSelecionado } from "@/lib/calculo/enderecoViaCep";

export default function EnderecoAutocompleteViaCep({
  value,
  cidade,
  estado,
  onChange,
  onSelecionar,
  placeholder = "Rua, número",
}: Props) {
  const listId = useId();
  const [sugestoes, setSugestoes] = useState<ResultadoEnderecoViaCep[]>([]);
  const [pesquisaAtual, setPesquisaAtual] = useState<PesquisaEnderecoViaCep | null>(null);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requisicaoRef = useRef(0);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (blurRef.current) clearTimeout(blurRef.current);
    abortRef.current?.abort();
  }, []);

  function limparSugestoes() {
    requisicaoRef.current += 1;
    abortRef.current?.abort();
    setSugestoes([]);
    setPesquisaAtual(null);
    setIndiceAtivo(-1);
    setBuscando(false);
  }

  async function buscarSugestoes(pesquisa: PesquisaEnderecoViaCep, requisicao: number) {
    const chave = [pesquisa.uf, pesquisa.cidade, pesquisa.logradouro]
      .map((parte) => parte.toLocaleLowerCase("pt-BR"))
      .join("|");
    const armazenadas = cache.get(chave);
    if (armazenadas) {
      if (requisicao !== requisicaoRef.current) return;
      setPesquisaAtual(pesquisa);
      setSugestoes(armazenadas);
      setIndiceAtivo(-1);
      setBuscando(false);
      setMensagem(armazenadas.length ? "" : "Nenhum endereço encontrado. Continue preenchendo manualmente.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBuscando(true);
    setMensagem("");

    try {
      const url = `https://viacep.com.br/ws/${encodeURIComponent(pesquisa.uf)}/${encodeURIComponent(
        pesquisa.cidade,
      )}/${encodeURIComponent(pesquisa.logradouro)}/json/`;
      const resposta = await fetch(url, { signal: controller.signal });
      if (!resposta.ok) throw new Error(`ViaCEP respondeu ${resposta.status}`);
      const dados = (await resposta.json()) as ResultadoEnderecoViaCep[];
      const chaves = new Set<string>();
      const resultados = (Array.isArray(dados) ? dados : [])
        .filter((item) => !item.erro && !!item.logradouro)
        .filter((item) => {
          const chaveItem = chaveResultadoViaCep(item);
          if (chaves.has(chaveItem)) return false;
          chaves.add(chaveItem);
          return true;
        })
        .slice(0, LIMITE_SUGESTOES);
      cache.set(chave, resultados);
      if (requisicao !== requisicaoRef.current) return;
      setPesquisaAtual(pesquisa);
      setSugestoes(resultados);
      setIndiceAtivo(-1);
      if (!resultados.length) setMensagem("Nenhum endereço encontrado. Continue preenchendo manualmente.");
    } catch {
      if (controller.signal.aborted || requisicao !== requisicaoRef.current) return;
      setSugestoes([]);
      setPesquisaAtual(null);
      setMensagem("Não foi possível buscar endereços agora. Continue preenchendo manualmente.");
    } finally {
      if (requisicao === requisicaoRef.current) setBuscando(false);
    }
  }

  function agendarBusca(consulta: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const requisicao = ++requisicaoRef.current;
    abortRef.current?.abort();
    setMensagem("");
    setSugestoes([]);
    setPesquisaAtual(null);
    setIndiceAtivo(-1);

    const pesquisa = prepararPesquisaEnderecoViaCep(estado, cidade, consulta);
    if (!pesquisa) {
      setBuscando(false);
      if (consulta.trim().length >= 3 && (estado.trim().length !== 2 || cidade.trim().length < 3)) {
        setMensagem("Informe cidade e UF para pesquisar o CEP pela rua.");
      }
      return;
    }

    debounceRef.current = setTimeout(() => {
      void buscarSugestoes(pesquisa, requisicao);
    }, ESPERA_MS);
  }

  function aoDigitar(evento: ChangeEvent<HTMLInputElement>) {
    const valor = evento.target.value;
    onChange(valor);
    agendarBusca(valor);
  }

  function selecionar(resultado: ResultadoEnderecoViaCep) {
    if (!pesquisaAtual) return;
    const selecionado = mapearEnderecoViaCep(resultado, pesquisaAtual);
    limparSugestoes();
    onSelecionar(selecionado);
    setMensagem("Endereço e CEP preenchidos pelo ViaCEP. Confira o número.");
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (!sugestoes.length) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setIndiceAtivo((atual) => (atual + 1) % sugestoes.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setIndiceAtivo((atual) => (atual <= 0 ? sugestoes.length - 1 : atual - 1));
    } else if (evento.key === "Enter" && indiceAtivo >= 0) {
      evento.preventDefault();
      selecionar(sugestoes[indiceAtivo]);
    } else if (evento.key === "Escape") {
      limparSugestoes();
    }
  }

  function aoFocar() {
    if (blurRef.current) clearTimeout(blurRef.current);
    agendarBusca(value);
  }

  function aoSair() {
    blurRef.current = setTimeout(limparSugestoes, 120);
  }

  const listaAberta = sugestoes.length > 0 || buscando;

  return (
    <div className="endereco-autocomplete">
      <input
        type="text"
        value={value}
        onChange={aoDigitar}
        onFocus={aoFocar}
        onKeyDown={aoTeclar}
        onBlur={aoSair}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listaAberta}
        aria-controls={listId}
        aria-activedescendant={indiceAtivo >= 0 ? `${listId}-${indiceAtivo}` : undefined}
      />

      {listaAberta && (
        <div className="endereco-sugestoes">
          {buscando && sugestoes.length === 0 ? (
            <div className="endereco-sugestoes-status">Buscando endereços…</div>
          ) : (
            <ul id={listId} role="listbox">
              {sugestoes.map((resultado, indice) => (
                <li key={chaveResultadoViaCep(resultado)} role="none">
                  <button
                    id={`${listId}-${indice}`}
                    type="button"
                    role="option"
                    aria-selected={indice === indiceAtivo}
                    className={indice === indiceAtivo ? "ativo" : ""}
                    onMouseDown={(evento) => evento.preventDefault()}
                    onClick={() => selecionar(resultado)}
                  >
                    <strong>{resultado.logradouro}</strong>
                    <span>
                      {[resultado.bairro, resultado.localidade, resultado.uf, resultado.cep]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="endereco-viacep-atribuicao">
            Dados: <a href="https://viacep.com.br" target="_blank" rel="noreferrer">ViaCEP</a>
          </div>
        </div>
      )}

      {mensagem && (
        <div className="field-hint endereco-autocomplete-mensagem" role="status">
          {mensagem}
        </div>
      )}
    </div>
  );
}
