/**
 * Acceso a data/profile.json, data/profile.draft.json y data/raw/ desde el
 * servidor de Next.js (API routes). No se debe importar desde código cliente.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  profileSchema,
  type Profile,
  type ProfileInput,
} from "@/lib/validation/profile.zod";

// Cuando Next.js corre (`next dev` / `next start`), su cwd es el propio
// directorio web/ -- el repo guarda data/ un nivel arriba de eso.
export const REPO_ROOT = path.resolve(process.cwd(), "..");
export const DATA_DIR = path.join(REPO_ROOT, "data");
export const PROFILE_PATH = path.join(DATA_DIR, "profile.json");
export const PROFILE_DRAFT_PATH = path.join(DATA_DIR, "profile.draft.json");
export const RAW_DIR = path.join(DATA_DIR, "raw");
export const RAW_IMAGES_DIR = path.join(RAW_DIR, "images");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export class ProfileIOError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProfileIOError";
  }
}

/** Devuelve el perfil guardado, o `null` si todavía no existe (usuario nuevo). */
export async function readProfile(): Promise<Profile | null> {
  let raw: string;
  try {
    raw = await readFile(PROFILE_PATH, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ProfileIOError(
      `No se pudo leer ${PROFILE_PATH}.`,
      err,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ProfileIOError(
      `data/profile.json existe pero no es JSON válido. Corrígelo a mano o restaura desde el historial de Git.`,
      err,
    );
  }

  const result = profileSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProfileIOError(
      `data/profile.json no cumple el schema esperado: ${result.error.message}`,
      result.error,
    );
  }
  return result.data;
}

/** Valida y persiste el perfil definitivo. Nunca se llama automáticamente. */
export async function writeProfile(profile: ProfileInput): Promise<Profile> {
  const withMeta = {
    ...profile,
    meta: {
      schema_version: profile.meta?.schema_version || "1.0",
      last_updated: new Date().toISOString(),
    },
  };

  const result = profileSchema.safeParse(withMeta);
  if (!result.success) {
    throw new ProfileIOError(
      `El perfil no cumple el schema esperado, no se guardó: ${result.error.message}`,
      result.error,
    );
  }

  try {
    await writeFile(
      PROFILE_PATH,
      JSON.stringify(result.data, null, 2) + "\n",
      "utf-8",
    );
  } catch (err) {
    throw new ProfileIOError(`No se pudo escribir ${PROFILE_PATH}.`, err);
  }

  return result.data;
}

export async function readDraft(): Promise<unknown | null> {
  try {
    const raw = await readFile(PROFILE_DRAFT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ProfileIOError(
      `No se pudo leer ${PROFILE_DRAFT_PATH}.`,
      err,
    );
  }
}

async function writeDraft(draft: unknown): Promise<void> {
  await writeFile(
    PROFILE_DRAFT_PATH,
    JSON.stringify(draft, null, 2) + "\n",
    "utf-8",
  );
}

export { writeDraft };

/** Encuentra el PDF y las imágenes de semilla en data/raw/ para la extracción. */
export async function findSeedFiles(): Promise<{
  pdfPath: string;
  imagePaths: string[];
}> {
  let entries;
  try {
    entries = await readdir(RAW_DIR, { withFileTypes: true });
  } catch (err) {
    throw new ProfileIOError(
      `No existe ${RAW_DIR}. Coloca ahí tu CV en PDF antes de importar.`,
      err,
    );
  }

  const pdfEntry = entries.find(
    (e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"),
  );
  if (!pdfEntry) {
    throw new ProfileIOError(
      `No se encontró ningún PDF en ${RAW_DIR}. Coloca tu CV en formato PDF ahí antes de importar.`,
    );
  }

  let imagePaths: string[] = [];
  try {
    const imageEntries = await readdir(RAW_IMAGES_DIR, {
      withFileTypes: true,
    });
    imagePaths = imageEntries
      .filter(
        (e) =>
          e.isFile() &&
          IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()),
      )
      .map((e) => path.join(RAW_IMAGES_DIR, e.name))
      .sort();
  } catch {
    // Sin imágenes de apoyo: no es un error, la extracción puede correr solo con el PDF.
  }

  return { pdfPath: path.join(RAW_DIR, pdfEntry.name), imagePaths };
}
