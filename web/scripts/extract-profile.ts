/**
 * Script de CLI para la Fase 1 (demo de extracción).
 *
 * Lee data/raw/*.pdf + data/raw/images/* del repo, llama al ApiConnector para
 * extraer un perfil canónico, y escribe el resultado en
 * data/profile.draft.json para revisión humana.
 *
 * Nunca escribe directamente sobre data/profile.json (sección 7.1: el
 * perfil definitivo solo se guarda tras confirmación explícita del usuario,
 * que en fases futuras ocurrirá desde el editor web /perfil).
 *
 * Uso:
 *   cd web && npm run extract-profile
 */
import { config as loadEnv } from "dotenv";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiConnector } from "@/lib/claude/api-connector";
import { ClaudeConnectorError } from "@/lib/claude/connector.interface";

// El repo guarda .env en la raíz (junto a data/, apps/, etc.), no dentro de web/.
const REPO_ROOT = path.resolve(__dirname, "..", "..");
loadEnv({ path: path.join(REPO_ROOT, ".env") });

const RAW_DIR = path.join(REPO_ROOT, "data", "raw");
const IMAGES_DIR = path.join(RAW_DIR, "images");
const DRAFT_OUTPUT_PATH = path.join(REPO_ROOT, "data", "profile.draft.json");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

async function findSeedPdf(): Promise<string> {
  const entries = await readdir(RAW_DIR, { withFileTypes: true });
  const pdf = entries.find(
    (e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"),
  );
  if (!pdf) {
    throw new Error(
      `No se encontró ningún PDF en ${RAW_DIR}. Coloca tu CV en formato PDF ahí antes de correr este script.`,
    );
  }
  return path.join(RAW_DIR, pdf.name);
}

async function findSeedImages(): Promise<string[]> {
  try {
    const entries = await readdir(IMAGES_DIR, { withFileTypes: true });
    return entries
      .filter(
        (e) =>
          e.isFile() &&
          IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()),
      )
      .map((e) => path.join(IMAGES_DIR, e.name))
      .sort();
  } catch {
    return [];
  }
}

async function main() {
  console.log("Fase 1 — Extracción de perfil (modo API)\n");

  const pdfPath = await findSeedPdf();
  const imagePaths = await findSeedImages();

  console.log(`PDF de entrada: ${pdfPath}`);
  console.log(
    imagePaths.length
      ? `Imágenes de apoyo (${imagePaths.length}): ${imagePaths.map((p) => path.basename(p)).join(", ")}`
      : "Sin imágenes de apoyo.",
  );
  console.log("\nLlamando a Claude para extraer el perfil...\n");

  const connector = new ApiConnector();
  const draft = await connector.extractProfile({ pdfPath, imagePaths });

  await writeFile(DRAFT_OUTPUT_PATH, JSON.stringify(draft, null, 2), "utf-8");

  console.log(`✅ Perfil extraído y guardado en: ${DRAFT_OUTPUT_PATH}`);
  console.log(
    "\nEste es un BORRADOR para revisión humana — todavía no es data/profile.json.",
  );
  console.log(
    "Revísalo a mano (o desde el editor /perfil en la Fase 2) antes de confirmarlo como perfil definitivo.",
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
