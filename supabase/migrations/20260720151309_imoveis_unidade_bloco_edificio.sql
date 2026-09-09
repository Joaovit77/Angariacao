-- Endereçamento dentro do prédio/condomínio. Não é só descritivo: `unidade` e
-- `bloco` entram na identidade do imóvel (calculo/duplicidade.ts), porque no
-- mesmo endereço o ap 101 e o ap 202 são imóveis diferentes.
alter table imoveis add column if not exists unidade text;
alter table imoveis add column if not exists bloco text;
alter table imoveis add column if not exists edificio text;;
