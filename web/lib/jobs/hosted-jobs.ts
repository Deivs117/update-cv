/**
 * Contraparte hosteada de web/lib/jobs.ts (#15): en vez de una cola en
 * memoria, cada job es una fila en la tabla `jobs` (#8) -- el endpoint
 * interno que QStash invoca la actualiza a medida que avanza, y
 * GET /api/jobs/[jobId] la lee para el polling, igual forma de respuesta
 * que la cola en memoria ({ status, stage, result, error }).
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { publishInternalJob } from "@/lib/jobs/qstash";

export interface HostedJobView {
  status: string;
  stage: string | null;
  result: unknown;
  error: string | null;
}

async function createHostedJob(userId: string): Promise<string> {
  const [row] = await getDb()
    .insert(jobs)
    .values({ userId, status: "pending", stage: "En cola..." })
    .returning({ id: jobs.id });
  return row.id;
}

/** Encola un job (análisis o generación/regeneración) publicándolo a QStash. Devuelve el `jobId` para el polling. */
export async function enqueueHostedJob(
  internalPath: string,
  payload: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const jobId = await createHostedJob(userId);
  await publishInternalJob(internalPath, { ...payload, jobId, userId });
  return jobId;
}

/**
 * Progreso incremental (#15) -- se llama repetidas veces mientras el
 * endpoint interno sigue corriendo, nunca se espera su resultado (una
 * actualización de texto de progreso no debe frenar ni fallar el pipeline
 * si la escritura demora o falla puntualmente).
 */
export function updateHostedJobStage(jobId: string, stage: string): void {
  // Promise.resolve(...) envuelve el query builder de Drizzle (thenable,
  // pero no necesariamente con `.catch()` propio) en una Promise real para
  // poder atrapar el error sin bloquear el pipeline por un fallo puntual de
  // esta sola escritura de progreso.
  Promise.resolve(
    getDb().update(jobs).set({ stage, status: "running", updatedAt: new Date() }).where(eq(jobs.id, jobId)),
  ).catch(() => {
    // No-op a propósito: es solo texto de progreso, no bloquea el pipeline.
  });
}

export async function completeHostedJob(
  jobId: string,
  result: unknown,
  applicationId?: string,
): Promise<void> {
  await getDb()
    .update(jobs)
    .set({ status: "done", stage: "Listo.", result, applicationId, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

export async function failHostedJob(jobId: string, message: string): Promise<void> {
  await getDb()
    .update(jobs)
    .set({ status: "error", errorMessage: message, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

/** Scoped a `userId` -- nunca se devuelve el job de otra cuenta, ni siquiera un 404 genérico lo distingue (mismo criterio de seguridad que el resto del StorageAdapter). */
export async function getHostedJob(jobId: string, userId: string): Promise<HostedJobView | null> {
  const [row] = await getDb()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1);
  if (!row) return null;
  return { status: row.status, stage: row.stage, result: row.result, error: row.errorMessage };
}
