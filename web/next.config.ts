import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// El repo guarda .env en la raíz (junto a data/, apps/, templates/), no dentro
// de web/. Next.js por defecto solo carga .env desde su propio directorio, así
// que lo cargamos explícitamente aquí antes de que arranque cualquier ruta.
loadEnv({ path: path.resolve(__dirname, "..", ".env") });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
