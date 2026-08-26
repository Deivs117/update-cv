/**
 * Cliente de polling para los jobs en segundo plano de web/lib/jobs.ts
 * (análisis / generación / regeneración) -- usado por las páginas de
 * /nueva-aplicacion y /aplicaciones/[slug] para no mantener una petición
 * HTTP abierta mientras esperan a Claude (hasta 15 min en modo Agente).
 */
const POLL_INTERVAL_MS = 1500;

export class JobPollError extends Error {}

/**
 * Hace polling de GET /api/jobs/[jobId] hasta que el job termina (done) o
 * falla (error), reportando cada cambio de "stage" vía onStage.
 */
export async function pollJob<T>(jobId: string, onStage?: (stage: string) => void): Promise<T> {
  let lastStage: string | undefined;
  for (;;) {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new JobPollError(json?.error ?? `No se pudo consultar el estado del job (HTTP ${res.status}).`);
    }
    const json: { status: "queued" | "running" | "done" | "error"; stage: string; result?: T; error?: string } =
      await res.json();

    if (json.stage !== lastStage) {
      lastStage = json.stage;
      onStage?.(json.stage);
    }

    if (json.status === "done") return json.result as T;
    if (json.status === "error") throw new JobPollError(json.error ?? "Falló el job.");

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
