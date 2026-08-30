import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  anunciosRepresentamMesmaOferta,
  baseFingerprintAnuncio,
  deveGerarEmbedding,
  fingerprintEhForte,
  textoSemanticoDoImovel,
  urlCanonicaDeAnuncio,
  type SinaisIdentidadeAnuncio,
} from "@/lib/calculo/comparaveisMercado";
import { avaliarImovel, type ComparavelAvaliacao, type EntradaAvaliacao } from "@/lib/calculo/avaliacao";
import { extrairCaracteristicasImovel } from "@/lib/calculo/caracteristicasImovel";

const OFERTA: SinaisIdentidadeAnuncio = {
  portal: "olx",
  idExterno: "123",
  url: "https://www.olx.com.br/imovel/123?utm_source=radar",
  cidade: "Londrina",
  bairro: "Centro",
  endereco: "Rua Pará, 100",
  tipo: "Apartamento",
  areaM2: 80,
  quartos: 3,
  anunciante: "imobiliaria",
};

describe("identidade do anúncio de mercado", () => {
  it("reconhece ID, URL canônica e fingerprint forte como sinais alternativos", () => {
    expect(urlCanonicaDeAnuncio(OFERTA.url)).toBe("https://olx.com.br/imovel/123");
    expect(fingerprintEhForte(OFERTA)).toBe(true);
    expect(anunciosRepresentamMesmaOferta(OFERTA, {
      ...OFERTA,
      idExterno: "novo-id",
      url: "https://olx.com.br/imovel/123?utm_campaign=agosto#fotos",
    })).toBe(true);
    expect(anunciosRepresentamMesmaOferta(OFERTA, {
      ...OFERTA,
      idExterno: "novo-id",
      url: "https://olx.com.br/outro-endereco",
    })).toBe(true);
  });

  it("não considera fingerprint incompleto uma identidade segura", () => {
    const incompleto = { ...OFERTA, endereco: "Centro", areaM2: null };
    expect(fingerprintEhForte(incompleto)).toBe(false);
    expect(anunciosRepresentamMesmaOferta(incompleto, {
      ...incompleto,
      idExterno: "456",
      url: "https://olx.com.br/imovel/456",
    })).toBe(false);
  });

  it("mantém a identidade quando apenas o preço muda", () => {
    // Preço não faz parte do contrato de SinaisIdentidadeAnuncio.
    expect(baseFingerprintAnuncio(OFERTA)).toBe(baseFingerprintAnuncio({ ...OFERTA }));
  });
});

describe("conteúdo e cache do embedding", () => {
  it("mantém características objetivas declaradas em campos próprios", () => {
    expect(extrairCaracteristicasImovel(
      "Apartamento com área privativa 79 m², área total 110 m², 3 quartos, 1 suíte, 2 banheiros, 2 vagas, 8º andar, mobiliado. Condomínio R$ 850, IPTU R$ 120.",
    )).toMatchObject({
      areaM2: 79,
      areaTotalM2: 110,
      quartos: 3,
      suites: 1,
      banheiros: 2,
      vagas: 2,
      andar: 8,
      mobiliado: true,
      valorCondominio: 850,
      valorIptu: 120,
    });
  });

  it("gera texto determinístico sem preço, URL ou data de observação", () => {
    const dados = {
      finalidade: "locacao",
      tipo: "Apartamento",
      cidade: "Londrina",
      bairro: "Gleba Palhano",
      areaPrivativaM2: 79,
      quartos: 3,
      suites: 1,
      vagas: 2,
      descricao: "Cozinha planejada, varanda com churrasqueira e condomínio completo.",
    };
    const primeiro = textoSemanticoDoImovel(dados);
    const segundo = textoSemanticoDoImovel({ ...dados });
    expect(segundo).toBe(primeiro);
    expect(primeiro.toLowerCase()).toContain("cozinha planejada");
    expect(primeiro).not.toContain("R$");
    expect(primeiro).not.toContain("http");
  });

  it("só pede nova geração quando conteúdo, modelo, dimensão ou vetor mudam", () => {
    const atual = {
      embeddingHash: "hash-1",
      embeddingModelo: "text-embedding-3-small",
      embeddingDimensoes: 512,
      possuiEmbedding: true,
    };
    expect(deveGerarEmbedding(atual, "hash-1")).toBe(false);
    expect(deveGerarEmbedding(atual, "hash-2")).toBe(true);
    expect(deveGerarEmbedding({ ...atual, possuiEmbedding: false }, "hash-1")).toBe(true);
  });
});

describe("busca e score híbridos", () => {
  const entrada: EntradaAvaliacao = {
    finalidade: "locacao",
    endereco: "Rua A, 10",
    bairro: "Centro",
    cidade: "Londrina",
    tipo: "Apartamento",
    areaM2: 80,
    quartos: 3,
    banheiros: 2,
    vagas: 1,
    conservacao: "Bom",
  };
  const comparavel = (id: string, similaridadeVetorial: number): ComparavelAvaliacao => ({
    origem: "externo",
    id,
    endereco: "Rua A, 100",
    bairro: "Centro",
    cidade: "Londrina",
    tipo: "Apartamento",
    areaM2: 80,
    quartos: 3,
    banheiros: 2,
    vagas: 1,
    valorAnunciado: 2500,
    dataInformacao: "2026-08-20",
    status: "Anunciado",
    similaridadeVetorial,
  });

  it("separa score estrutural, vetorial e final sem usar vetor no peso do preço", () => {
    const resultado = avaliarImovel(entrada, [
      comparavel("10", 0.96),
      comparavel("20", 0.82),
      comparavel("30", 0.68),
      comparavel("40", 0.55),
    ], "2026-08-24");
    expect(resultado.situacao).toBe("calculada");
    expect(resultado.comparaveis[0].similaridadeVetorial).toBe(0.96);
    expect(resultado.comparaveis[0].comparabilidadeFinal)
      .toBeGreaterThan(resultado.comparaveis.at(-1)!.comparabilidadeFinal);
    expect(resultado.comparaveis[0].pesoCalculo)
      .toBeCloseTo(resultado.comparaveis[1].pesoCalculo, 8);
  });
});

describe("schema histórico e segurança", () => {
  const schema = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
  const rota = readFileSync(new URL("../app/api/avaliacao/comparaveis/route.ts", import.meta.url), "utf8");

  it("registra preço/status em histórico append-only e não concede escrita ao cliente", () => {
    expect(schema).toContain("create table if not exists observacoes_comparaveis_mercado");
    expect(schema).toContain("old.valor_anunciado is distinct from new.valor_anunciado");
    expect(schema).toContain("v_evento := 'preco_alterado'");
    expect(schema).toContain("'valorAnterior'");
    expect(schema).toContain("grant select on table observacoes_comparaveis_mercado to authenticated");
    expect(schema).not.toContain("grant select, insert on table observacoes_comparaveis_mercado to authenticated");
  });

  it("mantém RLS e filtros objetivos dentro da RPC vetorial", () => {
    expect(schema).toContain("create extension if not exists vector with schema extensions");
    expect(schema).toContain("alter table observacoes_comparaveis_mercado enable row level security");
    expect(schema).toContain("security invoker");
    expect(schema).toContain("c.user_id = (select auth.uid())");
    expect(schema).toContain("c.finalidade = p_finalidade");
    expect(schema).toContain("c.embedding_modelo = p_embedding_modelo");
    expect(schema).toContain("c.embedding_dimensoes = p_embedding_dimensoes");
    expect(schema).toContain("c.tipo_familia = p_tipo_familia");
    expect(schema).toContain(
      "order by c.embedding OPERATOR(extensions.<=>) p_query_embedding",
    );
    expect(rota).toContain("supabase.auth.getUser()");
    expect(rota).toContain("Authorization: `Bearer ${token}`");
    expect(rota).not.toContain("userId: entrada");
  });

  it("não invalida o vetor quando o hash, modelo e dimensão permanecem iguais", () => {
    expect(schema).toContain("c.embedding_hash is distinct from v_embedding_hash");
    expect(schema).toContain("c.embedding_modelo is distinct from v_embedding_modelo");
    expect(schema).toContain("c.embedding_dimensoes is distinct from v_embedding_dimensoes");
    expect(schema).toContain("embedding = case when v_precisa_embedding then null else c.embedding end");
  });

  it("serializa identidades concorrentes e mantém a unicidade principal", () => {
    expect(schema).toContain("unique (user_id, portal, id_externo)");
    expect(schema).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(schema).toContain("for update;");
  });
});
