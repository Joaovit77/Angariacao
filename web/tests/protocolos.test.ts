import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromDbProtocolo, toDbProtocolo, type DbProtocoloRow } from "@/lib/persistencia/mapeadores";
import {
  ehTipoProtocolo,
  separarProtocolosAtivos,
  tipoProtocoloOuPadrao,
} from "@/lib/protocolos";
import type { Protocolo } from "@/lib/tipos";

const USER_ID = "11111111-2222-3333-4444-555555555555";
const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
const TELA = readFileSync(
  new URL("../components/protocolos/ProtocolosView.tsx", import.meta.url),
  "utf8",
);

const BASE: Protocolo = {
  id: "p1",
  tipo: "informacao_comercial",
  titulo: "Taxa de administração",
  conteudo: "10% sobre o valor do aluguel.",
  arquivado: false,
};

describe("contrato de persistência dos protocolos", () => {
  it("leva categoria, conteúdo e dono ao banco", () => {
    expect(toDbProtocolo(BASE, USER_ID)).toEqual({
      id: "p1",
      user_id: USER_ID,
      tipo: "informacao_comercial",
      titulo: "Taxa de administração",
      conteudo: "10% sobre o valor do aluguel.",
      arquivado: false,
    });
  });

  it("apara título e conteúdo sem reescrever o protocolo", () => {
    const row = toDbProtocolo(
      { ...BASE, titulo: "  Prazo  ", conteudo: "\n30 meses.\n" },
      USER_ID,
    );
    expect(row.titulo).toBe("Prazo");
    expect(row.conteudo).toBe("30 meses.");
  });

  it("rejeita categoria ausente ou inválida antes da escrita", () => {
    expect(ehTipoProtocolo(undefined)).toBe(false);
    expect(ehTipoProtocolo("regra")).toBe(false);
    expect(() =>
      toDbProtocolo({ ...BASE, tipo: "regra" as Protocolo["tipo"] }, USER_ID),
    ).toThrow("Tipo de protocolo inválido");
  });

  const row: DbProtocoloRow = {
    id: "p1",
    user_id: USER_ID,
    tipo: "informacao_comercial",
    titulo: "Taxa de administração",
    conteudo: "10% sobre o valor do aluguel.",
    arquivado: false,
  };

  it("remove user_id no domínio e preserva a categoria", () => {
    expect(fromDbProtocolo(row)).toEqual(BASE);
  });

  it("mantém compatibilidade com linhas anteriores à coluna tipo", () => {
    expect(tipoProtocoloOuPadrao(null)).toBe("informacao_comercial");
    expect(fromDbProtocolo({ ...row, tipo: undefined }).tipo).toBe("informacao_comercial");
    expect(fromDbProtocolo({ ...row, arquivado: null }).arquivado).toBe(false);
  });
});

describe("separação de uso pela IA", () => {
  const protocolos: Protocolo[] = [
    BASE,
    {
      id: "r1",
      tipo: "regra_conduta",
      titulo: "Não repetir informações",
      conteudo: "Analise o histórico e não repita o que já foi explicado.",
      arquivado: false,
    },
    { ...BASE, id: "p2", titulo: "Prazo", arquivado: true },
    {
      id: "r2",
      tipo: "regra_conduta",
      titulo: "Regra antiga",
      conteudo: "Não usar.",
      arquivado: true,
    },
  ];

  it("separa fatos de regras e exclui os arquivados das duas categorias", () => {
    const separados = separarProtocolosAtivos(protocolos);
    expect(separados.informacoesComerciais.map((protocolo) => protocolo.id)).toEqual(["p1"]);
    expect(separados.regrasConduta.map((protocolo) => protocolo.id)).toEqual(["r1"]);
  });
});

describe("migração compatível da categoria", () => {
  it("adiciona categoria obrigatória e restringe os valores válidos", () => {
    expect(SCHEMA).toMatch(/alter table protocolos add column if not exists tipo text/);
    expect(SCHEMA).toMatch(/alter table protocolos alter column tipo set not null/);
    expect(SCHEMA).toMatch(/check \(tipo in \('informacao_comercial', 'regra_conduta'\)\)/);
  });

  it("classifica regras conhecidas e preserva desconhecidos como informação comercial", () => {
    expect(SCHEMA).toContain("'não repetir informações'");
    expect(SCHEMA).toContain("'informação não cadastrada'");
    expect(SCHEMA).toContain("'estilo de resposta'");
    expect(SCHEMA).toMatch(/set tipo = 'informacao_comercial'\s+where tipo is null/);
  });

  it("divide somente o registro misto conhecido sem apagar ou recriar o original", () => {
    const trecho = SCHEMA.slice(
      SCHEMA.indexOf("-- O registro atual de visita mistura"),
      SCHEMA.indexOf("-- Classificação conservadora"),
    );
    expect(trecho).toContain("Visita ao imóvel para divulgação");
    expect(trecho).toContain("and btrim(protocolo.conteudo) =");
    expect(trecho).toMatch(/update protocolos[\s\S]*tipo = 'regra_conduta'/);
    expect(trecho).not.toMatch(/delete\s+from\s+protocolos/i);
  });
});

describe("interface administrativa", () => {
  it("explica e administra separadamente as duas categorias", () => {
    expect(TELA).toContain("Informações comerciais");
    expect(TELA).toContain("Regras de conduta da IA");
    expect(TELA).toContain("Fatos oficiais sobre taxas, serviços, contratos e funcionamento");
    expect(TELA).toContain("Essas regras não são apresentadas como informações comerciais");
    expect(TELA).toContain('role="tablist"');
    expect(TELA).toContain('type="radio"');
    expect(TELA).toContain("proto-tipo-badge");
  });

  it("mantém criar, editar, arquivar e excluir", () => {
    for (const acao of ["Novo protocolo", "Editar", "Arquivar", "Excluir"]) {
      expect(TELA).toContain(acao);
    }
  });
});
