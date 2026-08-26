/**
 * Pipeline compartido del Módulo 3+4 (análisis → tailorCV → render → compile
 * → carta opcional → metadata). Lo usan tanto POST /api/nueva-aplicacion/generate
 * (aplicación nueva) como POST /api/apps/[slug]/regenerate (Fase 7: regenerar
 * una aplicación existente reusando su misma carpeta).
 */
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { getConnector, resolveClaudeMode, type ClaudeMode } from "@/lib/claude/get-connector";
import type { JobAnalysis, Language } from "@/lib/claude/connector.interface";
import { hasMinimumViableContent } from "@/lib/validation/profile.zod";
import { readProfile, REPO_ROOT } from "@/lib/profile-io";
import { getPageRecommendation } from "@/lib/experience-years";
import { buildFinalCVData } from "@/lib/latex/build-final-cvdata";
import { renderCV } from "@/lib/latex/render";
import { renderVisualCV, prepareVisualAssets } from "@/lib/latex/render-visual";
import { renderCoverLetter } from "@/lib/latex/render-cover-letter";
import { compileLatex } from "@/lib/latex/compile";
import { countPdfPages } from "@/lib/latex/page-count";
import { createApplicationDir, writeApplicationOutputs, type ApplicationMetadata } from "@/lib/apps-io";

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
  /** Fase 7: al regenerar, reusa la carpeta existente en vez de crear una con la fecha de hoy. */
  reuseDir?: { dir: string; slug: string };
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
  const profile = await readProfile();
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

  const connector = getConnector(input.claudeMode);
  const jobAnalysis =
    input.jobAnalysis ?? (await connector.analyzeJob({ jobDescription: input.jobDescription }));
  const tailored = await connector.tailorCV({
    profile,
    jobDescription: input.jobDescription,
    language: input.language,
    maxPages: recommendedMaxPages,
    jobAnalysis,
  });

  const cvData = buildFinalCVData(profile, input.language, tailored);
  const { dir, slug } =
    input.reuseDir ?? (await createApplicationDir(input.company, input.role));

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

  await writeFile(path.join(dir, "cv.tex"), tex, "utf-8");
  const { pdfPath } = await compileLatex("cv.tex", dir);
  const pages = await countPdfPages(pdfPath);

  // Módulo 4 (sección 10): carta de presentación opcional, reusa el mismo
  // jobAnalysis -- no se re-analiza la vacante dos veces.
  let coverLetterUrl: string | undefined;
  let coverLetterText: string | undefined;
  if (input.coverLetter.enabled) {
    const letterBody = await connector.generateCoverLetter({
      profile,
      jobDescription: input.jobDescription,
      language: input.language,
      company: input.company,
      role: input.role,
      jobAnalysis,
    });

    if (input.coverLetter.format === "text") {
      await writeFile(path.join(dir, "cover_letter.txt"), letterBody, "utf-8");
      coverLetterText = letterBody;
    } else {
      const letterTex = await renderCoverLetter({
        language: input.language,
        personal: cvData,
        company: input.company,
        bodyText: letterBody,
      });
      await writeFile(path.join(dir, "cover_letter.tex"), letterTex, "utf-8");
      await compileLatex("cover_letter.tex", dir);
      coverLetterUrl = `/api/apps/${slug}/cover_letter.pdf`;
    }
  }

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
  await writeApplicationOutputs(dir, { jobDescription: input.jobDescription, metadata });

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
