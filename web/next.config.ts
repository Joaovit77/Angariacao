import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// A versão do rodapé sai daqui: lida do package.json no build e inlineada como
// NEXT_PUBLIC_APP_VERSION (ver lib/versao.ts). Evita um número duplicado.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
};

export default nextConfig;
