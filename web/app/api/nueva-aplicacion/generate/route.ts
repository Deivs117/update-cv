import { NextResponse } from "next/server";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { getConnector, resolveClaudeMode, type ClaudeMode } from "@/lib/claude/get-connector";
import { ClaudeConnectorError, type JobAnalysis, type Language } from "@/lib/claude/connector.interface";
import { hasMinimumViableContent } from "@/lib/validation/profile.zod";
import { ProfileIOError, readProfile, REPO_ROOT } from "@/lib/profile-io";
import { getPageRecommendation } from "@/lib/experience-years";
import { buildFinalCVData } from "@/lib/latex/build-final-cvdata";
import { renderCV } from "@/lib/latex/render";
import { renderVisualCV, prepareVisualAssets } from "@/lib/latex/render-visual";
import { renderCoverLetter } from "@/lib/latex/render-cover-letter";
import { compileLatex, LatexCompileError } from "@/lib/latex/compile";
import { countPdfPages, PageCountError } from "@/lib/latex/page-count";
import { createApplicationDir, writeApplicationOutputs, type ApplicationMetadata } from "@/lib/apps-io";

type TemplateVariant = "ats" | "visual";
type CoverLetterFormat = "pdf" | "text";

interface CoverLetterOptions {
  enabled: boolean;
  format: CoverLetterFormat;
}

interface GenerateRequestBody {
  jobDescription: string;
  company: string;
  role: string;
  language: Language;
  templateVariant: TemplateVariant;
  jobAnalysis?: JobAnalysis;
  coverLetter: CoverLetterOptions;
  claudeMode?: ClaudeMode;
}

function parseBody(body: unknown): GenerateRequestBody | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (
    typeof b.jobDescription !== "string" ||
    typeof b.company !== "string" ||
    typeof b.role !== "string" ||
    (b.language !== "es" && b.language !== "en") ||
    (b.templateVariant !== "ats" && b.templateVariant !== "visual")
  ) {
    return null;
  }

  const rawCoverLetter = (b.coverLetter as Record<string, unknown> | undefined) ?? {};
  const coverLetter: CoverLetterOptions = {
    enabled: rawCoverLetter.enabled === true,
    format: rawCoverLetter.format === "text" ? "text" : "pdf",
  };

  const claudeMode: ClaudeMode | undefined =
    b.claudeMode === "api" || b.claudeMode === "agent" ? b.claudeMode : undefined;

  return {
    jobDescription: b.jobDescription,
    company: b.company,
    role: b.role,
    language: b.language,
    templateVariant: b.templateVariant,
    jobAnalysis: b.jobAnalysis as JobAnalysis | undefined,
    coverLetter,
    claudeMode,
  };
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }

  const body = parseBody(rawBody);
  if (!body) {
    return NextResponse.json(
      {
        error:
          "Faltan campos requeridos: jobDescription, company, role, language ('es'|'en'), templateVariant ('ats'|'visual').",
      },
      { status: 400 },
    );
  }
  if (!body.jobDescription.trim() || !body.company.trim() || !body.role.trim()) {
    return NextResponse.json(
      { error: "La vacante, la empresa y el puesto no pueden estar vacíos." },
      { status: 400 },
    );
  }

  try {
    const profile = await readProfile();
    if (!profile) {
      return NextResponse.json(
        { error: "No existe data/profile.json todavía. Completa tu perfil en /perfil antes de generar un CV." },
        { status: 409 },
      );
    }
    if (!hasMinimumViableContent(profile)) {
      return NextResponse.json(
        {
          error:
            "Tu perfil no tiene el mínimo necesario (nombre, email, y al menos una experiencia o proyecto). Complétalo en /perfil.",
        },
        { status: 409 },
      );
    }

    const { experienceYears, recommendedMaxPages } = getPageRecommendation(profile.experience ?? []);

    const connector = getConnector(body.claudeMode);
    const jobAnalysis = body.jobAnalysis ?? (await connector.analyzeJob({ jobDescription: body.jobDescription }));
    const tailored = await connector.tailorCV({
      profile,
      jobDescription: body.jobDescription,
      language: body.language,
      maxPages: recommendedMaxPages,
      jobAnalysis,
    });

    const cvData = buildFinalCVData(profile, body.language, tailored);
    const { dir, slug } = await createApplicationDir(body.company, body.role);

    let tex: string;
    if (body.templateVariant === "ats") {
      tex = await renderCV(cvData);
    } else {
      if (!profile.personal.photo_path) {
        return NextResponse.json(
          {
            error:
              "La plantilla visual requiere una foto: agrega personal.photo_path en /perfil (ej. data/raw/images/foto_perfil.jpg).",
          },
          { status: 409 },
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
    if (body.coverLetter.enabled) {
      const letterBody = await connector.generateCoverLetter({
        profile,
        jobDescription: body.jobDescription,
        language: body.language,
        company: body.company,
        role: body.role,
        jobAnalysis,
      });

      if (body.coverLetter.format === "text") {
        await writeFile(path.join(dir, "cover_letter.txt"), letterBody, "utf-8");
        coverLetterText = letterBody;
      } else {
        const letterTex = await renderCoverLetter({
          language: body.language,
          personal: cvData,
          company: body.company,
          bodyText: letterBody,
        });
        await writeFile(path.join(dir, "cover_letter.tex"), letterTex, "utf-8");
        await compileLatex("cover_letter.tex", dir);
        coverLetterUrl = `/api/apps/${slug}/cover_letter.pdf`;
      }
    }

    const metadata: ApplicationMetadata = {
      company: body.company,
      role: body.role,
      language: body.language,
      claudeMode: resolveClaudeMode(body.claudeMode),
      claudeModel: process.env.CLAUDE_MODEL || "claude-sonnet-5",
      templateVariant: body.templateVariant,
      pages,
      recommendedMaxPages,
      forcedTrim: false,
      createdAt: new Date().toISOString(),
      coverLetter: body.coverLetter.enabled ? body.coverLetter.format : "none",
    };
    await writeApplicationOutputs(dir, { jobDescription: body.jobDescription, metadata });

    return NextResponse.json({
      slug,
      pages,
      recommendedMaxPages,
      experienceYears,
      jobAnalysis,
      pdfUrl: `/api/apps/${slug}/cv.pdf`,
      coverLetterUrl,
      coverLetterText,
    });
  } catch (err) {
    if (
      err instanceof ClaudeConnectorError ||
      err instanceof LatexCompileError ||
      err instanceof PageCountError ||
      err instanceof ProfileIOError
    ) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "Error inesperado generando el CV." },
      { status: 500 },
    );
  }
}
