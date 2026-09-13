import { describe, expect, it, vi } from "vitest";
import { getJob, JobError, startJob } from "@/lib/jobs";

/** Promesa controlada a mano, para inspeccionar el estado del job mientras `run` sigue corriendo. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const toErrorMessage = (err: unknown) =>
  err instanceof JobError ? { message: err.message, status: err.status } : { message: "error inesperado", status: 500 };

describe("startJob/getJob", () => {
  it("getJob de un id inexistente devuelve undefined", () => {
    expect(getJob("no-existe")).toBeUndefined();
  });

  it("startJob corre en segundo plano: el job pasa por running y termina en done con el resultado", async () => {
    const { promise, resolve } = deferred<{ ok: true }>();
    const id = startJob(async (setStage) => {
      setStage("Procesando...");
      return promise;
    }, toErrorMessage);

    // El job ya quedó en "running" con el stage reportado, sin esperar a
    // que `run` termine -- startJob es fire-and-forget por diseño.
    await vi.waitFor(() => {
      if (getJob(id)?.stage !== "Procesando...") throw new Error("todavía no llegó a running");
    });
    expect(getJob(id)?.status).toBe("running");

    resolve({ ok: true });

    await vi.waitFor(() => {
      if (getJob(id)?.status !== "done") throw new Error("todavía no terminó");
    });
    const job = getJob(id);
    expect(job?.result).toEqual({ ok: true });
    expect(job?.stage).toBe("Listo.");
  });

  it("si `run` lanza, el job termina en error con el mensaje/status de toErrorMessage", async () => {
    const id = startJob(async () => {
      throw new JobError("La vacante no tiene descripción.", 400);
    }, toErrorMessage);

    await vi.waitFor(() => {
      if (getJob(id)?.status !== "error") throw new Error("todavía no falló");
    });
    const job = getJob(id);
    expect(job?.error).toBe("La vacante no tiene descripción.");
    expect(job?.errorStatus).toBe(400);
  });

  it("un error que no es JobError cae en el mensaje genérico de toErrorMessage", async () => {
    const id = startJob(async () => {
      throw new Error("boom");
    }, toErrorMessage);

    await vi.waitFor(() => {
      if (getJob(id)?.status !== "error") throw new Error("todavía no falló");
    });
    const job = getJob(id);
    expect(job?.error).toBe("error inesperado");
    expect(job?.errorStatus).toBe(500);
  });

  it("cada llamada a startJob genera un id distinto", () => {
    const idA = startJob(async () => "a", toErrorMessage);
    const idB = startJob(async () => "b", toErrorMessage);
    expect(idA).not.toBe(idB);
  });
});
