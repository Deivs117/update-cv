/**
 * Configuración de Vitest (#65). `resolve.tsconfigPaths` resuelve el alias
 * `@/...` que ya usa el proyecto (tsconfig.json) de forma nativa (Vite ya no
 * necesita el plugin `vite-tsconfig-paths` para esto).
 *
 * Alcance: unit tests sobre lógica pura y sobre I/O mockeado (Supabase/DB,
 * decisión documentada en el issue) -- nunca contra servicios reales. No
 * cubre componentes React ni rutas de Next.js todavía (fuera de alcance de
 * este ticket).
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
});
