import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getJob } from "@/lib/jobs";

/**
 * Estado de un job en segundo plano (análisis / generación / regeneración --
 * ver web/lib/jobs.ts). El cliente hace polling aquí en vez de mantener una
 * petición HTTP abierta mientras espera al modo Agente.
 *
 * No usa `getStorageAdapter` (la cola de jobs es en memoria, sin dueño por
 * fila) pero igual exige sesión en modo hosteado (#17): ninguna ruta de
 * /api/* debe atender sin sesión válida, tenga o no relación directa con el
 * StorageAdapter.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json(
      { error: "Este job ya no existe (expiró o el servidor se reinició)." },
      { status: 404 },
    );
  }

  if (job.status === "error") {
    return NextResponse.json(
      { status: job.status, stage: job.stage, error: job.error },
      { status: 200 },
    );
  }

  return NextResponse.json({ status: job.status, stage: job.stage, result: job.result });
}
