import path from "node:path";
import { createServer } from "vite";

const raiz = process.cwd();
const servidor = await createServer({
  appType: "custom",
  resolve: { alias: { "@": raiz } },
  server: { middlewareMode: true },
  plugins: [{
    name: "server-only-no-script-operacional",
    resolveId(id) {
      return id === "server-only" ? "\0server-only" : null;
    },
    load(id) {
      return id === "\0server-only" ? "export {};" : null;
    },
  }],
});

try {
  const modulo = await servidor.ssrLoadModule(path.posix.join("/scripts", "coletar-comparaveis-zonas.ts"));
  await modulo.executarColetaComparaveisPorZonas();
} finally {
  await servidor.close();
}
