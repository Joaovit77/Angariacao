/* Versão exibida no rodapé. O valor real é injetado no build a partir do
   "version" do package.json (ver `env` em next.config.ts) — assim não existe
   um segundo número pra manter em dia à mão. O fallback só aparece se alguém
   rodar o app sem passar pelo next.config. */
export const VERSAO_APP = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
