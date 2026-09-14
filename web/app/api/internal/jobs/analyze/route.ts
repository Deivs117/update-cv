import { NextResponse } from "next/server";
import { getConnector, type ClaudeMode } from "@/lib/claude/get-connector";
import { ClaudeConnectorError } from "@/lib/claude/connector.interface";
import { completeHostedJob, failHostedJob, updateHostedJobStage } from "@/lib/jobs/hosted-jobs";
import { verifyQstashRequest } from "@/lib/jobs/qstash";

/**
 * Invocada por QStash (#15), nunca directo por el cliente -- ver
 * lib/jobs/qstash.ts para la verificación de firma obligatoria. Espejo
 * hosteado de la lógica que hoy corre en el closure de
 * `startJob` dentro de app/api/nueva-aplicacion/analyze/route.ts (modo
 * local, sin cambios).
 */
export async function POST(request: Request) {
  const verified = await verifyQstashRequest(request);
  if (!verified.ok) {
    return NextResponse.json({ error: "Firma de QStash inválida o ausente." }, { status: 401 });
  }

  const body = verified.body as {
    jobId?: unknown;
    jobDescription?: unknown;
    claudeMode?: unknown;
  };
  const jobId = body.jobId;
  const jobDescription = body.jobDescription;
  if (typeof jobId !== "string" || typeof jobDescription !== "string") {
    // Nunca debería pasar (el payload lo arma enqueueHostedJob acá mismo) --
    // si pasa, no hay jobId al que reportarle el error.
    return NextResponse.json({ error: "Payload de job inválido." }, { status: 400 });
  }
  const claudeMode: ClaudeMode | undefined =
    body.claudeMode === "api" || body.claudeMode === "agent" ? body.claudeMode : undefined;

  try {
    updateHostedJobStage(jobId, "Analizando la vacante con Claude...");
    const connector = getConnector(claudeMode);
    const result = await connector.analyzeJob({ jobDescription });
    await completeHostedJob(jobId, result);
  } catch (err) {
    const message =
      err instanceof ClaudeConnectorError ? err.message : "Error inesperado analizando la vacante.";
    await failHostedJob(jobId, message);
  }

  // 200 siempre que se pudo procesar el mensaje (haya terminado en éxito o
  // en error DENTRO del job) -- un 4xx/5xx acá le diría a QStash que
  // reintente, duplicando el análisis/costo. El estado real del job vive en
  // la fila, no en el status code de esta respuesta.
  return NextResponse.json({ ok: true });
}
