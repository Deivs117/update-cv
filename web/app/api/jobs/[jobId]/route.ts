import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";

/**
 * Estado de un job en segundo plano (análisis / generación / regeneración --
 * ver web/lib/jobs.ts). El cliente hace polling aquí en vez de mantener una
 * petición HTTP abierta mientras espera al modo Agente.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
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
