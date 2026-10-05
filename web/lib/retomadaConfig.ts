/** B4 exige opt-in e desenvolvimento local; ambientes hospedados ficam fechados. */
export function retomadaB4Habilitada(ambiente: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return ambiente.NODE_ENV === "development"
    && ambiente.RETOMADA_B4_LOCAL === "1"
    && !("VERCEL" in ambiente)
    && !("VERCEL_ENV" in ambiente)
    && !("CI" in ambiente);
}
