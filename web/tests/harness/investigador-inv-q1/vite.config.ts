import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../../../", import.meta.url));
const aqui = (arquivo: string) => fileURLToPath(new URL(arquivo, import.meta.url));

// Só para o smoke visual do INV-Q1: a View recebe um investigador falso,
// alimentado por fixtures sintéticas. Nenhuma rede, nenhuma API paga.
export default defineConfig({
  root: aqui("."),
  resolve: {
    alias: [
      { find: /^@\/lib\/investigadorImoveis$/, replacement: aqui("./investigadorFalso.ts") },
      { find: /^next\/link$/, replacement: aqui("./linkFalso.tsx") },
      { find: /^@\//, replacement: web },
    ],
  },
  server: { host: "127.0.0.1", port: 3415, strictPort: true, fs: { allow: [web] } },
});
