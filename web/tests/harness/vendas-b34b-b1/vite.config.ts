import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("../../../", import.meta.url)) } },
  plugins: [{ name: "supabase-sintetico-b1", enforce: "pre", resolveId(source, importer) {
    if (source === "./supabase" && importer?.replace(/\\/g, "/").includes("/lib/persistencia/")) return fileURLToPath(new URL("./supabaseSintetico.ts", import.meta.url));
  } }],
  server: { host: "127.0.0.1", port: 3426, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../../", import.meta.url))] } },
});
