import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APPS_DIR, type ApplicationMetadata } from "@/lib/apps-io";
import type { ClaudeMode } from "@/lib/claude/get-connector";
import { generateApplication, mapGenerationError } from "@/lib/generation-pipeline";
import { startJob } from "@/lib/jobs";

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
  if (!slug || slug.includes("/") || slug.includes("..")) {
    return NextResponse.json({ error: "Slug inválido." }, { status: 400 });
  }

  const dir = path.join(APPS_DIR, slug);
  if (path.resolve(dir) !== path.join(path.resolve(APPS_DIR), slug)) {
    return NextResponse.json({ error: "Slug inválido." }, { status: 400 });
  }

  let metadata: ApplicationMetadata;
  let jobDescription: string;
  try {
    metadata = JSON.parse(await readFile(path.join(dir, "metadata.json"), "utf-8"));
    jobDescription = await readFile(path.join(dir, "job_description.txt"), "utf-8");
  } catch {
    return NextResponse.json(
      { error: `No se encontró la aplicación "${slug}" o le faltan archivos (metadata.json/job_description.txt).` },
      { status: 404 },
    );
  }

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
        reuseDir: { dir, slug },
        onProgress: setStage,
      }),
    mapGenerationError,
  );

  return NextResponse.json({ jobId }, { status: 202 });
}
