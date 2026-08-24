/* ================================================================
   API: A CONEXÃO DO WHATSAPP DE CADA CORRETOR

   O painel sabia dizer "não tem número cadastrado" e parava aí. O
   estado seguinte — instância cadastrada, mas o WhatsApp DESCONECTADO
   — é a quebra mais comum que existe neste sistema (a sessão do
   WhatsApp Web expira, o celular fica dias sem internet, alguém
   desconecta o aparelho pareado) e era invisível: só aparecia quando o
   corretor tentava enviar e falhava, ou seja, depois de o prejuízo
   acontecer. `saudeDoCorretor` dava "Ok" para quem não conseguia
   mandar uma única mensagem.

   Duas formas, e a diferença não é conveniência:

     GET /api/admin/conexao            → todas, SEM QR
     GET /api/admin/conexao?userId=…   → uma, COM QR

   Pedir o QR é mandar a Evolution começar a parear (ver `consultarConexao`).
   Numa varredura isso dispararia pareamento nas instâncias de todo mundo
   por causa de uma tela aberta. Por isso a lista nunca pede, e só o
   detalhe de um corretor pede — que é a tela em que alguém está de fato
   reconectando aquele número.

   NÃO REGISTRA NO LOG, ao contrário da rota do corretor. Lá o registro
   é o que avisa que um número caiu sem esperar a reclamação; aqui quem
   está olhando é justamente quem leria esse aviso, e uma varredura de
   N contas viraria N linhas de log a cada clique em "Verificar" —
   enchendo de ruído a mesma tabela que este painel existe para deixar
   legível.
   ================================================================ */
import type { Conexao } from "@/lib/calculo/conexaoWhatsapp";
import { garantirRegistroInstanciaWhatsapp } from "@/lib/servidor/instanciaWhatsapp";
import { consultarConexao } from "../../whatsapp/_conexao";
import { alvoValido, erro, exigirAdmin } from "../_comum";

/** Uma linha da varredura: o estado daquela instância, já com o dono. */
export interface ConexaoDeCorretor extends Conexao {
  userId: string;
  instancia: string;
}

export async function GET(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;
  const { sb } = guarda;

  const serverUrl = process.env.EVOLUTION_SERVER_URL;
  const url = new URL(request.url);
  const alvo = url.searchParams.get("userId");

  // Uma conta específica: é o detalhe, e ali o QR é o ponto.
  if (alvo !== null) {
    const userId = alvoValido(alvo);
    if (!userId) return erro("requisicao-invalida", 400);
    if (!serverUrl) return Response.json({ ok: true, estado: "nao-configurado" });

    const { data, error } = await sb
      .from("whatsapp_instancias")
      .select("instancia, token, observacao")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("Admin: falha ao ler a instância:", error.message);
      return erro("falha", 500);
    }
    if (!data?.instancia) return Response.json({ ok: true, estado: "sem-instancia" });

    const pronta = await garantirRegistroInstanciaWhatsapp(sb, userId, {
      instancia: data.instancia as string,
      token: (data.token as string | null) ?? null,
      observacao: (data.observacao as string | null) ?? null,
    });
    if (!pronta.ok) {
      const estado = pronta.falha === "nao-configurado" ? "nao-configurado" : "falha";
      return Response.json({ ok: true, estado });
    }

    const conexao = await consultarConexao(
      serverUrl,
      pronta.instancia,
      pronta.token,
      true,
    );
    return Response.json({ ok: true, ...conexao });
  }

  // A varredura. Sem Evolution configurada não há o que perguntar — e
  // devolver a lista vazia faria a tela dizer "todo mundo bem".
  if (!serverUrl) return Response.json({ ok: true, conexoes: [], naoConfigurado: true });

  const { data, error } = await sb
    .from("whatsapp_instancias")
    .select("user_id, instancia, token, observacao");
  if (error) {
    console.error("Admin: falha ao listar as instâncias:", error.message);
    return erro("falha", 500);
  }

  /* Em paralelo, sem limite de concorrência: é uma consulta por
     instância cadastrada, e a ordem de grandeza aqui são poucas dezenas
     de corretores numa tela que uma pessoa abre por dia. Se um dia
     forem centenas, o conserto é limitar o lote — não trocar por
     consulta em série, que faria a varredura levar minutos. */
  const conexoes = await Promise.all(
    (data || [])
      .filter((r) => r.user_id && r.instancia)
      .map(async (r): Promise<ConexaoDeCorretor> => {
        const pronta = await garantirRegistroInstanciaWhatsapp(sb, r.user_id as string, {
          instancia: r.instancia as string,
          token: (r.token as string | null) ?? null,
          observacao: (r.observacao as string | null) ?? null,
        });
        if (!pronta.ok) {
          return {
            userId: r.user_id as string,
            instancia: r.instancia as string,
            estado: pronta.falha === "nao-configurado" ? "nao-configurado" : "falha",
          };
        }
        const conexao = await consultarConexao(
          serverUrl,
          pronta.instancia,
          pronta.token,
          false,
        );
        return { userId: r.user_id as string, instancia: pronta.instancia, ...conexao };
      }),
  );

  return Response.json({ ok: true, conexoes });
}
