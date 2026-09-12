// @vitest-environment jsdom

/* ================================================================
   C2f + C5b — EXCLUSÃO COORDENADA E STORAGE

   A primeira metade é estrutural sobre o SQL do C2f: identidade de
   servidor, objeto antes da linha, cascata, reconciliação de prefixo e
   superfície mínima do Storage. A segunda metade (C5b) prova o
   comportamento da rota, da fronteira e da UI sobre esse contrato — sem
   banco, sem Storage e sem IA reais.
   ================================================================ */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getSupabase: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: mocks.getSupabase }));

const cenario = vi.hoisted(() => ({
  estado: {
    salvando: false,
    previaExclusao: vi.fn(),
    excluir: vi.fn(),
    cancelarExclusao: vi.fn(),
    removerFoto: vi.fn(),
    descartar: vi.fn(),
    definirTipo: vi.fn(),
    corrigirObservacao: vi.fn(),
    confirmarEtiqueta: vi.fn(),
    contestarEtiqueta: vi.fn(),
    resetar: vi.fn(),
  },
  abrirModal: vi.fn(),
}));
vi.mock("@/lib/useProspeccao", () => {
  const useProspeccao = (seletor: (estado: typeof cenario.estado) => unknown) => seletor(cenario.estado);
  useProspeccao.getState = () => cenario.estado;
  return { useProspeccao };
});
vi.mock("@/lib/uiModal", () => ({
  useUiModal: (seletor: (estado: { abrirModal: typeof cenario.abrirModal }) => unknown) =>
    seletor({ abrirModal: cenario.abrirModal }),
}));

import { POST } from "@/app/api/prospeccao/excluir/route";
import CardIdentificado from "@/components/prospeccao/CardIdentificado";
import DialogoExcluirIdentificado, {
  AVISO_CANCELAR_EXCLUSAO,
} from "@/components/prospeccao/DialogoExcluirIdentificado";
import PainelIdentificado from "@/components/prospeccao/PainelIdentificado";
import SeloExclusaoPendente from "@/components/prospeccao/SeloExclusaoPendente";
import { apagarTodosOsDados } from "@/lib/mutacoes";
import {
  apagarProspeccaoDoUsuario,
  cancelarExclusaoIdentificado,
  excluirIdentificado,
  listarIdentificados,
  removerFotoAvistamento,
} from "@/lib/prospeccao";

/* Raiz do repositório por caminho, não por URL: no ambiente jsdom o `URL`
   global é o do navegador e `readFileSync` não o aceita. */
const RAIZ = resolve("..");

/* O schema pode estar em CRLF e a migration em LF por `core.autocrlf=true`.
   A comparação continua literal depois de normalizar apenas o fim de linha. */
function lerSql(relativo: string): string {
  return readFileSync(resolve(RAIZ, relativo), "utf8").replace(/\r\n/g, "\n");
}

const CAMINHO_MIGRATION =
  "supabase/migrations/20260911115908_prospeccao_campo_exclusao_storage.sql";
const MIGRATION = lerSql(CAMINHO_MIGRATION);
const SCHEMA = lerSql("supabase-schema.sql");
const MIGRATION_C2A = lerSql("supabase/migrations/20260910184310_prospeccao_campo.sql");
const MIGRATION_C2B = lerSql(
  "supabase/migrations/20260910190155_prospeccao_campo_rls_grants.sql",
);
const MIGRATION_C2E = lerSql(
  "supabase/migrations/20260910211045_prospeccao_campo_rpcs_navegador.sql",
);

const RPCS = [
  "iniciar_exclusao_imovel_identificado",
  "confirmar_objeto_removido",
  "concluir_exclusao_imovel_identificado",
  "apagar_prospeccao_do_usuario",
  "listar_objetos_do_usuario",
] as const;

function corpo(sql: string, nome: string): string {
  const trecho = sql.match(
    new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`, "i"),
  )?.[0];
  if (!trecho) throw new Error(`Função ${nome} ausente.`);
  return trecho;
}

function policy(nome: string): string {
  const trecho = MIGRATION.match(
    new RegExp(`create policy "${nome}"[\\s\\S]*?;`, "i"),
  )?.[0];
  if (!trecho) throw new Error(`Policy ${nome} ausente.`);
  return trecho;
}

const FN = Object.fromEntries(RPCS.map((nome) => [nome, corpo(MIGRATION, nome)])) as Record<
  (typeof RPCS)[number],
  string
>;

describe("C2f — fronteira do checkpoint", () => {
  it("espelha a migration no schema canônico uma única vez", () => {
    const bloco = `\n${MIGRATION.trim()}\n`;
    expect(SCHEMA).toContain(bloco);
    expect(SCHEMA.split(bloco)).toHaveLength(2);
  });

  it("cria exatamente as cinco RPCs previstas, com os nomes canônicos", () => {
    const criadas = [...MIGRATION.matchAll(/create or replace function public\.(\w+)\(/gi)]
      .map((resultado) => resultado[1]);
    expect(criadas).toEqual([...RPCS]);
  });

  it("não reabre tabelas, índices, gatilhos nem RPCs de checkpoints anteriores", () => {
    expect(MIGRATION).not.toMatch(/\bcreate table\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate (?:unique )?index\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate trigger\b/i);
    for (const anterior of [
      "iniciar_classificacao",
      "concluir_classificacao",
      "falhar_classificacao",
      "reservar_foto_avistamento",
      "finalizar_foto_avistamento",
      "fundir_imoveis_identificados",
      "cancelar_exclusao_imovel_identificado",
    ]) {
      expect(MIGRATION).not.toContain(`function public.${anterior}(`);
    }
  });

  it("mantém as cinco security definer com search_path vazio", () => {
    for (const nome of RPCS) {
      expect(FN[nome]).toMatch(/security definer/i);
      expect(FN[nome]).toContain("set search_path = ''");
    }
  });
});

describe("C2f — modelo Servidor e isolamento entre usuários", () => {
  it("exige p_user_id e aplica a trava de JWT nas cinco funções", () => {
    for (const nome of RPCS) {
      expect(FN[nome]).toMatch(/p_user_id uuid/);
      expect(FN[nome]).toMatch(
        /if p_user_id is null then\s+raise exception[\s\S]*?using errcode = '42501'/i,
      );
      expect(FN[nome]).toMatch(/v_jwt uuid := \(select auth\.uid\(\)\)/);
      expect(FN[nome]).toMatch(
        /if v_jwt is not null and v_jwt <> p_user_id then\s+raise exception[\s\S]*?'42501'/i,
      );
    }
  });

  it("filtra identidades e fotos pelo usuário e não revela posse cruzada", () => {
    for (const nome of [
      "iniciar_exclusao_imovel_identificado",
      "concluir_exclusao_imovel_identificado",
    ] as const) {
      expect(FN[nome]).toMatch(
        /where i\.id = p_imovel_identificado_id\s+and i\.user_id = p_user_id/,
      );
      expect(FN[nome]).toMatch(
        /raise exception 'Imóvel identificado não encontrado\.' using errcode = 'P0002'/,
      );
    }

    expect(FN.confirmar_objeto_removido).toMatch(
      /where f\.id = p_foto_id\s+and f\.user_id = p_user_id/,
    );
    expect(FN.confirmar_objeto_removido).toMatch(
      /raise exception 'Foto não encontrada\.' using errcode = 'P0002'/,
    );
    expect(FN.apagar_prospeccao_do_usuario).toMatch(/where f\.user_id = p_user_id/);
    expect(FN.apagar_prospeccao_do_usuario).toMatch(/where i\.user_id = p_user_id/);
    expect(FN.listar_objetos_do_usuario).toMatch(/where i\.user_id = p_user_id/);
    expect(FN.listar_objetos_do_usuario).toMatch(/errcode = 'P0002'/);
  });

  it("revoga todos os papéis e concede execute somente a service_role", () => {
    const revokes = [...MIGRATION.matchAll(/^revoke all on function[\s\S]*?;/gim)];
    const grants = [...MIGRATION.matchAll(/^grant execute on function[\s\S]*?;/gim)]
      .map((resultado) => resultado[0]);
    expect(revokes).toHaveLength(5);
    expect(grants).toHaveLength(5);
    for (const revoke of revokes) {
      expect(revoke[0]).toMatch(/from public, anon, authenticated, service_role;/);
    }
    for (const grant of grants) {
      expect(grant).toMatch(/to service_role;/);
      expect(grant).not.toMatch(/\bauthenticated\b|\banon\b/);
    }
  });

  it("não torna confirmar_objeto_removido executável por authenticated", () => {
    expect(MIGRATION).not.toMatch(
      /grant execute on function public\.confirmar_objeto_removido\([\s\S]*?to authenticated;/i,
    );
    expect(MIGRATION).toMatch(
      /revoke all on function public\.confirmar_objeto_removido\(uuid, uuid\)[\s\S]*?from public, anon, authenticated, service_role;/i,
    );
  });
});

describe("C2f — objeto primeiro, metadado depois", () => {
  it("iniciar marca uma vez e devolve toda foto, inclusive reservada", () => {
    const fn = FN.iniciar_exclusao_imovel_identificado;
    expect(fn).toMatch(/v_repetida := v_identidade\.exclusao_solicitada_em is not null/);
    expect(fn).toMatch(/if not v_repetida then[\s\S]*?set exclusao_solicitada_em = now\(\)/);
    expect(fn).toMatch(/'repetida', v_repetida/);
    expect(fn).toMatch(/'foto_id', f\.id/);
    expect(fn).toMatch(/'caminho', f\.caminho/);
    expect(fn).toMatch(/'caminho_miniatura', f\.caminho_miniatura/);
    expect(fn).not.toMatch(/f\.estado\s*=/);
  });

  it("iniciar contabiliza as lápides que a FK levará por cascata", () => {
    const fn = FN.iniciar_exclusao_imovel_identificado;
    expect(fn).toMatch(/i\.situacao = 'fundido'/);
    expect(fn).toMatch(/i\.fundido_em_imovel_id = p_imovel_identificado_id/);
    expect(fn).toMatch(/'lapides_total', v_lapides/);
    expect(MIGRATION_C2A).toMatch(
      /foreign key \(fundido_em_imovel_id\)[\s\S]*?references public\.imoveis_identificados\(id\) on delete cascade/,
    );
  });

  it("confirmar preserva a linha enquanto qualquer objeto estiver presente", () => {
    const fn = FN.confirmar_objeto_removido;
    expect(fn).toMatch(
      /storage\.objects o[\s\S]*?o\.bucket_id = 'fachadas'[\s\S]*?o\.name = v_foto\.caminho/,
    );
    expect(fn).toMatch(
      /storage\.objects o[\s\S]*?o\.bucket_id = 'fachadas'[\s\S]*?o\.name = v_foto\.caminho_miniatura/,
    );
    expect(fn).toMatch(
      /if v_original_presente or v_miniatura_presente then[\s\S]*?'codigo', 'objeto_pendente'/,
    );
    expect(fn.indexOf("delete from public.imoveis_identificados_fotos")).toBeGreaterThan(
      fn.indexOf("if v_original_presente or v_miniatura_presente"),
    );
  });

  it("concluir exige exclusão iniciada e recusa enquanto existir linha de foto", () => {
    const fn = FN.concluir_exclusao_imovel_identificado;
    expect(fn).toMatch(
      /if v_identidade\.exclusao_solicitada_em is null then[\s\S]*?'exclusao_nao_iniciada'/,
    );
    expect(fn).toMatch(
      /from public\.imoveis_identificados_fotos f[\s\S]*?f\.imovel_identificado_id = p_imovel_identificado_id[\s\S]*?f\.user_id = p_user_id/,
    );
    expect(fn).toMatch(/if v_fotos_pendentes > 0 then[\s\S]*?'objetos_pendentes'/);
    expect(fn.indexOf("delete from public.imoveis_identificados i")).toBeGreaterThan(
      fn.indexOf("if v_fotos_pendentes > 0"),
    );
  });

  it("concluir apaga o pai por último e depende das cascatas aprovadas", () => {
    const fn = FN.concluir_exclusao_imovel_identificado;
    expect(fn).toMatch(
      /delete from public\.imoveis_identificados i\s+where i\.id = p_imovel_identificado_id\s+and i\.user_id = p_user_id/,
    );
    for (const tabela of [
      "imoveis_identificados_avistamentos",
      "imoveis_identificados_fotos",
      "imoveis_identificados_classificacoes",
      "imoveis_identificados_etiquetas",
    ]) {
      expect(MIGRATION_C2A).toMatch(
        new RegExp(
          `create table if not exists public\\.${tabela}[\\s\\S]*?references public\\.imoveis_identificados\\(id\\) on delete cascade`,
          "i",
        ),
      );
    }
  });

  it("a versão em lote recusa fotos não confirmadas antes de apagar o tenant", () => {
    const fn = FN.apagar_prospeccao_do_usuario;
    expect(fn).toMatch(/from public\.imoveis_identificados_fotos f\s+where f\.user_id = p_user_id/);
    expect(fn).toMatch(/if v_fotos_pendentes > 0 then[\s\S]*?'objetos_pendentes'/);
    expect(fn.indexOf("delete from public.imoveis_identificados i")).toBeGreaterThan(
      fn.indexOf("if v_fotos_pendentes > 0"),
    );
  });

  it("o cliente continua sem delete nas tabelas de identidade e foto", () => {
    const grantsAuthenticated = [
      ...MIGRATION_C2B.matchAll(/^grant\b[\s\S]*?\bto authenticated;/gim),
    ].map((resultado) => resultado[0]);
    for (const tabela of ["imoveis_identificados", "imoveis_identificados_fotos"]) {
      expect(
        grantsAuthenticated.filter((grant) => grant.includes(`public.${tabela}`)).join("\n"),
      ).not.toMatch(/\bdelete\b/i);
    }
  });
});

describe("C2f — backstop e acesso somente leitura a storage.objects", () => {
  it("aceita somente o prefixo inteiro do usuário ou de uma identidade dele", () => {
    const fn = FN.listar_objetos_do_usuario;
    expect(fn).toMatch(/p_prefixo = p_user_id::text \|\| '\/'/);
    expect(fn).toMatch(
      /p_prefixo = p_user_id::text \|\| '\/' \|\| i\.id::text \|\| '\/'/,
    );
    expect(fn).toMatch(/where i\.user_id = p_user_id/);
    expect(fn).toMatch(/o\.bucket_id = 'fachadas'/);
    expect(fn).toMatch(/left\(o\.name, char_length\(p_prefixo\)\) = p_prefixo/);
  });

  it("somente as três RPCs previstas leem storage.objects", () => {
    const tocantes: string[] = [];
    for (const nome of [
      "finalizar_foto_avistamento",
      ...RPCS,
    ]) {
      const origem = nome === "finalizar_foto_avistamento" ? MIGRATION_C2E : MIGRATION;
      if (corpo(origem, nome).includes("storage.objects")) tocantes.push(nome);
    }
    expect(tocantes).toEqual([
      "finalizar_foto_avistamento",
      "confirmar_objeto_removido",
      "listar_objetos_do_usuario",
    ]);
  });

  it("nenhuma RPC insere, atualiza ou apaga storage.objects", () => {
    for (const sql of [MIGRATION_C2E, MIGRATION]) {
      expect(sql).not.toMatch(/insert into storage\.objects/i);
      expect(sql).not.toMatch(/update storage\.objects/i);
      expect(sql).not.toMatch(/delete from storage\.objects/i);
    }
  });
});

describe("C2f — bucket fachadas e policies do navegador", () => {
  const SELECT = policy("fachadas_select_proprio_prefixo");
  const INSERT = policy("fachadas_insert_reserva_aberta");

  it("declara o bucket privado de 5 MB com os dois MIME types", () => {
    expect(MIGRATION).toMatch(/insert into storage\.buckets/);
    expect(MIGRATION).toMatch(
      /values \(\s*'fachadas',\s*'fachadas',\s*false,\s*5242880,\s*array\['image\/jpeg', 'image\/webp'\]\s*\)\s*on conflict do nothing/i,
    );
  });

  it("cria exatamente duas policies em storage.objects", () => {
    const criadas = [...MIGRATION.matchAll(/^create policy "([^"]+)"[\s\S]*?;/gim)]
      .map((resultado) => resultado[1]);
    expect(criadas).toEqual([
      "fachadas_select_proprio_prefixo",
      "fachadas_insert_reserva_aberta",
    ]);
  });

  it("select fica no bucket e no primeiro segmento do usuário autenticado", () => {
    expect(SELECT).toContain("for select to authenticated");
    expect(SELECT).toContain("bucket_id = 'fachadas'");
    expect(SELECT).toContain(
      "(storage.foldername(name))[1] = (select auth.uid())::text",
    );
  });

  it("insert exige caminho reservado e reserva ainda aberta", () => {
    expect(INSERT).toContain("for insert to authenticated");
    expect(INSERT).toContain("bucket_id = 'fachadas'");
    expect(INSERT).toContain(
      "(storage.foldername(name))[1] = (select auth.uid())::text",
    );
    expect(INSERT).toContain("name in (f.caminho, f.caminho_miniatura)");
    expect(INSERT).toContain("f.estado = 'reservada'");
  });

  it("insert prova separadamente a posse da foto, do avistamento e do imóvel", () => {
    expect(INSERT).toContain("f.user_id = (select auth.uid())");
    expect(INSERT).toContain("a.user_id = (select auth.uid())");
    expect(INSERT).toContain("i.user_id = (select auth.uid())");
    expect(INSERT).toMatch(
      /join public\.imoveis_identificados_avistamentos a on a\.id = f\.avistamento_id/,
    );
    expect(INSERT).toMatch(
      /join public\.imoveis_identificados i on i\.id = f\.imovel_identificado_id/,
    );
  });

  it("insert fecha a aba velha durante exclusão e bloqueia lápide", () => {
    expect(INSERT).toContain("i.exclusao_solicitada_em is null");
    expect(INSERT).toContain("i.situacao <> 'fundido'");
  });

  it("não bloqueia promovido nem promovendo na policy de upload", () => {
    expect(INSERT).not.toMatch(/promovido|promovendo/);
  });

  it("não cria policy de update ou delete para authenticated", () => {
    expect(MIGRATION).not.toMatch(/create policy[\s\S]*?for update to authenticated/i);
    expect(MIGRATION).not.toMatch(/create policy[\s\S]*?for delete to authenticated/i);
    expect(MIGRATION).not.toMatch(/grant[\s\S]*?\b(?:update|delete)\b[\s\S]*?storage\.objects/i);
  });
});

/* ================================================================
   C5b — EXCLUSÃO COORDENADA: rota, fronteira e UI

   Daqui para baixo o contrato deixa o SQL e vira comportamento: o ator
   único (`/api/prospeccao/excluir`), a ordem iniciar → remove → confirmar
   → reconciliar → concluir, a prova de ausência, a idempotência da
   retomada, o cancelamento que não ressuscita foto, e a UI que nunca
   declara sucesso com objeto pendente. Nenhum teste toca banco ou Storage
   reais: toda a lógica de servidor vive na rota e é exercitada por POST.
   ================================================================ */

const USUARIO = "11111111-1111-4111-8111-111111111111";
const IDENTIFICADO = "22222222-2222-4222-8222-222222222222";
const OUTRO_IDENTIFICADO = "33333333-3333-4333-8333-333333333333";
const FOTO_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOTO_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PREFIXO = `${USUARIO}/${IDENTIFICADO}/`;
const CONTRATO = ["removidos", "pendentes", "prefixoVazio", "concluido"];

interface FotoFalsa {
  foto_id: string;
  caminho: string;
  caminho_miniatura: string;
}

/**
 * Um Supabase de service role de mentira, com um bucket em memória. É o
 * mínimo que permite provar a ORDEM: `storage.objects` é o `Set` de
 * objetos, as linhas de foto são `fotos`, e cada RPC se comporta como a
 * migration real (prova de ausência, `objetos_pendentes`, prefixo).
 */
function servicoFalso(opcoes: {
  objetos?: string[];
  fotos?: FotoFalsa[];
  lapides?: number;
  falhaRemove?: boolean;
  removeParcial?: (caminho: string) => boolean;
  identidades?: string[];
} = {}) {
  const objetos = new Set(opcoes.objetos ?? []);
  const fotos = new Map((opcoes.fotos ?? []).map((foto) => [foto.foto_id, foto]));
  const identidades = new Set(opcoes.identidades ?? [IDENTIFICADO]);
  let exclusaoSolicitada = false;
  const chamadas: string[] = [];

  const remove = vi.fn(async (caminhos: string[]) => {
    chamadas.push(`remove:${caminhos.length}`);
    if (opcoes.falhaRemove) return { data: null, error: { message: "storage fora do ar" } };
    const removidos: { name: string }[] = [];
    for (const caminho of caminhos) {
      if (!objetos.has(caminho)) continue;
      if (opcoes.removeParcial && !opcoes.removeParcial(caminho)) continue;
      objetos.delete(caminho);
      removidos.push({ name: caminho });
    }
    return { data: removidos, error: null };
  });

  const rpc = vi.fn(async (nome: string, parametros: Record<string, unknown>) => {
    chamadas.push(nome);
    if (parametros.p_user_id !== USUARIO) return { data: null, error: { code: "42501" } };
    switch (nome) {
      case "iniciar_exclusao_imovel_identificado": {
        if (!identidades.has(String(parametros.p_imovel_identificado_id))) {
          return { data: null, error: { code: "P0002" } };
        }
        const repetida = exclusaoSolicitada;
        exclusaoSolicitada = true;
        return {
          data: {
            ok: true,
            repetida,
            fotos: [...fotos.values()],
            fotos_total: fotos.size,
            lapides_total: opcoes.lapides ?? 0,
          },
          error: null,
        };
      }
      case "confirmar_objeto_removido": {
        const foto = fotos.get(String(parametros.p_foto_id));
        if (!foto) return { data: null, error: { code: "P0002" } };
        const original = objetos.has(foto.caminho);
        const miniatura = objetos.has(foto.caminho_miniatura);
        if (original || miniatura) {
          return {
            data: { ok: false, codigo: "objeto_pendente", original_presente: original, miniatura_presente: miniatura },
            error: null,
          };
        }
        fotos.delete(foto.foto_id);
        return { data: { ok: true, foto_id: foto.foto_id }, error: null };
      }
      case "concluir_exclusao_imovel_identificado": {
        if (!exclusaoSolicitada) return { data: { ok: false, codigo: "exclusao_nao_iniciada" }, error: null };
        if (fotos.size) return { data: { ok: false, codigo: "objetos_pendentes", pendentes: fotos.size }, error: null };
        identidades.delete(String(parametros.p_imovel_identificado_id));
        return { data: { ok: true, lapides_removidas: opcoes.lapides ?? 0 }, error: null };
      }
      case "apagar_prospeccao_do_usuario": {
        if (fotos.size) return { data: { ok: false, codigo: "objetos_pendentes", pendentes: fotos.size }, error: null };
        identidades.clear();
        return { data: { ok: true, identidades_removidas: 1 }, error: null };
      }
      case "listar_objetos_do_usuario": {
        const prefixo = String(parametros.p_prefixo);
        const valido = prefixo === `${USUARIO}/`
          || [...identidades].some((id) => prefixo === `${USUARIO}/${id}/`);
        if (!valido) return { data: null, error: { code: "P0002" } };
        const lista = [...objetos].filter((nome) => nome.startsWith(prefixo)).sort();
        return { data: { ok: true, prefixo, objetos: lista, total: lista.length }, error: null };
      }
      default:
        throw new Error(`RPC inesperada ${nome}`);
    }
  });

  const servico = {
    rpc,
    storage: { from: vi.fn(() => ({ remove })) },
    from: vi.fn(() => ({
      select: () => ({
        eq: async () => ({ data: [...identidades].map((id) => ({ id })), error: null }),
      }),
    })),
  };
  return { servico, objetos, fotos, chamadas, remove, rpc, identidades,
    get exclusaoSolicitada() { return exclusaoSolicitada; } };
}

const FOTOS_PADRAO: FotoFalsa[] = [
  { foto_id: FOTO_A, caminho: `${PREFIXO}${FOTO_A}.webp`, caminho_miniatura: `${PREFIXO}${FOTO_A}-mini.webp` },
  { foto_id: FOTO_B, caminho: `${PREFIXO}${FOTO_B}.webp`, caminho_miniatura: `${PREFIXO}${FOTO_B}-mini.webp` },
];
const OBJETOS_PADRAO = FOTOS_PADRAO.flatMap((foto) => [foto.caminho, foto.caminho_miniatura]);
const LINHA_FOTO_A = {
  id: FOTO_A, imovel_identificado_id: IDENTIFICADO,
  caminho: FOTOS_PADRAO[0].caminho, caminho_miniatura: FOTOS_PADRAO[0].caminho_miniatura,
};

function requisicao(corpo: unknown, token = "token-valido") {
  return new Request("http://localhost/api/prospeccao/excluir", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

/** O cliente do chamador: só `auth.getUser()` e leituras sob RLS. */
function chamadorFalso(linhas: Record<string, unknown | null>, usuario: string | null = USUARIO) {
  const from = vi.fn((tabela: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: linhas[tabela] ?? null, error: null })),
      })),
    })),
  }));
  return {
    auth: { getUser: vi.fn(async () => usuario
      ? { data: { user: { id: usuario } }, error: null }
      : { data: { user: null }, error: { message: "sem sessão" } }) },
    from,
  };
}

/** Executa a rota contra um mundo falso e devolve status + corpo. */
async function excluirPelaRota(
  corpo: unknown,
  mundo: ReturnType<typeof servicoFalso>,
  posse: Record<string, unknown | null> = { imoveis_identificados: { id: IDENTIFICADO } },
) {
  mocks.createClient.mockReset();
  mocks.createClient.mockReturnValueOnce(chamadorFalso(posse)).mockReturnValueOnce(mundo.servico);
  const resposta = await POST(requisicao(corpo));
  return { status: resposta.status, corpo: await resposta.json() as Record<string, unknown> };
}

const rotaSilenciosa = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("C5b — rota: contrato, autenticação e posse", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  });

  it("sem Bearer devolve 401 antes de criar qualquer cliente", async () => {
    const resposta = await POST(requisicao({ imovelIdentificadoId: IDENTIFICADO }, ""));
    expect(resposta.status).toBe(401);
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("aceita só os três corpos canônicos e recusa corpo grande sem ler", async () => {
    for (const corpo of [{}, { fotoId: "abc" }, { tudo: false }, { imovelIdentificadoId: IDENTIFICADO, tudo: true }, { userId: USUARIO }, []]) {
      expect((await POST(requisicao(corpo))).status).toBe(400);
    }
    const grande = new Request("http://localhost/api/prospeccao/excluir", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Length": "4096" },
      body: JSON.stringify({ tudo: true }),
    });
    expect((await POST(grande)).status).toBe(413);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("prova posse sob RLS com o cliente do chamador: alvo alheio é 404 e a service role nem nasce", async () => {
    mocks.createClient.mockReturnValueOnce(chamadorFalso({ imoveis_identificados: null }));
    const resposta = await POST(requisicao({ imovelIdentificadoId: OUTRO_IDENTIFICADO }));
    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toEqual({ falha: "nao_encontrado" });
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient.mock.calls[0][1]).toBe("anon");
  });

  it("responde EXATAMENTE { removidos, pendentes, prefixoVazio, concluido }, com p_user_id vindo da sessão", async () => {
    const mundo = servicoFalso({ objetos: OBJETOS_PADRAO, fotos: FOTOS_PADRAO, lapides: 1 });

    const { status, corpo } = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, mundo);

    expect(status).toBe(200);
    expect(corpo).toEqual({ removidos: 4, pendentes: 0, prefixoVazio: true, concluido: true });
    expect(Object.keys(corpo).sort()).toEqual([...CONTRATO].sort());
    expect(mocks.createClient.mock.calls[1][1]).toBe("service-role");
    expect(mundo.rpc.mock.calls.every(([, parametros]) => (parametros as { p_user_id: string }).p_user_id === USUARIO)).toBe(true);
  });

  it("falha de Storage vira 503 sem declarar nada concluído e sem apagar metadado", async () => {
    const mundo = servicoFalso({ objetos: OBJETOS_PADRAO, fotos: FOTOS_PADRAO, falhaRemove: true });
    const silencio = rotaSilenciosa();

    const { status, corpo } = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, mundo);

    expect(status).toBe(503);
    expect(corpo).toEqual({ falha: "indisponivel" });
    expect(mundo.fotos.size).toBe(2);
    expect(mundo.objetos.size).toBe(4);
    expect(mundo.chamadas).not.toContain("confirmar_objeto_removido");
    expect(mundo.chamadas).not.toContain("concluir_exclusao_imovel_identificado");
    silencio.mockRestore();
  });
});

describe("C5b — ordem: iniciar → remove → confirmar → reconciliar → concluir", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  });

  it("confirma cada linha logo depois de os dois objetos saírem, reconcilia o prefixo e só então conclui", async () => {
    const mundo = servicoFalso({ objetos: OBJETOS_PADRAO, fotos: FOTOS_PADRAO, lapides: 2 });

    const { corpo } = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, mundo);

    expect(corpo).toEqual({ removidos: 4, pendentes: 0, prefixoVazio: true, concluido: true });
    expect(mundo.objetos.size).toBe(0);
    expect(mundo.fotos.size).toBe(0);
    expect(mundo.identidades.has(IDENTIFICADO)).toBe(false);
    expect(mundo.chamadas).toEqual([
      "iniciar_exclusao_imovel_identificado",
      "remove:4",
      "confirmar_objeto_removido",
      "confirmar_objeto_removido",
      "listar_objetos_do_usuario",
      "concluir_exclusao_imovel_identificado",
    ]);
  });

  it("com objeto ainda presente a linha fica, confirmar não é chamada para ela, e concluir não acontece", async () => {
    const mundo = servicoFalso({
      objetos: OBJETOS_PADRAO,
      fotos: FOTOS_PADRAO,
      // O Storage "esquece" a miniatura da foto B nas duas tentativas.
      removeParcial: (caminho) => !caminho.endsWith(`${FOTO_B}-mini.webp`),
    });

    const { corpo } = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, mundo);

    expect(corpo).toEqual({ removidos: 3, pendentes: 1, prefixoVazio: false, concluido: false });
    expect(mundo.fotos.has(FOTO_A)).toBe(false);
    expect(mundo.fotos.has(FOTO_B)).toBe(true);
    expect(mundo.objetos.has(`${PREFIXO}${FOTO_B}-mini.webp`)).toBe(true);
    expect(mundo.rpc.mock.calls.filter(([nome]) => nome === "confirmar_objeto_removido")).toHaveLength(1);
    expect(mundo.chamadas).not.toContain("concluir_exclusao_imovel_identificado");
    expect(mundo.exclusaoSolicitada).toBe(true);
  });

  it("a RPC é a segunda prova: objeto que reaparece entre o remove e a confirmação recusa e preserva a linha", async () => {
    const mundo = servicoFalso({ objetos: OBJETOS_PADRAO, fotos: [FOTOS_PADRAO[0]] });
    const rpcOriginal = mundo.rpc.getMockImplementation()!;
    mundo.rpc.mockImplementation(async (nome, parametros) => {
      if (nome === "confirmar_objeto_removido") mundo.objetos.add(FOTOS_PADRAO[0].caminho);
      return rpcOriginal(nome, parametros);
    });

    const { corpo } = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, mundo);

    expect(corpo).toMatchObject({ pendentes: 1, concluido: false });
    expect(mundo.fotos.has(FOTO_A)).toBe(true);
  });

  it("reserva que nunca recebeu upload é confirmada pela prova de ausência da releitura, antes de concluir", async () => {
    // Só a foto A tem objetos; a B é uma reserva órfã de upload interrompido.
    const mundo = servicoFalso({ objetos: OBJETOS_PADRAO.slice(0, 2), fotos: FOTOS_PADRAO });

    const { corpo } = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, mundo);

    expect(corpo).toEqual({ removidos: 2, pendentes: 0, prefixoVazio: true, concluido: true });
    expect(mundo.chamadas).toEqual([
      "iniciar_exclusao_imovel_identificado",
      "remove:4",
      "confirmar_objeto_removido",
      "listar_objetos_do_usuario",
      "confirmar_objeto_removido",
      "concluir_exclusao_imovel_identificado",
    ]);
    expect(mundo.fotos.size).toBe(0);
  });

  it("retomar depois de remoção parcial continua do ponto restante e é idempotente", async () => {
    let falhar = true;
    const mundo = servicoFalso({
      objetos: OBJETOS_PADRAO,
      fotos: FOTOS_PADRAO,
      removeParcial: (caminho) => !(falhar && caminho.includes(FOTO_B)),
    });

    const primeira = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, mundo);
    expect(primeira.corpo).toEqual({ removidos: 2, pendentes: 2, prefixoVazio: false, concluido: false });
    expect(mundo.fotos.has(FOTO_B)).toBe(true);

    falhar = false;
    mundo.chamadas.length = 0;
    const segunda = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, mundo);
    expect(segunda.corpo).toEqual({ removidos: 2, pendentes: 0, prefixoVazio: true, concluido: true });
    expect(mundo.chamadas[0]).toBe("iniciar_exclusao_imovel_identificado");
    expect(mundo.rpc.mock.calls.filter(([nome]) => nome === "confirmar_objeto_removido")).toHaveLength(2);
    expect(mundo.objetos.size).toBe(0);
    expect(mundo.identidades.has(IDENTIFICADO)).toBe(false);

    const semNada = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, servicoFalso());
    expect(semNada.corpo).toEqual({ removidos: 0, pendentes: 0, prefixoVazio: true, concluido: true });
  });

  it("a reconciliação continua obrigatória: remove o resíduo sem linha, relê, e só declara vazio depois", async () => {
    const residual = `${PREFIXO}upload-interrompido.webp`;
    const mundo = servicoFalso({ objetos: [...OBJETOS_PADRAO, residual], fotos: FOTOS_PADRAO });

    const { corpo } = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, mundo);

    expect(corpo).toEqual({ removidos: 5, pendentes: 0, prefixoVazio: true, concluido: true });
    expect(mundo.objetos.has(residual)).toBe(false);
    expect(mundo.chamadas).toEqual([
      "iniciar_exclusao_imovel_identificado",
      "remove:4",
      "confirmar_objeto_removido",
      "confirmar_objeto_removido",
      "listar_objetos_do_usuario",
      "remove:1",
      "listar_objetos_do_usuario",
      "concluir_exclusao_imovel_identificado",
    ]);
    expect(mundo.rpc.mock.calls
      .filter(([nome]) => nome === "listar_objetos_do_usuario")
      .every(([, parametros]) => (parametros as { p_prefixo: string }).p_prefixo === PREFIXO)).toBe(true);
  });

  it("resíduo que resiste à reconciliação mantém a exclusão pendente sem orfanar o prefixo", async () => {
    const residual = `${PREFIXO}teimoso.webp`;
    const mundo = servicoFalso({
      objetos: [...OBJETOS_PADRAO, residual],
      fotos: FOTOS_PADRAO,
      removeParcial: (caminho) => caminho !== residual,
    });

    const { corpo } = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, mundo);

    expect(corpo).toEqual({ removidos: 4, pendentes: 1, prefixoVazio: false, concluido: false });
    expect(mundo.chamadas).not.toContain("concluir_exclusao_imovel_identificado");
    expect(mundo.identidades.has(IDENTIFICADO)).toBe(true);
  });

  it("remove em lotes de no máximo 100 caminhos", async () => {
    const fotos: FotoFalsa[] = Array.from({ length: 120 }, (_, indice) => ({
      foto_id: `${indice.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
      caminho: `${PREFIXO}f${indice}.webp`,
      caminho_miniatura: `${PREFIXO}f${indice}-mini.webp`,
    }));
    const mundo = servicoFalso({ objetos: fotos.flatMap((f) => [f.caminho, f.caminho_miniatura]), fotos });

    const { corpo } = await excluirPelaRota({ imovelIdentificadoId: IDENTIFICADO }, mundo);

    expect(corpo).toEqual({ removidos: 240, pendentes: 0, prefixoVazio: true, concluido: true });
    expect(mundo.remove.mock.calls.map(([lote]) => (lote as string[]).length)).toEqual([100, 100, 40]);
  });
});

describe("C5b — foto isolada e apagar tudo pela mesma rota", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  });

  it("{ fotoId } lê a foto sob RLS, remove os dois objetos e só depois a linha, sem marcar o pai nem tocar as outras fotos", async () => {
    const mundo = servicoFalso({ objetos: OBJETOS_PADRAO, fotos: FOTOS_PADRAO });

    const { corpo } = await excluirPelaRota({ fotoId: FOTO_A }, mundo, { imoveis_identificados_fotos: LINHA_FOTO_A });

    expect(corpo).toEqual({ removidos: 2, pendentes: 0, prefixoVazio: true, concluido: true });
    expect(mundo.fotos.has(FOTO_A)).toBe(false);
    expect(mundo.fotos.has(FOTO_B)).toBe(true);
    expect(mundo.objetos.has(FOTOS_PADRAO[1].caminho)).toBe(true);
    expect(mundo.exclusaoSolicitada).toBe(false);
    expect(mundo.chamadas).toEqual(["remove:2", "confirmar_objeto_removido", "listar_objetos_do_usuario"]);
  });

  it("falha de Storage na foto isolada preserva a linha e devolve concluido false", async () => {
    const mundo = servicoFalso({
      objetos: OBJETOS_PADRAO, fotos: FOTOS_PADRAO, removeParcial: (caminho) => !caminho.endsWith("-mini.webp"),
    });

    const { corpo } = await excluirPelaRota({ fotoId: FOTO_A }, mundo, { imoveis_identificados_fotos: LINHA_FOTO_A });

    expect(corpo).toEqual({ removidos: 1, pendentes: 1, prefixoVazio: false, concluido: false });
    expect(mundo.fotos.has(FOTO_A)).toBe(true);
    expect(mundo.chamadas).not.toContain("confirmar_objeto_removido");
  });

  it("{ tudo: true } exige só a sessão, passa por cada identidade, reconcilia {user_id}/, apaga o tenant e relê", async () => {
    const solto = `${USUARIO}/${OUTRO_IDENTIFICADO}/orfao.webp`;
    const mundo = servicoFalso({
      objetos: [...OBJETOS_PADRAO, solto], fotos: FOTOS_PADRAO, identidades: [IDENTIFICADO, OUTRO_IDENTIFICADO],
    });

    const { corpo } = await excluirPelaRota({ tudo: true }, mundo, {});

    expect(corpo).toEqual({ removidos: 5, pendentes: 0, prefixoVazio: true, concluido: true });
    expect(mundo.objetos.size).toBe(0);
    expect(mundo.identidades.size).toBe(0);
    const listagens = mundo.rpc.mock.calls
      .filter(([nome]) => nome === "listar_objetos_do_usuario")
      .map(([, parametros]) => (parametros as { p_prefixo: string }).p_prefixo);
    expect(listagens.at(-1)).toBe(`${USUARIO}/`);
    expect(mundo.chamadas.indexOf("apagar_prospeccao_do_usuario"))
      .toBeGreaterThan(mundo.chamadas.lastIndexOf("remove:1"));
    expect(mundo.chamadas.at(-1)).toBe("listar_objetos_do_usuario");
  });

  it("apagar tudo com objeto restante nunca chama apagar_prospeccao nem declara sucesso", async () => {
    const mundo = servicoFalso({
      objetos: OBJETOS_PADRAO, fotos: FOTOS_PADRAO, removeParcial: (caminho) => !caminho.includes(FOTO_B),
    });

    const { corpo } = await excluirPelaRota({ tudo: true }, mundo, {});

    expect(corpo).toEqual({ removidos: 2, pendentes: 2, prefixoVazio: false, concluido: false });
    expect(mundo.chamadas).not.toContain("apagar_prospeccao_do_usuario");
    expect(mundo.fotos.has(FOTO_B)).toBe(true);
  });
});

describe("C5b — fronteira do navegador", () => {
  function clienteComSessao(token: string | null) {
    return {
      auth: { getSession: vi.fn(async () => ({ data: { session: token ? { access_token: token } : null } })) },
      rpc: vi.fn(),
    } as unknown as SupabaseClient;
  }

  it("excluirIdentificado manda só { imovelIdentificadoId } com Bearer e devolve o contrato exato da rota", async () => {
    const fetchFalso = vi.fn(async () => Response.json({ removidos: 3, pendentes: 1, prefixoVazio: false, concluido: false }));

    const resultado = await excluirIdentificado(IDENTIFICADO, clienteComSessao("tok"), fetchFalso as unknown as typeof fetch);

    expect(resultado).toEqual({ removidos: 3, pendentes: 1, prefixoVazio: false, concluido: false });
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/prospeccao/excluir");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init.body))).toEqual({ imovelIdentificadoId: IDENTIFICADO });
  });

  it("removerFotoAvistamento e apagarProspeccaoDoUsuario usam a MESMA rota com { fotoId } e { tudo: true }", async () => {
    const fetchFalso = vi.fn(async () => Response.json({ removidos: 0, pendentes: 0, prefixoVazio: true, concluido: true }));
    const client = clienteComSessao("tok");
    await removerFotoAvistamento(FOTO_A, client, fetchFalso as unknown as typeof fetch);
    await apagarProspeccaoDoUsuario(client, fetchFalso as unknown as typeof fetch);
    const corpos = fetchFalso.mock.calls.map((chamada) => JSON.parse(String((chamada as unknown as [string, RequestInit])[1].body)));
    expect(corpos).toEqual([{ fotoId: FOTO_A }, { tudo: true }]);
    expect(fetchFalso.mock.calls.every((chamada) => (chamada as unknown as [string])[0] === "/api/prospeccao/excluir")).toBe(true);
  });

  it("sem sessão não chama a rota; resposta de erro vira ErroProspeccao com a falha da rota", async () => {
    const fetchFalso = vi.fn(async () => Response.json({ falha: "nao_encontrado" }, { status: 404 }));
    await expect(excluirIdentificado(IDENTIFICADO, clienteComSessao(null), fetchFalso as unknown as typeof fetch))
      .rejects.toMatchObject({ codigo: "sessao_expirada" });
    expect(fetchFalso).not.toHaveBeenCalled();
    await expect(excluirIdentificado(IDENTIFICADO, clienteComSessao("tok"), fetchFalso as unknown as typeof fetch))
      .rejects.toMatchObject({ codigo: "nao_encontrado" });
  });

  it("cancelarExclusaoIdentificado usa exatamente a RPC do navegador, sem p_user_id", async () => {
    const client = clienteComSessao("tok");
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { ok: true, repetida: false }, error: null });
    await cancelarExclusaoIdentificado(IDENTIFICADO, client);
    expect(client.rpc).toHaveBeenCalledWith("cancelar_exclusao_imovel_identificado", { p_imovel_identificado_id: IDENTIFICADO });
  });

  it("a lista normal esconde descartado, fundido e exclusão pendente; o filtro traz os três", async () => {
    const encadeavel = {
      select: vi.fn(), in: vi.fn(), is: vi.fn(), order: vi.fn(), range: vi.fn(),
      then: (resolver: (valor: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolver),
    };
    for (const chave of ["select", "in", "is", "order", "range"] as const) encadeavel[chave].mockReturnValue(encadeavel);
    const client = { from: vi.fn(() => encadeavel) } as unknown as SupabaseClient;

    await listarIdentificados({}, client);
    expect(encadeavel.in).toHaveBeenCalledWith("situacao", ["identificado", "investigando", "promovendo", "promovido"]);
    expect(encadeavel.is).toHaveBeenCalledWith("exclusao_solicitada_em", null);

    encadeavel.in.mockClear();
    encadeavel.is.mockClear();
    await listarIdentificados({ incluirOcultos: true }, client);
    expect(encadeavel.in).not.toHaveBeenCalled();
    expect(encadeavel.is).not.toHaveBeenCalled();
  });
});

describe("C5b — apagarTodosOsDados passa pelo Garimpo antes das quatro tabelas", () => {
  const apagarTabela = vi.fn(async () => ({ error: null }));
  const supabaseFalso = {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "tok" } } })) },
    from: vi.fn<(tabela: string) => { delete: () => { eq: typeof apagarTabela } }>(() => ({ delete: () => ({ eq: apagarTabela }) })),
  };

  beforeEach(() => {
    apagarTabela.mockClear();
    supabaseFalso.from.mockClear();
    cenario.estado.resetar.mockClear();
    mocks.getSupabase.mockReturnValue(supabaseFalso);
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("com o Garimpo concluído apaga as quatro tabelas antigas, nesta ordem, e zera o estado local", async () => {
    const fetchFalso = vi.fn(async () => Response.json({ removidos: 2, pendentes: 0, prefixoVazio: true, concluido: true }));
    vi.stubGlobal("fetch", fetchFalso);

    expect(await apagarTodosOsDados(USUARIO)).toBe(true);

    expect(JSON.parse(String((fetchFalso.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ tudo: true });
    expect(supabaseFalso.from.mock.calls.map(([tabela]) => tabela)).toEqual(["imoveis", "agenda", "metas", "abordagens"]);
    expect(cenario.estado.resetar).toHaveBeenCalled();
  });

  it("com objeto pendente no Storage nada mais é apagado e o resultado é falso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ removidos: 1, pendentes: 3, prefixoVazio: false, concluido: false })));

    expect(await apagarTodosOsDados(USUARIO)).toBe(false);

    expect(supabaseFalso.from).not.toHaveBeenCalled();
    expect(cenario.estado.resetar).not.toHaveBeenCalled();
  });

  it("falha da rota também impede o falso sucesso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("rede"); }));
    expect(await apagarTodosOsDados(USUARIO)).toBe(false);
    expect(supabaseFalso.from).not.toHaveBeenCalled();
  });
});

describe("C5b — DialogoExcluirIdentificado e SeloExclusaoPendente", () => {
  beforeEach(() => {
    cenario.estado.salvando = false;
    cenario.estado.previaExclusao.mockReset().mockResolvedValue({ fotosTotal: 2, lapidesTotal: 1 });
    cenario.estado.excluir.mockReset();
    cenario.estado.cancelarExclusao.mockReset().mockResolvedValue(true);
    vi.stubGlobal("confirm", vi.fn(() => true));
  });
  afterEach(cleanup);

  it("deixa claro que não é descartar, mostra arquivos e lápides da prévia sob RLS, e fecha quando a rota conclui", async () => {
    cenario.estado.excluir.mockResolvedValue({ removidos: 4, pendentes: 0, prefixoVazio: true, concluido: true });
    const aoFechar = vi.fn();
    const { container } = render(createElement(DialogoExcluirIdentificado, { imovelIdentificadoId: IDENTIFICADO, aoFechar }));

    expect(container.textContent).toMatch(/não é descartar/i);
    await waitFor(() => expect(screen.getByText(/2 fotos — 4 arquivos no Storage/)).toBeTruthy());
    expect(screen.getByText(/1 lápide de fusão irá por cascata/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Excluir permanentemente" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(cenario.estado.excluir).toHaveBeenCalledWith(IDENTIFICADO);
  });

  it("com objeto pendente mostra o progresso real, não declara sucesso e oferece retomar e cancelar com aviso", async () => {
    cenario.estado.excluir
      .mockResolvedValueOnce({ removidos: 3, pendentes: 4, prefixoVazio: false, concluido: false })
      .mockResolvedValueOnce({ removidos: 4, pendentes: 0, prefixoVazio: true, concluido: true });
    const aoFechar = vi.fn();
    render(createElement(DialogoExcluirIdentificado, { imovelIdentificadoId: IDENTIFICADO, aoFechar }));
    await screen.findByRole("button", { name: "Excluir permanentemente" });

    fireEvent.click(screen.getByRole("button", { name: "Excluir permanentemente" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("3 de 7 arquivos removidos; a exclusão continua pendente");
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.queryByText(/concluíd/i)).toBeNull();

    // Cancelar avisa que as fotos já apagadas não voltam; recusar o aviso não cancela.
    (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar exclusão" }));
    expect(globalThis.confirm).toHaveBeenCalledWith(AVISO_CANCELAR_EXCLUSAO);
    expect(cenario.estado.cancelarExclusao).not.toHaveBeenCalled();

    // Retomar chama a mesma rota de novo e fecha só quando conclui de verdade.
    fireEvent.click(screen.getByRole("button", { name: "Retomar exclusão" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(cenario.estado.excluir).toHaveBeenCalledTimes(2);
  });

  it("aberto como retomada não pede confirmação de novo e cancelar aceito usa a RPC de cancelamento", async () => {
    cenario.estado.excluir.mockResolvedValue(null);
    const aoFechar = vi.fn();
    render(createElement(DialogoExcluirIdentificado, { imovelIdentificadoId: IDENTIFICADO, retomada: true, aoFechar }));

    await screen.findByRole("alert");
    expect(cenario.estado.previaExclusao).not.toHaveBeenCalled();
    expect(cenario.estado.excluir).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("a exclusão continua pendente");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar exclusão" }));
    await waitFor(() => expect(cenario.estado.cancelarExclusao).toHaveBeenCalledWith(IDENTIFICADO));
    expect(aoFechar).toHaveBeenCalled();
  });

  it("o selo expõe exatamente duas ações", () => {
    const aoRetomar = vi.fn();
    const aoCancelar = vi.fn();
    render(createElement(SeloExclusaoPendente, {
      exclusaoSolicitadaEm: "2026-09-12T10:00:00.000Z", ocupado: false, aoRetomar, aoCancelar,
    }));
    expect(screen.getByRole("status", { name: "Exclusão pendente" })).toBeTruthy();
    expect(screen.getAllByRole("button").map((botao) => botao.textContent)).toEqual(["Retomar exclusão", "Cancelar exclusão"]);
    fireEvent.click(screen.getByRole("button", { name: "Retomar exclusão" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar exclusão" }));
    expect(aoRetomar).toHaveBeenCalled();
    expect(aoCancelar).toHaveBeenCalled();
  });
});

describe("C5b — bloqueio na tela durante a exclusão (§13.4)", () => {
  function identificadoDe(sobrescritas: Record<string, unknown> = {}) {
    return {
      id: IDENTIFICADO, situacao: "identificado", logradouro: "Rua A", numero: "1", unidade: null, bloco: null,
      edificio: null, bairro: null, cidade: null, estado: null, pontoReferencia: null, tipo: null,
      avistamentoCorrenteId: "avistamento-1", ultimoAvistamentoEm: "2026-09-12T10:00:00.000Z",
      avistamentosTotal: 1, exclusaoSolicitadaEm: null, ...sobrescritas,
    };
  }
  function detalhe(sobrescritas: Record<string, unknown> = {}, fotos: unknown[] = []) {
    return {
      identificado: identificadoDe(sobrescritas),
      avistamentos: [{
        id: "avistamento-1", imovelIdentificadoId: IDENTIFICADO, observadoEm: "2026-09-12T10:00:00.000Z",
        observacao: "Placa", observacaoRevisao: 1, classificacaoEstado: "pendente",
        fotos, classificacoes: [], etiquetas: [],
      }],
      etiquetasDoImovel: [],
      classificacoesCarregadas: true,
    } as never;
  }
  const fotoAtiva = {
    id: FOTO_A, avistamentoId: "avistamento-1", imovelIdentificadoId: IDENTIFICADO, estado: "ativa",
    caminho: FOTOS_PADRAO[0].caminho, caminhoMiniatura: FOTOS_PADRAO[0].caminho_miniatura,
    largura: 10, altura: 10, bytes: 10, capturadaEm: null, reservadaEm: "x", ativadaEm: "x", criadoEm: "x",
  };

  beforeEach(() => {
    cenario.estado.salvando = false;
    cenario.estado.removerFoto.mockReset().mockResolvedValue({ concluido: true });
    cenario.estado.cancelarExclusao.mockReset().mockResolvedValue(true);
    vi.stubGlobal("confirm", vi.fn(() => true));
  });
  afterEach(cleanup);

  it("fora da exclusão o painel oferece descartar, excluir e remover foto — e descartar não é excluir", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe({}, [fotoAtiva]) }));
    expect(screen.getByRole("button", { name: "Novo avistamento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descartar identificação" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Excluir permanentemente" })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Exclusão pendente" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remover foto" }));
    expect(cenario.estado.removerFoto).toHaveBeenCalledWith(IDENTIFICADO, FOTO_A);
    expect(cenario.estado.excluir).not.toHaveBeenCalled();
  });

  it("com exclusão pendente só restam retomar e cancelar; as ações normais somem", () => {
    render(createElement(PainelIdentificado, {
      detalhe: detalhe({ exclusaoSolicitadaEm: "2026-09-12T10:00:00.000Z" }, [fotoAtiva]),
    }));
    expect(screen.getByRole("status", { name: "Exclusão pendente" })).toBeTruthy();
    expect(screen.getAllByRole("button").map((botao) => botao.textContent)).toEqual(["Retomar exclusão", "Cancelar exclusão"]);
    for (const nome of ["Novo avistamento", "Descartar identificação", "Excluir permanentemente", "Salvar correção", "Definir tipo", "Remover foto"]) {
      expect(screen.queryByRole("button", { name: nome })).toBeNull();
    }
    // A linha do tempo continua visível, só que somente leitura.
    expect(screen.getByText("Placa")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar exclusão" }));
    expect(globalThis.confirm).toHaveBeenCalledWith(AVISO_CANCELAR_EXCLUSAO);
    expect(cenario.estado.cancelarExclusao).toHaveBeenCalledWith(IDENTIFICADO);
  });

  it("retomar abre o diálogo já executando a rota", async () => {
    cenario.estado.excluir.mockReset().mockResolvedValue({ removidos: 1, pendentes: 1, prefixoVazio: false, concluido: false });
    render(createElement(PainelIdentificado, { detalhe: detalhe({ exclusaoSolicitadaEm: "2026-09-12T10:00:00.000Z" }) }));
    fireEvent.click(screen.getByRole("button", { name: "Retomar exclusão" }));
    await waitFor(() => expect(cenario.estado.excluir).toHaveBeenCalledWith(IDENTIFICADO));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("1 de 2 arquivos removidos");
  });

  it("o card marca a exclusão pendente", () => {
    render(createElement(CardIdentificado, {
      identificado: identificadoDe({ exclusaoSolicitadaEm: "2026-09-12T10:00:00.000Z" }) as never,
      selecionado: false,
      aoSelecionar: vi.fn(),
    }));
    expect(screen.getByText("Exclusão pendente")).toBeTruthy();
  });
});

describe("C5b — garantias estruturais do módulo", () => {
  const ROTA = "app/api/prospeccao/excluir/route.ts";
  const ARQUIVOS_MODULO = [
    "lib/prospeccao.ts",
    "lib/useProspeccao.ts",
    ROTA,
    ...readdirSync(resolve("components/prospeccao")).map((nome) => `components/prospeccao/${nome}`),
    "components/modais/ModalAvistamento.tsx",
  ];
  const fontes = ARQUIVOS_MODULO.map((caminho) => [caminho, readFileSync(resolve(caminho), "utf8")] as const);

  it("nenhum arquivo do módulo usa .delete() nas tabelas; storage.remove() e service role só existem na rota", () => {
    for (const [caminho, fonte] of fontes) {
      expect(fonte, caminho).not.toMatch(/\.delete\s*\(/);
      if (caminho !== ROTA) {
        // Leaflet também tem .remove() (camadas do mapa, C6); o que se proíbe
        // fora da rota é remover objeto do Storage.
        expect(fonte, caminho).not.toMatch(/storage[\s\S]{0,80}\.remove\s*\(/);
        expect(fonte, caminho).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role/);
      }
    }
    expect(existsSync(resolve("lib/servidor/exclusaoProspeccao.ts"))).toBe(false);
  });

  it("o SQL versionado nunca tenta apagar arquivo por storage.objects", () => {
    expect(MIGRATION).not.toMatch(/delete\s+from\s+storage\.objects/i);
    expect(SCHEMA).not.toMatch(/delete\s+from\s+storage\.objects/i);
  });

  it("a rota é nodejs, no-store, exporta só o handler e chama exatamente as RPCs do modelo Servidor", () => {
    const rota = readFileSync(resolve(ROTA), "utf8");
    expect(rota).toContain('export const runtime = "nodejs"');
    expect(rota).toContain('"Cache-Control": "no-store"');
    expect(rota).toContain("auth.getUser()");
    expect(rota.match(/^export /gm)).toHaveLength(3);
    for (const nome of RPCS) expect(rota).toContain(`"${nome}"`);
    expect(rota).not.toContain("cancelar_exclusao_imovel_identificado");
    expect(readFileSync(resolve("lib/prospeccao.ts"), "utf8")).toContain('"cancelar_exclusao_imovel_identificado"');
    expect(readFileSync(resolve("lib/mutacoes.ts"), "utf8")).toMatch(/apagarProspeccaoDoUsuario\(\)[\s\S]*from\("imoveis"\)\.delete\(\)/);
  });
});
