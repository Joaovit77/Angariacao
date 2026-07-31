/* O desfecho observado (lib/calculo/resultadoObservado).
   Feature nova da pós-migração — sem oráculo do app antigo.

   O que os testes protegem é a fronteira que justifica o módulo: o app só
   afirma o que OBSERVOU (chegou mensagem, ou não chegou nada), e nunca a
   categoria que só a conversa revela. Afrouxar isso seria deixar a IA decidir
   o que alimenta o ranking — o oposto do que o projeto inteiro faz. */
import { describe, expect, it } from "vitest";
import {
  DIAS_SILENCIO_DEFINITIVO,
  resultadoDaTentativa,
  resultadoEfetivo,
} from "@/lib/calculo/resultadoObservado";
import type { Imovel, NotaImovel, Tentativa } from "@/lib/tipos";

const HOJE = "2026-07-21";

const enviada = (over: Partial<Tentativa> = {}): Tentativa => ({
  id: "t1",
  data: "2026-07-20T10:00",
  canal: "WhatsApp",
  resultado: "sem-resposta",
  aguardandoResultado: true,
  ...over,
});

const resposta = (data: string): NotaImovel => ({
  id: `wa:${data}`,
  data,
  texto: "Resposta pelo WhatsApp: pode ser",
});

const imovel = (notas: NotaImovel[] = []): Imovel => ({
  id: "i1",
  endereco: "Rua A",
  status: "Novo contato",
  notas,
});

describe("resultadoEfetivo", () => {
  describe("o que foi afirmado por gente passa intacto", () => {
    it("tentativa manual não é reinterpretada", () => {
      const manual = enviada({ aguardandoResultado: undefined, resultado: "recusou" });
      const r = resultadoEfetivo(imovel([resposta("2026-07-20T15:00")]), manual, HOJE);
      expect(r).toEqual({ resultado: "recusou", origem: "confirmado", pendente: false });
    });

    /* "Sem resposta" anotado à mão é afirmação do corretor, não chute do
       sistema — e nunca foi cobrado. Continua não sendo. */
    it("'sem-resposta' confirmado continua confirmado", () => {
      const confirmado = enviada({ aguardandoResultado: false });
      expect(resultadoEfetivo(imovel(), confirmado, HOJE).origem).toBe("confirmado");
    });
  });

  describe("resposta observada", () => {
    it("mensagem depois da tentativa vira 'respondeu', sem perguntar nada", () => {
      const r = resultadoEfetivo(imovel([resposta("2026-07-20T15:00")]), enviada(), HOJE);
      expect(r.resultado).toBe("respondeu");
      expect(r.origem).toBe("resposta-observada");
      expect(r.respondeuEm).toBe("2026-07-20T15:00");
    });

    /* O binário é fato; a categoria é conversa. Aplicar a sugestão da IA aqui
       faria o ranking medir a leitura dela, não o roteiro. */
    it("segue pendente: a categoria fina é o que o app não vê", () => {
      const r = resultadoEfetivo(imovel([resposta("2026-07-20T15:00")]), enviada(), HOJE);
      expect(r.pendente).toBe(true);
    });

    it("pega a PRIMEIRA resposta posterior, não a última", () => {
      const notas = [resposta("2026-07-20T18:00"), resposta("2026-07-20T15:00")];
      expect(resultadoEfetivo(imovel(notas), enviada(), HOJE).respondeuEm).toBe("2026-07-20T15:00");
    });

    it("mensagem anterior à tentativa não é desfecho dela", () => {
      const r = resultadoEfetivo(imovel([resposta("2026-07-19T15:00")]), enviada(), HOJE);
      expect(r.resultado).toBe("sem-resposta");
    });

    /* Empate exato no datetime cai para "não é posterior" — o lado
       conservador, igual ao corte da caixa de respostas. */
    it("empate exato de horário não conta como resposta", () => {
      const r = resultadoEfetivo(imovel([resposta("2026-07-20T10:00")]), enviada(), HOJE);
      expect(r.resultado).toBe("sem-resposta");
    });

    /* A nota do encerramento automático nasce com o mesmo prefixo `wa:` e é o
       APP falando. Contá-la faria o sistema dar a própria fala por resposta
       do proprietário — é o erro que `ehNotaDeResposta` existe para impedir. */
    it("a nota do encerramento automático não conta como resposta", () => {
      const nota: NotaImovel = {
        id: "wa:abc:encerrado",
        data: "2026-07-20T15:00",
        texto: "Encerrado automaticamente",
      };
      expect(resultadoEfetivo(imovel([nota]), enviada(), HOJE).resultado).toBe("sem-resposta");
    });

    it("a nota escrita à mão pelo corretor também não conta", () => {
      const nota: NotaImovel = { id: "n1", data: "2026-07-20T15:00", texto: "liguei, não atendeu" };
      expect(resultadoEfetivo(imovel([nota]), enviada(), HOJE).resultado).toBe("sem-resposta");
    });
  });

  describe("silêncio", () => {
    it("dentro do prazo vale 'sem-resposta' — e nunca é pendência", () => {
      const r = resultadoEfetivo(imovel(), enviada(), HOJE);
      expect(r).toEqual({ resultado: "sem-resposta", origem: "silencio", pendente: false });
    });

    it("passado o prazo, o silêncio é definitivo", () => {
      const velha = enviada({ data: "2026-07-01T10:00" });
      expect(resultadoEfetivo(imovel(), velha, HOJE).origem).toBe("silencio-definitivo");
    });

    it("o corte é o dia seguinte ao prazo, não o próprio", () => {
      const noLimite = enviada({ data: "2026-07-07T10:00" }); // 14 dias
      const passou = enviada({ data: "2026-07-06T10:00" }); // 15 dias
      expect(DIAS_SILENCIO_DEFINITIVO).toBe(14);
      expect(resultadoEfetivo(imovel(), noLimite, HOJE).origem).toBe("silencio");
      expect(resultadoEfetivo(imovel(), passou, HOJE).origem).toBe("silencio-definitivo");
    });

    /* A derivação acompanha o tempo sozinha: nada é gravado, então a resposta
       que chega amanhã muda o desfecho de ontem sem ninguém rodar nada. */
    it("a mesma tentativa muda de desfecho quando a resposta chega", () => {
      const t = enviada();
      expect(resultadoDaTentativa(imovel(), t, HOJE)).toBe("sem-resposta");
      expect(resultadoDaTentativa(imovel([resposta("2026-07-20T15:00")]), t, HOJE)).toBe("respondeu");
    });
  });
});
