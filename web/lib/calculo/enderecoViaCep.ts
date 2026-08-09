/* ================================================================
   ENDEREÇO → CEP (VIACEP)

   Parte pura da pesquisa inversa do ViaCEP. O serviço exige UF, cidade
   e logradouro; cidade e logradouro precisam ter ao menos 3 caracteres.
   O componente React só agenda/faz a chamada. Preparação e mapeamento
   ficam aqui para os dois formulários não divergirem.
   ================================================================ */

export interface ResultadoEnderecoViaCep {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

export interface PesquisaEnderecoViaCep {
  uf: string;
  cidade: string;
  logradouro: string;
  numero: string;
}

export interface EnderecoViaCepSelecionado {
  endereco: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
}

const limparEspacos = (valor: string) => valor.trim().replace(/\s+/g, " ");

/**
 * Preserva o número quando o usuário escreve "Rua X, 123". A vírgula é
 * deliberada: "Rua 15" pode ser o nome real do logradouro e não deve virar
 * uma pesquisa por "Rua".
 */
export function prepararPesquisaEnderecoViaCep(
  estado: string,
  cidade: string,
  endereco: string,
): PesquisaEnderecoViaCep | null {
  const uf = limparEspacos(estado).toUpperCase();
  const cidadeLimpa = limparEspacos(cidade);
  const enderecoLimpo = limparEspacos(endereco);

  let logradouro = enderecoLimpo;
  let numero = "";
  const ultimaVirgula = enderecoLimpo.lastIndexOf(",");
  if (ultimaVirgula > 0) {
    const depoisDaVirgula = limparEspacos(enderecoLimpo.slice(ultimaVirgula + 1));
    if (/^\d/.test(depoisDaVirgula)) {
      logradouro = limparEspacos(enderecoLimpo.slice(0, ultimaVirgula));
      numero = depoisDaVirgula;
    }
  }

  if (uf.length !== 2 || cidadeLimpa.length < 3 || logradouro.length < 3) return null;
  return { uf, cidade: cidadeLimpa, logradouro, numero };
}

export function mapearEnderecoViaCep(
  resultado: ResultadoEnderecoViaCep,
  pesquisa: PesquisaEnderecoViaCep,
): EnderecoViaCepSelecionado {
  const rua = limparEspacos(resultado.logradouro || pesquisa.logradouro);
  const endereco = pesquisa.numero ? `${rua}, ${pesquisa.numero}` : rua;
  const bairro = limparEspacos(resultado.bairro || "");
  const cidade = limparEspacos(resultado.localidade || "");
  const estado = limparEspacos(resultado.uf || "").toUpperCase();
  const cep = limparEspacos(resultado.cep || "");

  return {
    endereco,
    ...(bairro ? { bairro } : {}),
    ...(cidade ? { cidade } : {}),
    ...(estado ? { estado } : {}),
    ...(cep ? { cep } : {}),
  };
}

export function chaveResultadoViaCep(resultado: ResultadoEnderecoViaCep): string {
  return [resultado.cep, resultado.logradouro, resultado.bairro, resultado.localidade, resultado.uf]
    .map((parte) => limparEspacos(parte || "").toLocaleLowerCase("pt-BR"))
    .join("|");
}
