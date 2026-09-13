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
    coverage: {
      provider: "v8",
      // "json-summary" es el que necesita la action de reporte en PR
      // (davelosert/vitest-coverage-report-action); "json" para el detalle
      // por archivo dentro de ese mismo comentario; "text" para verlo en la
      // terminal sin abrir nada; "html" para inspección local manual.
      reporter: ["text", "json-summary", "json", "html"],
      // El comentario en el PR debe verse incluso cuando el umbral falla
      // (no solo cuando un test falla) -- si no, un PR que rompe el piso de
      // cobertura falla "en silencio" sin mostrar el detalle.
      reportOnFailure: true,
      // Acotado a lib/ (lógica pura y I/O mockeado, ver alcance de #65) --
      // no a app/ (rutas de Next.js/componentes React, sin tests todavía
      // por diseño): medir cobertura ahí daría un % artificialmente bajo
      // que no refleja lo que este ticket realmente cubre.
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "lib/db/schema.ts", "lib/validation/**"],
      // Piso real (#77, medido tras agregar tests a la parte barata/pura del
      // pipeline: tailoring, jobs, los builders de latex/), un poco por
      // debajo del actual para dejar margen -- no un número arbitrario. Lo
      // que queda por debajo (compile.ts, generation-pipeline.ts, apps-io.ts,
      // supabase-storage.ts, los wrappers de Supabase) sigue siendo I/O real
      // verificado manualmente, no "deuda" que este umbral deba forzar a
      // subir de golpe. Evita que alguien borre tests existentes sin darse
      // cuenta, no exige mejorar más de lo ya hecho acá.
      thresholds: {
        statements: 35,
        branches: 38,
        functions: 45,
        lines: 35,
      },
    },
  },
});
