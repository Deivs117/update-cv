import { NextResponse } from "next/server";
import type { ClaudeMode } from "@/lib/claude/get-connector";
import type { JobAnalysis, Language } from "@/lib/claude/connector.interface";
import {
  generateApplication,
  mapGenerationError,
  type CoverLetterOptions,
  type TemplateVariant,
} from "@/lib/generation-pipeline";
import { completeHostedJob, failHostedJob, updateHostedJobStage } from "@/lib/jobs/hosted-jobs";
import { verifyQstashRequest } from "@/lib/jobs/qstash";

interface GenerateJobPayload {
  jobId: string;
  userId: string;
  jobDescription: string;
  company: string;
  role: string;
  language: Language;
  templateVariant: TemplateVariant;
  jobAnalysis?: JobAnalysis;
  coverLetter: CoverLetterOptions;
  claudeMode?: ClaudeMode;
  /** Presente solo cuando el mensaje viene de POST /api/apps/[slug]/regenerate. */
  reuseSlug?: string;
}

function parsePayload(body: unknown): GenerateJobPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (
    typeof b.jobId !== "string" ||
    typeof b.userId !== "string" ||
    typeof b.jobDescription !== "string" ||
    typeof b.company !== "string" ||
    typeof b.role !== "string" ||
    (b.language !== "es" && b.language !== "en") ||
    (b.templateVariant !== "ats" && b.templateVariant !== "visual")
  ) {
    return null;
  }
  const rawCoverLetter = (b.coverLetter as Record<string, unknown> | undefined) ?? {};
  return {
    jobId: b.jobId,
    userId: b.userId,
    jobDescription: b.jobDescription,
    company: b.company,
    role: b.role,
    language: b.language,
    templateVariant: b.templateVariant,
    jobAnalysis: b.jobAnalysis as JobAnalysis | undefined,
    coverLetter: {
      enabled: rawCoverLetter.enabled === true,
      format: rawCoverLetter.format === "text" ? "text" : "pdf",
    },
    claudeMode: b.claudeMode === "api" || b.claudeMode === "agent" ? b.claudeMode : undefined,
    reuseSlug: typeof b.reuseSlug === "string" ? b.reuseSlug : undefined,
  };
}

/**
 * Invocada por QStash (#15), nunca directo por el cliente -- ver
 * lib/jobs/qstash.ts. Espejo hosteado del closure de `startJob` en
 * app/api/nueva-aplicacion/generate/route.ts y app/api/apps/[slug]/
 * regenerate/route.ts (modo local, sin cambios) -- ambos publican acá,
 * `reuseSlug` distingue generar de regenerar, igual que ya hacía
 * generateApplication() antes de este ticket.
 */
export async function POST(request: Request) {
  const verified = await verifyQstashRequest(request);
  if (!verified.ok) {
    return NextResponse.json({ error: "Firma de QStash inválida o ausente." }, { status: 401 });
  }

  const payload = parsePayload(verified.body);
  if (!payload) {
    return NextResponse.json({ error: "Payload de job inválido." }, { status: 400 });
  }

  try {
    const result = await generateApplication({
      jobDescription: payload.jobDescription,
      company: payload.company,
      role: payload.role,
      language: payload.language,
      templateVariant: payload.templateVariant,
      jobAnalysis: payload.jobAnalysis,
      coverLetter: payload.coverLetter,
      claudeMode: payload.claudeMode,
      reuseSlug: payload.reuseSlug,
      userId: payload.userId,
      onProgress: (stage) => updateHostedJobStage(payload.jobId, stage),
    });
    await completeHostedJob(payload.jobId, result, result.slug);
  } catch (err) {
    const { message } = mapGenerationError(err);
    await failHostedJob(payload.jobId, message);
  }

  // Mismo criterio que el endpoint de análisis: 200 siempre que se pudo
  // procesar el mensaje, el estado real vive en la fila del job.
  return NextResponse.json({ ok: true });
}
