/**
 * Carpeta de salida por aplicación de empleo: apps/{empresa}-{puesto}-{YYYYMMDD}/
 * (sección 9.7). Solo se usa desde el servidor -- concretamente, desde
 * FilesystemStorageAdapter (lib/storage/filesystem-storage-adapter.ts, #13),
 * nunca directo desde una ruta de API.
 */
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "@/lib/profile-io";
import type {
  ApplicationMetadata,
  ApplicationPatch,
  ApplicationPdfFile,
  ApplicationRecord,
} from "@/lib/storage/storage-adapter.interface";

export const APPS_DIR = path.join(REPO_ROOT, "apps");

export class ApplicationSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationSlugError";
  }
}

/**
 * Resuelve `slug` a una carpeta real dentro de APPS_DIR, rechazando
 * cualquier intento de salir de ahí (`..`, separadores). A diferencia del
 * antiguo `GET /api/apps/[...path]`, acá `slug` es siempre UN solo segmento
 * (nunca una ruta), así que no hay "path arbitrario" que restringir después
 * -- la validación es la garantía, no un parche sobre una ruta genérica.
 */
export function resolveApplicationDir(slug: string): string {
  if (!slug || slug.includes("/") || slug.includes("\\") || slug.includes("..")) {
    throw new ApplicationSlugError(`Slug de aplicación inválido: "${slug}".`);
  }
  const dir = path.join(APPS_DIR, slug);
  if (path.resolve(dir) !== path.join(path.resolve(APPS_DIR), slug)) {
    throw new ApplicationSlugError(`Slug de aplicación inválido: "${slug}".`);
  }
  return dir;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos (marcas diacríticas combinadas)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function todayYYYYMMDD(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * El tipo vive en storage-adapter.interface.ts (#13, dueño del contrato) --
 * se re-exporta acá porque el resto del código (rutas, páginas cliente) ya
 * lo importa desde `@/lib/apps-io` y cambiar todos esos imports no aporta
 * nada.
 */
export type { ApplicationMetadata };

/** Crea (o reutiliza) la carpeta apps/{empresa}-{puesto}-{fecha}/ y devuelve su ruta absoluta. */
export async function createApplicationDir(
  company: string,
  role: string,
): Promise<{ dir: string; slug: string }> {
  const slug = `${slugify(company)}-${slugify(role)}-${todayYYYYMMDD()}`;
  const dir = path.join(APPS_DIR, slug);
  await mkdir(dir, { recursive: true });
  return { dir, slug };
}

export async function writeApplicationOutputs(
  dir: string,
  files: {
    jobDescription: string;
    metadata: ApplicationMetadata;
  },
): Promise<void> {
  await writeFile(path.join(dir, "job_description.txt"), files.jobDescription, "utf-8");
  await writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(files.metadata, null, 2) + "\n",
    "utf-8",
  );
}

export interface ApplicationSummary extends ApplicationMetadata {
  slug: string;
  pdfUrl: string;
  texUrl: string;
  jobDescriptionUrl: string;
  coverLetterUrl?: string;
  coverLetterTextUrl?: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Historial de /aplicaciones (Fase 7): lista simple ordenada por fecha, sin búsqueda/filtrado. */
export async function listApplications(): Promise<ApplicationSummary[]> {
  let entries;
  try {
    entries = await readdir(APPS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const summaries: ApplicationSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(APPS_DIR, entry.name);
    const metadataPath = path.join(dir, "metadata.json");
    try {
      const raw = await readFile(metadataPath, "utf-8");
      const metadata = JSON.parse(raw) as ApplicationMetadata;
      const hasCoverLetterPdf = await fileExists(path.join(dir, "cover_letter.pdf"));
      const hasCoverLetterTxt = await fileExists(path.join(dir, "cover_letter.txt"));
      summaries.push({
        ...metadata,
        slug: entry.name,
        pdfUrl: `/api/apps/${entry.name}/cv.pdf`,
        texUrl: `/api/apps/${entry.name}/cv.tex`,
        jobDescriptionUrl: `/api/apps/${entry.name}/job_description.txt`,
        coverLetterUrl: hasCoverLetterPdf ? `/api/apps/${entry.name}/cover_letter.pdf` : undefined,
        coverLetterTextUrl: hasCoverLetterTxt ? `/api/apps/${entry.name}/cover_letter.txt` : undefined,
      });
    } catch {
      // Carpeta sin metadata.json válido (ej. generación interrumpida) -- se omite del historial.
      continue;
    }
  }

  return summaries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Registro completo de una aplicación -- reemplaza leer archivo por archivo
 * vía `GET /api/apps/[...path]` (decisión #13: el .tex/job_description/
 * metadata son contenido de la fila, no archivos sueltos que "servir").
 */
export async function readApplicationRecord(slug: string): Promise<ApplicationRecord | null> {
  let dir: string;
  try {
    dir = resolveApplicationDir(slug);
  } catch (err) {
    if (err instanceof ApplicationSlugError) return null; // slug inválido == no encontrado, no se distingue
    throw err;
  }
  let metadata: ApplicationMetadata;
  try {
    metadata = JSON.parse(await readFile(path.join(dir, "metadata.json"), "utf-8"));
  } catch {
    return null;
  }

  const [jobDescription, cvTex] = await Promise.all([
    readFile(path.join(dir, "job_description.txt"), "utf-8").catch(() => ""),
    readFile(path.join(dir, "cv.tex"), "utf-8").catch(() => ""),
  ]);

  let coverLetterTex: string | undefined;
  let coverLetterText: string | undefined;
  if (metadata.coverLetter === "pdf") {
    coverLetterTex = await readFile(path.join(dir, "cover_letter.tex"), "utf-8").catch(() => undefined);
  } else if (metadata.coverLetter === "text") {
    coverLetterText = await readFile(path.join(dir, "cover_letter.txt"), "utf-8").catch(() => undefined);
  }

  return { slug, metadata, jobDescription, cvTex, coverLetterTex, coverLetterText };
}

/**
 * Aplica un patch parcial al registro (mismo criterio que `saveApplication`
 * del contrato `StorageAdapter`, #13): cada campo presente se escribe a su
 * archivo correspondiente, `metadata` se fusiona con la existente.
 */
export async function writeApplicationPatch(slug: string, patch: ApplicationPatch): Promise<void> {
  const dir = resolveApplicationDir(slug);

  if (patch.jobDescription !== undefined) {
    await writeFile(path.join(dir, "job_description.txt"), patch.jobDescription, "utf-8");
  }
  if (patch.cvTex !== undefined) {
    await writeFile(path.join(dir, "cv.tex"), patch.cvTex, "utf-8");
  }
  if (patch.coverLetterTex !== undefined) {
    await writeFile(path.join(dir, "cover_letter.tex"), patch.coverLetterTex, "utf-8");
  }
  if (patch.coverLetterText !== undefined) {
    await writeFile(path.join(dir, "cover_letter.txt"), patch.coverLetterText, "utf-8");
  }
  if (patch.metadata !== undefined) {
    const metadataPath = path.join(dir, "metadata.json");
    let current: ApplicationMetadata;
    try {
      current = JSON.parse(await readFile(metadataPath, "utf-8"));
    } catch {
      // Primera escritura (aplicación nueva, todavía sin metadata.json):
      // el patch debe traer los campos obligatorios completos.
      current = patch.metadata as ApplicationMetadata;
    }
    const merged = { ...current, ...patch.metadata };
    await writeFile(metadataPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  }
}

/** Bytes del PDF ya compilado (tectonic/pdflatex los deja directo en `dir`), o `null` si no existe. */
export async function readApplicationPdf(slug: string, file: ApplicationPdfFile): Promise<Buffer | null> {
  try {
    const dir = resolveApplicationDir(slug);
    return await readFile(path.join(dir, `${file}.pdf`));
  } catch {
    return null; // slug inválido o PDF inexistente -- ambos "no encontrado" para el caller.
  }
}
