/* ================================================================
   API: QUEM É ADMIN, E QUEM TRABALHA CARTEIRA

   A rota que tira do Table Editor a última decisão que ainda morava
   lá. Liberar IA e cadastrar número já tinham tela; promover alguém a
   administrador continuava sendo "abra o banco e insira uma linha" —
   o que, além de lento, é a operação que menos se quer fazendo à mão,
   porque é a que dá acesso a todas as contas do sistema.

   DOIS EIXOS INDEPENDENTES, e por isso dois campos opcionais no mesmo
   pedido em vez de duas rotas:

     `admin`          — tem o cargo (vê /admin e as rotas de operação)
     `operaCarteira`  — trabalha angariação nesta conta

   Ter o cargo não diz nada sobre a segunda: numa imobiliária pequena
   quem administra o sistema também tem carteira própria. Ver o
   comentário da tabela `admins` em supabase-schema.sql.

   A TRAVA QUE IMPORTA: **ninguém remove o próprio cargo.** Não é
   paternalismo — é o que torna o estado "sistema sem nenhum admin"
   inalcançável por esta rota. Repare que ele não precisa de uma
   contagem à parte: um admin só some daqui por decisão de OUTRO admin,
   e para o último sumir alguém teria de removê-lo, o que exige um
   segundo que por definição não existe. Sem essa trava, um clique
   distraído deixaria o sistema num estado que só se conserta abrindo o
   banco — que é exatamente o que esta tela veio eliminar.

   `opera_carteira` só existe para quem TEM o cargo: quem não é admin
   opera carteira por definição, porque o painel do corretor é o app
   inteiro para ele. Pedir a mudança para um não-admin é pedido
   inválido, não um no-op silencioso.
   ================================================================ */
import { registrarEvento } from "@/lib/servidor/registro";
import { alvoValido, erro, exigirAdmin } from "../_comum";

export async function POST(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;
  const { sb, userId: quemPediu } = guarda;

  let corpo: { userId?: unknown; admin?: unknown; operaCarteira?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("requisicao-invalida", 400);
  }

  // O ALVO vem do corpo — e só ele. Quem PEDE saiu do token, em
  // `exigirAdmin`.
  const alvo = alvoValido(corpo.userId);
  const querAdmin = typeof corpo.admin === "boolean" ? corpo.admin : null;
  const querCarteira = typeof corpo.operaCarteira === "boolean" ? corpo.operaCarteira : null;
  if (!alvo || (querAdmin === null && querCarteira === null)) {
    return erro("requisicao-invalida", 400);
  }

  if (querAdmin === false && alvo === quemPediu) {
    return Response.json(
      {
        ok: false,
        falha: "requisicao-invalida",
        mensagem:
          "Você não pode remover o próprio cargo — é o que impede o sistema de ficar sem nenhum administrador. Peça a outro administrador.",
      },
      { status: 400 },
    );
  }

  // Sair do cargo leva junto o `opera_carteira`: a coluna é da linha, e
  // quem não é admin opera carteira por definição.
  if (querAdmin === false) {
    const { error } = await sb.from("admins").delete().eq("user_id", alvo);
    if (error) {
      console.error("Admin: falha ao remover o cargo:", error.message);
      return erro("falha", 500);
    }
    registrarEvento({
      userId: alvo,
      categoria: "admin",
      nivel: "info",
      evento: "admin-cargo-removido",
      detalhe: `por ${quemPediu}`,
    });
    return Response.json({ ok: true, admin: false, operaCarteira: true });
  }

  if (querAdmin === true) {
    /* `upsert` e não `insert`: promover quem já é admin tem que ser um
       gesto inofensivo — o botão da tela não sabe (nem deve saber) o
       estado do banco no instante do clique. O `opera_carteira` só
       entra quando veio pedido; senão, promover alguém reescreveria em
       silêncio uma escolha que já estava feita. */
    const linha: Record<string, unknown> = { user_id: alvo };
    if (querCarteira !== null) linha.opera_carteira = querCarteira;

    const { error } = await sb.from("admins").upsert(linha, { onConflict: "user_id" });
    if (error) {
      console.error("Admin: falha ao conceder o cargo:", error.message);
      return erro("falha", 500);
    }
    registrarEvento({
      userId: alvo,
      categoria: "admin",
      nivel: "info",
      evento: "admin-cargo-concedido",
      detalhe: `por ${quemPediu}`,
    });
    return Response.json({ ok: true, admin: true });
  }

  // Só a carteira. `update` (não upsert): mexer nisto para quem não tem
  // o cargo criaria a linha de admin como efeito colateral de um botão
  // que diz outra coisa.
  const { data, error } = await sb
    .from("admins")
    .update({ opera_carteira: querCarteira })
    .eq("user_id", alvo)
    .select("user_id");
  if (error) {
    console.error("Admin: falha ao gravar opera_carteira:", error.message);
    return erro("falha", 500);
  }
  if (!data || data.length === 0) {
    return Response.json(
      {
        ok: false,
        falha: "requisicao-invalida",
        mensagem: "Só faz sentido para uma conta administradora — quem não é admin sempre opera carteira.",
      },
      { status: 400 },
    );
  }

  registrarEvento({
    userId: alvo,
    categoria: "admin",
    nivel: "info",
    evento: "admin-carteira-alterada",
    detalhe: `${querCarteira ? "passou a operar carteira" : "deixou de operar carteira"} — por ${quemPediu}`,
  });

  return Response.json({ ok: true, operaCarteira: querCarteira });
}
