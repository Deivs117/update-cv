import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// El repo guarda .env en la raíz (junto a data/, apps/, templates/), no dentro
// de web/. Next.js por defecto solo carga .env desde su propio directorio, así
// que lo cargamos explícitamente aquí antes de que arranque cualquier ruta.
loadEnv({ path: path.resolve(__dirname, "..", ".env") });

const REPO_ROOT = path.resolve(__dirname, "..");
const tectonicPack = path.join(REPO_ROOT, "web/vendor/tectonic-linux-x64.pack");

const nextConfig: NextConfig = {
  // Las plantillas LaTeX viven en templates/ (fuera de web/) y se leen con una
  // ruta calculada en runtime (render*.ts), así que el file tracing no las ve
  // solo: hay que incluirlas explícitamente en los bundles de las rutas que
  // compilan. Requiere "Include files outside of the Root Directory" activo en
  // el proyecto de Vercel (lo está por defecto).
  outputFileTracingRoot: REPO_ROOT,
  outputFileTracingIncludes: {
    "/api/**/*": [path.join(REPO_ROOT, "templates/latex/**/*")],
    // Paquete de tectonic (#101, ~10 MB): solo en las funciones que compilan,
    // porque cada deployment cuenta contra Functions Storage.
    "/api/internal/jobs/*": [tectonicPack],
    "/api/apps/*/recompile": [tectonicPack],
    "/api/apps/*/regenerate": [tectonicPack],
    "/api/nueva-aplicacion/generate": [tectonicPack],
  },
};

export default nextConfig;
