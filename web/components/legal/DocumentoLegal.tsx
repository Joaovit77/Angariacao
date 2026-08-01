/* ================================================================
   RENDERIZAÇÃO DOS DOCUMENTOS LEGAIS

   Um componente para os dois (termos e privacidade), a partir da
   estrutura de `lib/legal/conteudo.ts`.

   O negrito é montado com NÓS DO DOM, quebrando a string no `**`, e
   não com `dangerouslySetInnerHTML`. Não é preciosismo: a regra do
   projeto proíbe HTML cru justamente porque o escape do JSX é a defesa
   contra XSS, e um documento legal é o último lugar onde vale abrir
   exceção "porque o texto é nosso" — texto nosso hoje é texto colado
   de algum lugar amanhã.

   Sem "use client": é conteúdo estático, sem estado nem evento. Fica
   como Server Component, que é o padrão do App Router — a página não
   precisa de JavaScript para ser lida.
   ================================================================ */
import Link from "next/link";
import RodapeApp from "@/components/RodapeApp";
import { identidadeIncompleta } from "@/lib/legal/identidade";
import type { Documento } from "@/lib/legal/conteudo";

/** Quebra "texto com **negrito** dentro" em nós, sem passar por HTML. */
function comNegrito(texto: string): React.ReactNode[] {
  return texto.split("**").map((parte, i) =>
    // Índice ímpar = estava entre marcadores.
    i % 2 === 1 ? <strong key={i}>{parte}</strong> : <span key={i}>{parte}</span>,
  );
}

function Paragrafos({ itens }: { itens: string[] }) {
  const saida: React.ReactNode[] = [];
  let lista: string[] = [];

  const fecharLista = (chave: string) => {
    if (lista.length === 0) return;
    saida.push(
      <ul className="doc-lista" key={`ul-${chave}`}>
        {lista.map((item, i) => (
          <li key={i}>{comNegrito(item)}</li>
        ))}
      </ul>,
    );
    lista = [];
  };

  itens.forEach((item, i) => {
    if (item.startsWith("- ")) {
      lista.push(item.slice(2));
      return;
    }
    fecharLista(String(i));
    saida.push(<p key={`p-${i}`}>{comNegrito(item)}</p>);
  });
  fecharLista("fim");

  return <>{saida}</>;
}

export default function DocumentoLegal({ doc }: { doc: Documento }) {
  const faltando = identidadeIncompleta();

  return (
    <div className="doc-legal">
      <div className="doc-cabecalho">
        <Link href="/" className="doc-voltar">
          ← Voltar
        </Link>
        <h1>{doc.titulo}</h1>
        <p className="doc-sub">{doc.subtitulo}</p>
      </div>

      {/* Aparece enquanto CNPJ, endereço ou contato do encarregado não
          estiverem preenchidos. Melhor a página assumir que está
          incompleta do que exibir "PENDENTE" no meio de um parágrafo
          como se fosse conteúdo — e é um lembrete difícil de ignorar
          antes de publicar para clientes. */}
      {faltando.length > 0 && (
        <div className="doc-aviso">
          <strong>Documento ainda não publicável.</strong> Faltam dados de identificação do
          responsável ({faltando.join(", ")}). Preencha em{" "}
          <code>web/lib/legal/identidade.ts</code> antes de oferecer o sistema a terceiros.
        </div>
      )}

      {doc.secoes.map((secao) => (
        <section className="doc-secao" key={secao.titulo}>
          <h2>{secao.titulo}</h2>
          <Paragrafos itens={secao.paragrafos} />
        </section>
      ))}

      <div className="doc-rodape-links">
        <Link href="/termos">Termos de Uso</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/privacidade">Política de Privacidade</Link>
      </div>

      <RodapeApp />
    </div>
  );
}
