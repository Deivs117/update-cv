/**
 * Script de CLI para la Fase 1 (demo de extracción).
 *
 * Lee data/raw/*.pdf + data/raw/images/* del repo, llama al ApiConnector para
 * extraer un perfil canónico, y escribe el resultado en
 * data/profile.draft.json para revisión humana.
 *
 * Nunca escribe directamente sobre data/profile.json (sección 7.1: el
 * perfil definitivo solo se guarda tras confirmación explícita del usuario,
 * que a partir de la Fase 2 ocurre desde el editor web /perfil).
 *
 * Uso:
 *   cd web && npm run extract-profile
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { ApiConnector } from "@/lib/claude/api-connector";
import { ClaudeConnectorError } from "@/lib/claude/connector.interface";
import { findSeedFiles, PROFILE_DRAFT_PATH, writeDraft } from "@/lib/profile-io";

// El repo guarda .env en la raíz (junto a data/, apps/, etc.), no dentro de web/.
const REPO_ROOT = path.resolve(__dirname, "..", "..");
loadEnv({ path: path.join(REPO_ROOT, ".env") });

async function main() {
  console.log("Fase 1 — Extracción de perfil (modo API)\n");

  const { pdfPath, imagePaths } = await findSeedFiles();

  console.log(`PDF de entrada: ${pdfPath}`);
  console.log(
    imagePaths.length
      ? `Imágenes de apoyo (${imagePaths.length}): ${imagePaths.map((p) => path.basename(p)).join(", ")}`
      : "Sin imágenes de apoyo.",
  );
  console.log("\nLlamando a Claude para extraer el perfil...\n");

  const connector = new ApiConnector();
  const draft = await connector.extractProfile({ pdfPath, imagePaths });

  await writeDraft(draft);

  console.log(`✅ Perfil extraído y guardado en: ${PROFILE_DRAFT_PATH}`);
  console.log(
    "\nEste es un BORRADOR para revisión humana — todavía no es data/profile.json.",
  );
  console.log(
    "Revísalo desde el editor /perfil (botón 'Importar desde PDF/imágenes') antes de confirmarlo como perfil definitivo.",
  );
}

main().catch((err) => {
  if (err instanceof ClaudeConnectorError) {
    console.error(`\n❌ Error de extracción: ${err.message}`);
    if (err.cause) console.error("Causa:", err.cause);
  } else {
    console.error("\n❌ Error inesperado:", err);
  }
  process.exit(1);
});
