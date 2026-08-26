import { NextResponse } from "next/server";
import type { ClaudeMode } from "@/lib/claude/get-connector";
import { ClaudeConnectorError, type JobAnalysis, type Language } from "@/lib/claude/connector.interface";
import { ProfileIOError } from "@/lib/profile-io";
import { LatexCompileError } from "@/lib/latex/compile";
import { PageCountError } from "@/lib/latex/page-count";
import {
  ApplicationGenerationError,
  generateApplication,
  type CoverLetterOptions,
  type TemplateVariant,
} from "@/lib/generation-pipeline";

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
    const result = await generateApplication(body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApplicationGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (
      err instanceof ClaudeConnectorError ||
      err instanceof LatexCompileError ||
      err instanceof PageCountError ||
      err instanceof ProfileIOError
    ) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Error inesperado generando el CV." }, { status: 500 });
  }
}
