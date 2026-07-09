import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Datas circulam SEMPRE como string ISO "YYYY-MM-DD" manipulada pelos
    // helpers de lib/datas.ts — `new Date` cru interpreta ISO como UTC e
    // desloca o dia (MIGRATION_NEXT.md §3.5). Único módulo autorizado:
    // lib/datas.ts. Testes ficam fora da regra (usam vi.setSystemTime).
    files: ["app/**/*.{ts,tsx}", "lib/**/*.ts"],
    ignores: ["lib/datas.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message: "Não use `new Date` fora de lib/datas.ts — use os helpers ISO (parseDate/daysBetween/addDaysISO/todayISO).",
        },
      ],
    },
  },
]);

export default eslintConfig;
