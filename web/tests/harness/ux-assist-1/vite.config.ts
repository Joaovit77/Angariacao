import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const arquivo = (relativo: string) => fileURLToPath(new URL(relativo, import.meta.url));
export default defineConfig({
  root: arquivo("."),
  define: { "process.env": "{}" },
  resolve: { alias: [
    { find: "@/lib/assistente/cliente", replacement: arquivo("./clienteFalso.ts") },
    { find: "@/lib/persistencia/supabase", replacement: arquivo("../vendas-b34b-b1/supabaseSintetico.ts") },
    { find: "@/components/SessaoProvider", replacement: arquivo("./sessaoFalsa.ts") },
    { find: "next/navigation", replacement: arquivo("./navegacaoFalsa.ts") },
    { find: "@", replacement: arquivo("../../../") },
  ] },
  plugins: [{ name: "supabase-sintetico-ux-assist", enforce: "pre", resolveId(source, importer) {
    if (source === "./supabase" && importer?.replace(/\\/g, "/").includes("/lib/persistencia/")) return arquivo("../vendas-b34b-b1/supabaseSintetico.ts");
  } }],
  server: { host: "127.0.0.1", port: 3431, strictPort: true, fs: { allow: [arquivo("../../../")] } },
});
