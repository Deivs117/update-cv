/**
 * Pipeline compartido del Módulo 3+4 (análisis → tailorCV → render → compile
 * → carta opcional → metadata). Lo usan tanto POST /api/nueva-aplicacion/generate
 * (aplicación nueva) como POST /api/apps/[slug]/regenerate (Fase 7: regenerar
 * una aplicación existente reusando su misma carpeta).
 */
import path from "node:path";
import { getConnector, resolveClaudeMode, type ClaudeMode } from "@/lib/claude/get-connector";
import { ClaudeConnectorError, type JobAnalysis, type Language } from "@/lib/claude/connector.interface";
import { hasMinimumViableContent } from "@/lib/validation/profile.zod";
import { REPO_ROOT, ProfileIOError } from "@/lib/profile-io";
import { getPageRecommendation } from "@/lib/experience-years";
import { buildFinalCVData } from "@/lib/latex/build-final-cvdata";
import { renderCV } from "@/lib/latex/render";
import { renderVisualCV, prepareVisualAssets } from "@/lib/latex/render-visual";
import { renderCoverLetter } from "@/lib/latex/render-cover-letter";
import { compileLatex, LatexCompileError } from "@/lib/latex/compile";
import { countPdfPages, PageCountError } from "@/lib/latex/page-count";
import { getStorageAdapter } from "@/lib/storage/get-storage-adapter";
import type { ApplicationMetadata } from "@/lib/storage/storage-adapter.interface";

export type TemplateVariant = "ats" | "visual";
export type CoverLetterFormat = "pdf" | "text";

export interface CoverLetterOptions {
  enabled: boolean;
  format: CoverLetterFormat;
}

export interface GenerateApplicationInput {
  jobDescription: string;
  company: string;
  role: string;
  language: Language;
  templateVariant: TemplateVariant;
  jobAnalysis?: JobAnalysis;
  coverLetter: CoverLetterOptions;
  claudeMode?: ClaudeMode;
  /** Fase 7: al regenerar, reusa la aplicación existente en vez de crear una nueva con la fecha de hoy. */
  reuseSlug?: string;
  /** Reporta el paso actual (para UI no bloqueante -- ver web/lib/jobs.ts). */
  onProgress?: (stage: string) => void;
}

export interface GenerateApplicationResult {
  slug: string;
  pages: number;
  recommendedMaxPages: number;
  experienceYears: number;
  jobAnalysis: JobAnalysis;
  pdfUrl: string;
  coverLetterUrl?: string;
  coverLetterText?: string;
}

/** Error con status HTTP explícito, para que la ruta que llama decida el código de respuesta. */
export class ApplicationGenerationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApplicationGenerationError";
  }
}

export async function generateApplication(
  input: GenerateApplicationInput,
): Promise<GenerateApplicationResult> {
  const adapter = getStorageAdapter();
  const profile = await adapter.getProfile();
  if (!profile) {
    throw new ApplicationGenerationError(
      "No existe data/profile.json todavía. Completa tu perfil en /perfil antes de generar un CV.",
      409,
    );
  }
  if (!hasMinimumViableContent(profile)) {
    throw new ApplicationGenerationError(
      "Tu perfil no tiene el mínimo necesario (nombre, email, y al menos una experiencia o proyecto). Complétalo en /perfil.",
      409,
    );
  }

  const { experienceYears, recommendedMaxPages } = getPageRecommendation(profile.experience ?? []);
  const onProgress = input.onProgress ?? (() => {});
  const modeLabel = resolveClaudeMode(input.claudeMode) === "agent"
    ? " (modo Agente: si tienes `npm run agent:watch` corriendo se procesa solo; si no, pídele a Claude Code que procese las tareas pendientes)"
    : "";

  const connector = getConnector(input.claudeMode);
  onProgress(input.jobAnalysis ? "Preparando el análisis de la vacante..." : `Analizando la vacante con Claude...${modeLabel}`);
  const jobAnalysis =
    input.jobAnalysis ?? (await connector.analyzeJob({ jobDescription: input.jobDescription }));

  onProgress(`Adaptando tu contenido a esta vacante con Claude...${modeLabel}`);
  const tailored = await connector.tailorCV({
    profile,
    jobDescription: input.jobDescription,
    language: input.language,
    maxPages: recommendedMaxPages,
    jobAnalysis,
  });

  onProgress("Generando el documento LaTeX...");
  const cvData = buildFinalCVData(profile, input.language, tailored);
  const { slug } = input.reuseSlug
    ? { slug: input.reuseSlug }
    : await adapter.createApplication(input.company, input.role);
  const dir = await adapter.getApplicationDir(slug);

  let tex: string;
  if (input.templateVariant === "ats") {
    tex = await renderCV(cvData);
  } else {
    if (!profile.personal.photo_path) {
      throw new ApplicationGenerationError(
        "La plantilla visual requiere una foto: agrega personal.photo_path en /perfil (ej. data/raw/images/foto_perfil.jpg).",
        409,
      );
    }
    const photoAbsolutePath = path.join(REPO_ROOT, profile.personal.photo_path);
    const { photoFileName } = await prepareVisualAssets(dir, photoAbsolutePath);
    tex = await renderVisualCV(cvData, { photoFileName });
  }

  await adapter.saveApplication(slug, { cvTex: tex });
  onProgress("Compilando el PDF del CV...");
  const { pdfPath } = await compileLatex("cv.tex", dir);
  const pages = await countPdfPages(pdfPath);

  // Módulo 4 (sección 10): carta de presentación opcional, reusa el mismo
  // jobAnalysis -- no se re-analiza la vacante dos veces.
  let coverLetterUrl: string | undefined;
  let coverLetterText: string | undefined;
  if (input.coverLetter.enabled) {
    onProgress(`Escribiendo la carta de presentación con Claude...${modeLabel}`);
    const letterBody = await connector.generateCoverLetter({
      profile,
      jobDescription: input.jobDescription,
      language: input.language,
      company: input.company,
      role: input.role,
      jobAnalysis,
    });

    if (input.coverLetter.format === "text") {
      await adapter.saveApplication(slug, { coverLetterText: letterBody });
      coverLetterText = letterBody;
    } else {
      const letterTex = await renderCoverLetter({
        language: input.language,
        personal: cvData,
        company: input.company,
        bodyText: letterBody,
      });
      await adapter.saveApplication(slug, { coverLetterTex: letterTex });
      onProgress("Compilando el PDF de la carta de presentación...");
      await compileLatex("cover_letter.tex", dir);
      coverLetterUrl = `/api/apps/${slug}/cover_letter.pdf`;
    }
  }

  onProgress("Guardando la aplicación...");
  const metadata: ApplicationMetadata = {
    company: input.company,
    role: input.role,
    language: input.language,
    claudeMode: resolveClaudeMode(input.claudeMode),
    claudeModel: process.env.CLAUDE_MODEL || "claude-sonnet-5",
    templateVariant: input.templateVariant,
    pages,
    recommendedMaxPages,
    forcedTrim: false,
    createdAt: new Date().toISOString(),
    coverLetter: input.coverLetter.enabled ? input.coverLetter.format : "none",
  };
  await adapter.saveApplication(slug, { jobDescription: input.jobDescription, metadata });

  return {
    slug,
    pages,
    recommendedMaxPages,
    experienceYears,
    jobAnalysis,
    pdfUrl: `/api/apps/${slug}/cv.pdf`,
    coverLetterUrl,
    coverLetterText,
  };
}

/**
 * Traduce cualquier error conocido del pipeline (o de analyzeJob) a un
 * mensaje + status HTTP entendible, para usar tanto en rutas síncronas como
 * dentro de un job en segundo plano (ver web/lib/jobs.ts).
 */
export function mapGenerationError(err: unknown): { message: string; status: number } {
  if (err instanceof ApplicationGenerationError) return { message: err.message, status: err.status };
  if (
    err instanceof ClaudeConnectorError ||
    err instanceof LatexCompileError ||
    err instanceof PageCountError ||
    err instanceof ProfileIOError
  ) {
    return { message: err.message, status: 502 };
  }
  return { message: "Error inesperado generando el CV.", status: 500 };
}
