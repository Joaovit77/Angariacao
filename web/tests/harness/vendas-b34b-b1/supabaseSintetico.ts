import { bancoSinteticoB1 } from "@/tests/fixtures/vendasB34bB1";
export const banco = bancoSinteticoB1();
export const getSupabase = () => banco.cliente;
