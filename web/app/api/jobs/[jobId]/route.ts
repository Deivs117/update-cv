import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getJob } from "@/lib/jobs";
import { getHostedJob } from "@/lib/jobs/hosted-jobs";
import { resolveStorageMode } from "@/lib/storage/get-storage-adapter";

/**
 * Estado de un job en segundo plano (análisis / generación / regeneración).
 * El cliente hace polling aquí en vez de mantener una petición HTTP abierta
 * mientras espera al modo Agente (local, web/lib/jobs.ts) o a QStash
 * (hosteado, web/lib/jobs/hosted-jobs.ts -- #15).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const { jobId } = await params;

  // En modo hosteado, `getHostedJob` ya scopea por userId (#14/#17): un
  // jobId de otra cuenta se ve exactamente igual a uno inexistente, nunca
  // se distingue.
  const job =
    resolveStorageMode() === "hosted" ? await getHostedJob(jobId, session.userId!) : getJob(jobId);

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
