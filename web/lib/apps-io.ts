/**
 * Carpeta de salida por aplicación de empleo: apps/{empresa}-{puesto}-{YYYYMMDD}/
 * (sección 9.7). Solo se usa desde el servidor.
 */
import { mkdir, writeFile } from "node:fs/promises";
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
