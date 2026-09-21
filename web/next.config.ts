import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// El repo guarda .env en la raíz (junto a data/, apps/, templates/), no dentro
// de web/. Next.js por defecto solo carga .env desde su propio directorio, así
// que lo cargamos explícitamente aquí antes de que arranque cualquier ruta.
loadEnv({ path: path.resolve(__dirname, "..", ".env") });

const REPO_ROOT = path.resolve(__dirname, "..");
const tectonicPack = path.join(REPO_ROOT, "web/vendor/tectonic-linux-x64.pack");
const compileIncludes = ["../templates/latex/**/*", tectonicPack];

const nextConfig: NextConfig = {
  // Las plantillas LaTeX viven en templates/ (fuera de web/) y se leen con una
  // ruta calculada en runtime (render*.ts), así que el file tracing no las ve
  // solo: hay que incluirlas explícitamente en los bundles de las rutas que
  // compilan. Requiere "Include files outside of the Root Directory" activo en
  // el proyecto de Vercel (lo está por defecto). El glob va relativo a web/:
  // con ruta absoluta el trazado no incluía nada (verificado en Vercel, #101).
  outputFileTracingRoot: REPO_ROOT,
  // Solo las rutas que renderizan/compilan LaTeX (cada deployment cuenta contra
  // Functions Storage). Las claves de ruta se listan una por una: un comodín
  // "/api/**/*" no llegó a aplicarse en Vercel (#101, verificado en el trazado).
  outputFileTracingIncludes: {
    "/api/internal/jobs/generate": compileIncludes,
    "/api/apps/*/recompile": compileIncludes,
    "/api/apps/*/regenerate": compileIncludes,
    "/api/nueva-aplicacion/generate": compileIncludes,
  },
};

export default nextConfig;
