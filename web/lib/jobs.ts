/**
 * Cola de trabajos en memoria para que las rutas de generación (análisis,
 * generar, regenerar) dejen de bloquear la petición HTTP mientras esperan a
 * Claude (hasta 15 min en modo Agente, sección 7.3) -- la ruta encola el
 * trabajo, responde de inmediato con un jobId, y el cliente hace polling a
 * GET /api/jobs/[jobId] para ver el progreso ("stage") y el resultado final.
 *
 * Vive solo en memoria del proceso de `next dev`/`next start`: es intencional
 * para un sistema 100% local de un solo usuario (ver sección 3, supuestos de
 * diseño) -- si el servidor se reinicia, los jobs en curso se pierden y el
 * cliente lo verá como un job desaparecido (404), no como un error silencioso.
 */
import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobRecord<T = unknown> {
  id: string;
  status: JobStatus;
  /** Texto corto, legible por humanos, del paso actual (ej. "Adaptando tu contenido con Claude..."). */
  stage: string;
  result?: T;
  error?: string;
  errorStatus?: number;
  createdAt: number;
  updatedAt: number;
}

const JOB_RETENTION_MS = 30 * 60 * 1000; // 30 min tras terminar, luego se limpia solo.

const jobs = new Map<string, JobRecord>();

function touch(job: JobRecord) {
  job.updatedAt = Date.now();
}

function scheduleCleanup(id: string) {
  setTimeout(() => jobs.delete(id), JOB_RETENTION_MS).unref();
}

/** Error con status HTTP explícito, reutilizable por cualquier pipeline que corra dentro de un job. */
export class JobError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = "JobError";
  }
}

export function getJob(id: string): JobRecord | undefined {
  return jobs.get(id);
}

/**
 * Crea un job, lo corre en segundo plano (fire-and-forget) y devuelve su id
 * de inmediato -- la ruta que llama solo necesita responder con { jobId }.
 *
 * `run` recibe un `setStage` para reportar progreso incremental mientras
 * corre; su valor de retorno se guarda como `result` cuando termina.
 */
export function startJob<T>(
  run: (setStage: (stage: string) => void) => Promise<T>,
  toErrorMessage: (err: unknown) => { message: string; status: number },
): string {
  const id = randomUUID();
  const job: JobRecord<T> = {
    id,
    status: "queued",
    stage: "En cola...",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(id, job);

  const setStage = (stage: string) => {
    job.status = "running";
    job.stage = stage;
    touch(job);
  };

  // No se espera esta promesa -- por diseño corre en segundo plano.
  void (async () => {
    try {
      job.status = "running";
      touch(job);
      const result = await run(setStage);
      job.status = "done";
      job.result = result;
      job.stage = "Listo.";
      touch(job);
    } catch (err) {
      const { message, status } = toErrorMessage(err);
      job.status = "error";
      job.error = message;
      job.errorStatus = status;
      touch(job);
    } finally {
      scheduleCleanup(id);
    }
  })();

  return id;
}
