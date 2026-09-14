import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import type { ClaudeMode } from "@/lib/claude/get-connector";
import type { JobAnalysis, Language } from "@/lib/claude/connector.interface";
import {
  generateApplication,
  mapGenerationError,
  type CoverLetterOptions,
  type TemplateVariant,
} from "@/lib/generation-pipeline";
import { startJob } from "@/lib/jobs";
import { enqueueHostedJob } from "@/lib/jobs/hosted-jobs";
import { resolveStorageMode } from "@/lib/storage/get-storage-adapter";

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

/**
 * No bloqueante (ver web/lib/jobs.ts): responde de inmediato con { jobId } y
 * el cliente hace polling a GET /api/jobs/[jobId] para ver el progreso
 * (análisis → adaptación → LaTeX → compilación → carta opcional) y el
 * resultado final, sin mantener la conexión HTTP abierta hasta 15 min en
 * modo Agente.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session.ok) return session.response;

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

  // En modo hosteado, un Vercel Function no sobrevive después de responder
  // -- el trabajo se publica a QStash (#15) en vez de correr en un closure
  // "fire and forget" como en modo local (ver web/lib/jobs.ts).
  const jobId =
    resolveStorageMode() === "hosted"
      ? await enqueueHostedJob("/api/internal/jobs/generate", { ...body }, session.userId!)
      : startJob(
          (setStage) => generateApplication({ ...body, userId: session.userId, onProgress: setStage }),
          mapGenerationError,
        );

  return NextResponse.json({ jobId }, { status: 202 });
}
