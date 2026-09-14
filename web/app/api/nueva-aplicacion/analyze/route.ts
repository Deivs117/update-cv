import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getConnector, resolveClaudeMode, type ClaudeMode } from "@/lib/claude/get-connector";
import { ClaudeConnectorError } from "@/lib/claude/connector.interface";
import { startJob } from "@/lib/jobs";
import { enqueueHostedJob } from "@/lib/jobs/hosted-jobs";
import { resolveStorageMode } from "@/lib/storage/get-storage-adapter";

/**
 * Sección 9.2 — Paso 1: análisis de la vacante (para mostrar en la UI antes
 * de generar). No bloqueante (ver web/lib/jobs.ts): responde de inmediato
 * con { jobId } y el cliente hace polling a GET /api/jobs/[jobId].
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }

  const jobDescription = (body as { jobDescription?: unknown })?.jobDescription;
  if (typeof jobDescription !== "string" || !jobDescription.trim()) {
    return NextResponse.json(
      { error: "Falta el texto de la vacante (jobDescription)." },
      { status: 400 },
    );
  }

  const rawMode = (body as { claudeMode?: unknown })?.claudeMode;
  const mode: ClaudeMode | undefined = rawMode === "api" || rawMode === "agent" ? rawMode : undefined;
  const modeLabel =
    resolveClaudeMode(mode) === "agent"
      ? " (modo Agente: si tienes `npm run agent:watch` corriendo se procesa solo; si no, pídele a Claude Code que procese las tareas pendientes)"
      : "";

  // En modo hosteado, un Vercel Function no sobrevive después de responder
  // -- el trabajo se publica a QStash (#15) en vez de correr en un closure
  // "fire and forget" como en modo local (ver web/lib/jobs.ts).
  const jobId =
    resolveStorageMode() === "hosted"
      ? await enqueueHostedJob(
          "/api/internal/jobs/analyze",
          { jobDescription, claudeMode: mode },
          session.userId!,
        )
      : startJob(
          async (setStage) => {
            setStage(`Analizando la vacante con Claude...${modeLabel}`);
            const connector = getConnector(mode);
            return connector.analyzeJob({ jobDescription });
          },
          (err) => {
            if (err instanceof ClaudeConnectorError) return { message: err.message, status: 502 };
            return { message: "Error inesperado analizando la vacante.", status: 500 };
          },
        );

  return NextResponse.json({ jobId }, { status: 202 });
}
