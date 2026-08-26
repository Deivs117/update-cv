/**
 * Carpeta de salida por aplicación de empleo: apps/{empresa}-{puesto}-{YYYYMMDD}/
 * (sección 9.7). Solo se usa desde el servidor.
 */
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "@/lib/profile-io";

export const APPS_DIR = path.join(REPO_ROOT, "apps");

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

export interface ApplicationMetadata {
  company: string;
  role: string;
  language: "es" | "en";
  claudeMode: "api" | "agent";
  claudeModel?: string;
  templateVariant: "ats" | "visual";
  pages: number;
  recommendedMaxPages: number;
  forcedTrim: boolean;
  createdAt: string;
  /** "none" si no se pidió carta de presentación (sección 10). */
  coverLetter: "none" | "pdf" | "text";
}

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
