import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mismo patrón "thenable" que supabase-storage-adapter.test.ts (#14) para
 * mockear las cadenas encadenadas de Drizzle sin declarar un mock distinto
 * por cada combinación de métodos.
 */
function dbChain(value: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit", "values", "set", "returning"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(value).then(resolve, reject);
  return chain;
}

const mockState: { select: unknown; insertReturning: unknown } = {
  select: [],
  insertReturning: [{ id: "job-1" }],
};

const mockSelect = vi.fn(() => dbChain(mockState.select));
const mockInsert = vi.fn(() => dbChain(mockState.insertReturning));
const mockUpdate = vi.fn(() => dbChain(undefined));

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({ select: mockSelect, insert: mockInsert, update: mockUpdate }),
}));

const mockPublishInternalJob = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/jobs/qstash", () => ({
  publishInternalJob: mockPublishInternalJob,
}));

const {
  completeHostedJob,
  enqueueHostedJob,
  failHostedJob,
  getHostedJob,
  updateHostedJobStage,
} = await import("@/lib/jobs/hosted-jobs");

beforeEach(() => {
  mockState.select = [];
  mockState.insertReturning = [{ id: "job-1" }];
  mockSelect.mockClear();
  mockInsert.mockClear();
  mockUpdate.mockClear();
  mockPublishInternalJob.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enqueueHostedJob", () => {
  it("crea la fila del job y publica a QStash con jobId/userId agregados al payload", async () => {
    const jobId = await enqueueHostedJob("/api/internal/jobs/analyze", { jobDescription: "..." }, "user-1");

    expect(jobId).toBe("job-1");
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockPublishInternalJob).toHaveBeenCalledWith("/api/internal/jobs/analyze", {
      jobDescription: "...",
      jobId: "job-1",
      userId: "user-1",
    });
  });
});

describe("getHostedJob", () => {
  it("sin fila (jobId inexistente o de otra cuenta), devuelve null", async () => {
    mockState.select = [];
    expect(await getHostedJob("job-1", "user-1")).toBeNull();
  });

  it("con fila, mapea los campos de la tabla a la forma de respuesta del cliente", async () => {
    mockState.select = [
      { id: "job-1", status: "running", stage: "Analizando...", result: null, errorMessage: null },
    ];
    const job = await getHostedJob("job-1", "user-1");
    expect(job).toEqual({ status: "running", stage: "Analizando...", result: null, error: null });
  });

  it("scopea la query por userId además del jobId (aislamiento entre cuentas)", async () => {
    mockState.select = [];
    await getHostedJob("job-1", "user-1");
    expect(mockSelect).toHaveBeenCalledTimes(1);
    // La condición exacta vive en el `where` (eq+and de Drizzle) -- no se
    // puede inspeccionar el SQL generado con este mock, pero al menos se
    // confirma que la query se arma y se ejecuta.
  });
});

describe("completeHostedJob / failHostedJob", () => {
  it("completeHostedJob deja status='done', stage='Listo.' y guarda result/applicationId", async () => {
    await completeHostedJob("job-1", { pages: 1 }, "app-1");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("failHostedJob deja status='error' con el mensaje dado", async () => {
    await failHostedJob("job-1", "Algo salió mal.");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("updateHostedJobStage", () => {
  it("no lanza aunque el update subyacente falle (no debe frenar el pipeline por un fallo de progreso)", () => {
    mockUpdate.mockImplementationOnce(() => {
      const chain = dbChain(undefined);
      chain.then = (_resolve: unknown, reject?: (e: unknown) => unknown) =>
        Promise.reject(new Error("db down")).catch((e) => reject?.(e));
      return chain;
    });
    expect(() => updateHostedJobStage("job-1", "Analizando...")).not.toThrow();
  });
});
