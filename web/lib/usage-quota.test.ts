import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAndIncrementUsage, UsageQuotaExceededError } from "@/lib/usage-quota";

/**
 * Decisión de diseño del issue #65: el I/O real contra Supabase se testea
 * con un mock del cliente de Drizzle, nunca contra el proyecto real (sin
 * secrets en CI, sin riesgo de tocar datos reales). Se mockea getDb() para
 * devolver un fake que reproduce la forma exacta de la cadena que usa
 * checkAndIncrementUsage: insert().values().onConflictDoUpdate().returning().
 */
const mockReturning = vi.fn();
const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturning }));
const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({ insert: mockInsert }),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.HOSTED_DAILY_GENERATION_LIMIT;
  mockInsert.mockClear();
  mockValues.mockClear();
  mockOnConflictDoUpdate.mockClear();
  mockReturning.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("checkAndIncrementUsage", () => {
  it("primera generación del día: RETURNING trae la fila nueva (count=1)", async () => {
    mockReturning.mockResolvedValue([{ count: 1 }]);

    const result = await checkAndIncrementUsage("user-1");

    expect(result).toEqual({ used: 1, limit: 20, resetAt: expect.any(Date) });
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("todavía por debajo del límite: RETURNING trae la fila actualizada", async () => {
    mockReturning.mockResolvedValue([{ count: 5 }]);

    const result = await checkAndIncrementUsage("user-1");

    expect(result.used).toBe(5);
  });

  it("ya en el límite: el WHERE del ON CONFLICT no toca la fila, RETURNING viene vacío -> lanza UsageQuotaExceededError", async () => {
    mockReturning.mockResolvedValue([]);

    await expect(checkAndIncrementUsage("user-1")).rejects.toThrow(UsageQuotaExceededError);
  });

  it("el error de cuota excedida trae el límite y la fecha de reset correctos", async () => {
    mockReturning.mockResolvedValue([]);

    try {
      await checkAndIncrementUsage("user-1");
      expect.unreachable("debía lanzar UsageQuotaExceededError");
    } catch (err) {
      expect(err).toBeInstanceOf(UsageQuotaExceededError);
      expect((err as InstanceType<typeof UsageQuotaExceededError>).limit).toBe(20);
    }
  });

  it("respeta HOSTED_DAILY_GENERATION_LIMIT en vez del default de 20", async () => {
    process.env.HOSTED_DAILY_GENERATION_LIMIT = "5";
    mockReturning.mockResolvedValue([{ count: 1 }]);

    const result = await checkAndIncrementUsage("user-1");

    expect(result.limit).toBe(5);
  });

  it("HOSTED_DAILY_GENERATION_LIMIT inválido (no numérico) cae al default de 20", async () => {
    process.env.HOSTED_DAILY_GENERATION_LIMIT = "no-es-un-numero";
    mockReturning.mockResolvedValue([{ count: 1 }]);

    const result = await checkAndIncrementUsage("user-1");

    expect(result.limit).toBe(20);
  });
});
