/* ================================================================
   SOLICITAÇÃO DE RECEBIMENTO DE ANGARIAÇÃO DE LOCAÇÃO

   O documento que cobra a comissão da captação. Dois riscos guardados
   aqui, e nenhum dos dois é de formatação:

   - **a REF INQUILINO apontar para o contrato errado** — ela é
     `<REF PROP>.<NN>`, e NN é a vez em que o imóvel foi locado. Errar
     o NN é pedir o pagamento de uma locação sobre a referência de
     outra;
   - **o endereço sair sem a UNIDADE** — "Rua X, 150" é o prédio, e
     num edifício isso não identifica contrato nenhum.

   O .docx é verificado abrindo o zip de volta e lendo o XML: o
   arquivo que o Word recusa a abrir só se descobre na frente do
   financeiro.
   ================================================================ */
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  arquivosDocxSolicitacao,
  comissaoDaSolicitacao,
  documentoXmlSolicitacao,
  linhasSolicitacao,
  nomeArquivoSolicitacao,
  numeroLocacao,
  pendenciasSolicitacao,
  referenciaInquilino,
  solicitacaoInicial,
  textoSolicitacao,
  type CamposSolicitacao,
  valorBaseDaSolicitacao,
} from "@/lib/calculo/solicitacaoAngariacao";
import type { Imovel, UserConfig } from "@/lib/tipos";
import { PERFIL_COMUNICACAO_PADRAO } from "@/lib/perfilComunicacao";

const CONFIG: UserConfig = {
  comissaoPercent: 40,
  agendaTipos: [],
  whatsappModelos: [],
  empresa: "Imobiliária Atual",
  origensExtras: [],
  dadosPagamento: "pix 125.856.399-16",
  perfilComunicacao: { ...PERFIL_COMUNICACAO_PADRAO },
};

/** O imóvel do documento real de 03/08/2026. */
function imovelLocado(over: Partial<Imovel> = {}): Imovel {
  return {
    id: "i1",
    referenciaCrm: "03280.001",
    endereco: "Rua Maria Lucia Da Paz, 150",
    unidade: "1106",
    tipo: "Apartamento",
    valorAluguel: 3300,
    responsavel: "João Vitor",
    origemImovel: "OLX",
    status: "Locado",
    statusHistory: [
      { status: "Novo contato", date: "2026-05-02" },
      { status: "Angariado", date: "2026-06-10" },
      { status: "Locado", date: "2026-07-28" },
    ],
    ...over,
  };
}

/** As duas grafias de espaço que o Intl usa em "R$ 1.320,00" conforme a
    versão do ICU — comparar o literal quebraria o teste sem nada ter mudado. */
function normalizar(s: string): string {
  return s.replace(/ | /g, " ");
}

describe("número da locação (o NN da REF INQUILINO)", () => {
  it("conta as entradas em Locado do statusHistory", () => {
    expect(numeroLocacao(imovelLocado())).toBe(1);
    expect(
      numeroLocacao(
        imovelLocado({
          statusHistory: [
            { status: "Locado", date: "2024-01-10" },
            { status: "Publicado", date: "2025-03-01" },
            { status: "Locado", date: "2026-07-28" },
          ],
        }),
      ),
    ).toBe(2);
  });

  it("nunca devolve zero: histórico vazio é locação fora do app, não ausência de locação", () => {
    // Imóvel importado de planilha nasce com statusHistory vazio (ver
    // calculo/importacao.ts) e mesmo assim pode ter contrato assinado.
    expect(numeroLocacao(imovelLocado({ statusHistory: [] }))).toBe(1);
    expect(numeroLocacao(imovelLocado({ statusHistory: null }))).toBe(1);
  });

  it("monta a referência com dois dígitos", () => {
    expect(referenciaInquilino("03280.001", 1)).toBe("03280.001.01");
    expect(referenciaInquilino("03280.001", 2)).toBe("03280.001.02");
    expect(referenciaInquilino("03280.001", 12)).toBe("03280.001.12");
  });

  it("sem REF PROP não inventa referência", () => {
    // ".01" sozinho seria lido pelo financeiro como referência de outro imóvel.
    expect(referenciaInquilino("", 1)).toBe("");
    expect(referenciaInquilino("   ", 3)).toBe("");
  });
});

describe("os padrões que o painel já sabe responder", () => {
  it("preenche referência, endereço com unidade, valor, corretor e origem", () => {
    const c = solicitacaoInicial(imovelLocado(), CONFIG);
    expect(c.refProprietario).toBe("03280.001");
    expect(c.refInquilino).toBe("03280.001.01");
    expect(c.corretor).toBe("João Vitor");
    expect(c.valorBase).toBe(3300);
    expect(c.comissaoPercent).toBe(40);
    expect(c.dadosPagamento).toBe("pix 125.856.399-16");
    expect(c.observacao).toBe("Angariação feita via OLX");
  });

  it("a observação não usa artigo: 'pelo' erraria em 'Redes sociais' e 'Placa no imóvel'", () => {
    const c = solicitacaoInicial(imovelLocado({ origemImovel: "Redes sociais" }), CONFIG);
    expect(c.observacao).toBe("Angariação feita via Redes sociais");
  });

  it("o endereço leva a UNIDADE — sem ela o documento aponta para o prédio", () => {
    const c = solicitacaoInicial(imovelLocado(), CONFIG);
    expect(c.endereco).toContain("1106");
  });

  it("a data do 1º aluguel nasce vazia: chutar prazo num pedido de pagamento é afirmar o que ninguém combinou", () => {
    expect(solicitacaoInicial(imovelLocado(), CONFIG).dataPrimeiroAluguel).toBe("");
  });

  it("cai no captador da conta quando o imóvel não tem responsável", () => {
    const c = solicitacaoInicial(imovelLocado({ responsavel: "" }), CONFIG, "Maria");
    expect(c.corretor).toBe("Maria");
  });

  it("sem origem cadastrada não escreve observação pela metade", () => {
    const c = solicitacaoInicial(imovelLocado({ origemImovel: "" }), CONFIG);
    expect(c.observacao).toBe("");
  });
});

describe("as linhas do documento", () => {
  const campos = (): CamposSolicitacao => ({
    ...solicitacaoInicial(imovelLocado(), CONFIG),
    dataPrimeiroAluguel: "2026-08-15",
  });

  it("reproduz a linha de valor do documento real", () => {
    const linha = linhasSolicitacao(campos()).find((l) => l.rotulo === "VALOR")!;
    expect(normalizar(linha.valor)).toBe("R$ 3.300,00 – 40% R$ 1.320,00");
  });

  it("a data sai dia/mês, como no formulário que o financeiro já recebe", () => {
    const linha = linhasSolicitacao(campos()).find((l) => l.rotulo.startsWith("DATA"))!;
    expect(linha.valor).toBe("15/08");
  });

  it("as duas referências vão na mesma linha de contrato", () => {
    const linha = linhasSolicitacao(campos()).find((l) => l.rotulo === "NÚMERO CONTRATO")!;
    expect(linha.valor).toBe("REF PROP: 03280.001 -  REF INQUILINO: 03280.001.01");
  });

  it("o nome do corretor está no documento", () => {
    expect(linhasSolicitacao(campos()).some((l) => l.rotulo === "CORRETOR" && l.valor === "João Vitor")).toBe(true);
  });

  it("sem aluguel o campo fica em branco, nunca R$ 0,00", () => {
    // Num pedido de pagamento, zero é um valor AFIRMADO.
    const linha = linhasSolicitacao({ ...campos(), valorBase: null }).find((l) => l.rotulo === "VALOR")!;
    expect(linha.valor).toBe("");
    expect(comissaoDaSolicitacao({ ...campos(), valorBase: null })).toBeNull();
  });

  it("o texto para colar tem o mesmo conteúdo do documento", () => {
    const t = textoSolicitacao(campos());
    expect(t).toContain("SOLICITAÇÃO DE RECEBIMENTO DE ANGARIAÇÃO DE LOCAÇÃO");
    expect(t).toContain("REF INQUILINO: 03280.001.01");
    expect(t).toContain("CORRETOR: João Vitor");
    expect(normalizar(t)).toContain("R$ 1.320,00");
  });
});

describe("o que ainda falta preencher", () => {
  it("cobra a data do 1º aluguel, que o painel não tem como saber", () => {
    const faltando = pendenciasSolicitacao(solicitacaoInicial(imovelLocado(), CONFIG));
    expect(faltando.some((f) => f.startsWith("DATA"))).toBe(true);
  });

  it("nada falta quando tudo está preenchido", () => {
    const c = { ...solicitacaoInicial(imovelLocado(), CONFIG), dataPrimeiroAluguel: "2026-08-15" };
    expect(pendenciasSolicitacao(c)).toEqual([]);
  });

  it("avisa, não bloqueia — a lista é informativa e o documento sai assim mesmo", () => {
    const vazio: CamposSolicitacao = {
      refProprietario: "",
      refInquilino: "",
      corretor: "",
      endereco: "",
      valorBase: null,
      comissaoPercent: 40,
      dataPrimeiroAluguel: "",
      dadosPagamento: "",
      observacao: "",
    };
    expect(pendenciasSolicitacao(vazio).length).toBeGreaterThan(0);
    expect(() => arquivosDocxSolicitacao(vazio)).not.toThrow();
  });
});

describe("o arquivo .docx", () => {
  const campos = (over: Partial<CamposSolicitacao> = {}): CamposSolicitacao => ({
    ...solicitacaoInicial(imovelLocado(), CONFIG),
    dataPrimeiroAluguel: "2026-08-15",
    ...over,
  });

  it("escapa o que quebraria o XML — um & no texto geraria arquivo que o Word recusa", () => {
    const xml = documentoXmlSolicitacao(campos({ observacao: 'Silva & Cia <"teste">' }));
    expect(xml).toContain("Silva &amp; Cia &lt;&quot;teste&quot;&gt;");
    expect(xml).not.toContain('<"teste">');
  });

  it("preserva o espaço depois dos dois-pontos", () => {
    // Sem xml:space o Word come o separador e sai "ENDEREÇO:Rua...".
    expect(documentoXmlSolicitacao(campos())).toContain('xml:space="preserve"');
  });

  it("leva os cinco arquivos que o Word exige", () => {
    expect(Object.keys(arquivosDocxSolicitacao(campos())).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/document.xml",
      "word/styles.xml",
    ]);
  });

  it("o zip abre de volta e traz o conteúdo do documento", async () => {
    const zipOut = new JSZip();
    for (const [caminho, conteudo] of Object.entries(arquivosDocxSolicitacao(campos()))) {
      zipOut.file(caminho, conteudo);
    }
    const bytes = await zipOut.generateAsync({ type: "uint8array" });

    const zip = await JSZip.loadAsync(bytes);
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain("03280.001.01");
    expect(doc).toContain("João Vitor");
    expect(doc).toContain("1106");
    expect(doc).toContain("15/08");
    // Os quatro companheiros continuam no pacote depois da volta.
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
    expect(zip.file("_rels/.rels")).not.toBeNull();
    expect(zip.file("word/_rels/document.xml.rels")).not.toBeNull();
    expect(zip.file("word/styles.xml")).not.toBeNull();
  });

  it("nenhum texto do documento carrega caractere cru de XML", () => {
    // O que separa "arquivo gerado" de "arquivo que ABRE": basta um & solto no
    // nome do proprietário para o Word recusar o documento inteiro, e isso só
    // apareceria na frente do financeiro.
    const xml = documentoXmlSolicitacao(
      campos({ observacao: "Silva & Cia <casa>", corretor: 'Ana "A" & João' }),
    );
    // O espaço depois de `w:t` não é enfeite: sem ele o padrão casa também
    // `<w:top .../>`, a borda do parágrafo, e o teste reprova o próprio markup.
    const textos = [...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
    expect(textos.length).toBeGreaterThan(0);
    for (const t of textos) {
      expect(t).not.toMatch(/[<>]/);
      // & só pode aparecer abrindo uma entidade.
      expect(t).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    }
  });
});

describe("o nome do arquivo", () => {
  it("identifica o contrato e não leva acento nem barra", () => {
    const nome = nomeArquivoSolicitacao({
      ...solicitacaoInicial(imovelLocado(), CONFIG),
      dataPrimeiroAluguel: "2026-08-15",
    });
    expect(nome).toMatch(/^[A-Za-z0-9.-]+\.docx$/);
    expect(nome).toContain("03280.001.01");
  });

  it("não sai como um nome vazio quando não há nada para nomear", () => {
    const nome = nomeArquivoSolicitacao({
      refProprietario: "",
      refInquilino: "",
      corretor: "",
      endereco: "",
      valorBase: null,
      comissaoPercent: 40,
      dataPrimeiroAluguel: "",
      dadosPagamento: "",
      observacao: "",
    });
    expect(nome).toBe("Solicitacao-angariacao.docx");
  });
});


/* ---------------------------------------------------------------
   O VALOR DA SOLICITAÇÃO NÃO É O ALUGUEL ANUNCIADO

   Campanha da imobiliária: o proprietário quer receber X, e quem atrasa
   paga X + acréscimo. O anúncio mostra X; a solicitação de angariação
   cobra sobre X + acréscimo. São duas contas sobre o mesmo contrato, e
   trocá-las erra o pedido de pagamento em ~20%.

   Caso real (Rua José Francisco Pereira, 800): anúncio R$ 1.600,00 e
   solicitação "R$ 1.920,00 – 20% R$ 384,00".
   --------------------------------------------------------------- */
describe("valor de atraso x valor anunciado", () => {
  const comAtraso = imovelLocado({ valorAluguel: 1600, valorAluguelAtraso: 1920 });

  it("a solicitação usa o valor de ATRASO, não o do anúncio", () => {
    expect(valorBaseDaSolicitacao(comAtraso)).toBe(1920);
    expect(solicitacaoInicial(comAtraso, CONFIG).valorBase).toBe(1920);
  });

  it("a comissão sai sobre o valor de atraso", () => {
    const c = { ...solicitacaoInicial(comAtraso, CONFIG), comissaoPercent: 20 };
    // 1920 × 20% = 384 — e não 1600 × 20% = 320
    expect(comissaoDaSolicitacao(c)).toBe(384);
    const linha = linhasSolicitacao(c).find((l) => l.rotulo === "VALOR")!;
    expect(linha.valor).toContain("1.920,00");
    expect(linha.valor).toContain("384,00");
    expect(linha.valor).not.toContain("1.600,00");
  });

  it("sem valor de atraso cai no aluguel — imóvel fora da campanha", () => {
    const semAtraso = imovelLocado({ valorAluguel: 2000, valorAluguelAtraso: null });
    expect(valorBaseDaSolicitacao(semAtraso)).toBe(2000);
  });

  it("zero não conta como valor de atraso", () => {
    // 0 gravado é "não informado" vindo de formulário, não "cobra zero".
    const zerado = imovelLocado({ valorAluguel: 2000, valorAluguelAtraso: 0 });
    expect(valorBaseDaSolicitacao(zerado)).toBe(2000);
  });

  it("o aluguel do imóvel continua sendo o anunciado", () => {
    // A trava que impede alguém de "consertar" isto sobrescrevendo o
    // valorAluguel com o de atraso: o anúncio, a comissão estimada e o
    // faturamento leem este campo.
    expect(comAtraso.valorAluguel).toBe(1600);
  });
});
