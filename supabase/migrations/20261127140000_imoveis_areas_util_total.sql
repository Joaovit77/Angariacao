-- ============================================================
-- IMÓVEIS — ÁREA ÚTIL E ÁREA TOTAL (m²)
--
-- Migration aditiva: acrescenta `area_util_m2` e `area_total_m2`
-- opcionais em `public.imoveis`, alimentando o cadastro de
-- imóveis e o preenchimento automático da Avaliação.
-- ============================================================

alter table public.imoveis
  add column if not exists area_util_m2 numeric
    check (area_util_m2 is null or (area_util_m2 >= 1 and area_util_m2 <= 100000));

alter table public.imoveis
  add column if not exists area_total_m2 numeric
    check (area_total_m2 is null or (area_total_m2 >= 1 and area_total_m2 <= 1000000));
