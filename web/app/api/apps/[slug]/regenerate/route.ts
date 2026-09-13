import { NextResponse } from "next/server";
import type { ClaudeMode } from "@/lib/claude/get-connector";
import { generateApplication, mapGenerationError } from "@/lib/generation-pipeline";
import { startJob } from "@/lib/jobs";
import { getStorageAdapter } from "@/lib/storage/get-storage-adapter";

/**
 * Regenera una aplicación existente (Fase 7): re-corre todo el pipeline
 * (análisis + selección/reescritura + render + compile) con el perfil
 * ACTUAL, reusando la misma carpeta apps/{slug}/ en vez de crear una nueva
 * con la fecha de hoy -- útil después de editar tu perfil.
 *
 * No bloqueante (ver web/lib/jobs.ts): responde con { jobId } de inmediato,
 * el cliente hace polling a GET /api/jobs/[jobId].
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const record = await getStorageAdapter().getApplication(slug);
  if (!record) {
    return NextResponse.json(
      { error: `No se encontró la aplicación "${slug}".` },
      { status: 404 },
    );
  }
  const { metadata, jobDescription } = record;

  let claudeMode: ClaudeMode | undefined;
  try {
    const body = await request.json();
    if (body?.claudeMode === "api" || body?.claudeMode === "agent") claudeMode = body.claudeMode;
  } catch {
    // Sin body: usa el mismo modo que quedó guardado en metadata.json.
    claudeMode = metadata.claudeMode;
  }

  const jobId = startJob(
    (setStage) =>
      generateApplication({
        jobDescription,
        company: metadata.company,
        role: metadata.role,
        language: metadata.language,
        templateVariant: metadata.templateVariant,
        coverLetter: {
          enabled: metadata.coverLetter !== "none",
          format: metadata.coverLetter === "text" ? "text" : "pdf",
        },
        claudeMode,
        reuseSlug: slug,
        onProgress: setStage,
      }),
    mapGenerationError,
  );

  return NextResponse.json({ jobId }, { status: 202 });
}
