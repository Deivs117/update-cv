import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession } from "@/lib/auth/require-session";

/**
 * Mismo criterio que lib/usage-quota.test.ts (#65): el I/O real contra
 * Supabase se mockea, nunca se llama al proyecto real desde un test
 * automatizado. `createSupabaseServerClient` es la única superficie de
 * Supabase que toca este módulo.
 */
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockGetUser.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("requireSession", () => {
  it("modo local: no toca Supabase para nada y devuelve userId undefined", async () => {
    delete process.env.STORAGE_MODE;

    const session = await requireSession();

    expect(session).toEqual({ ok: true, userId: undefined });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("modo hosteado con sesión válida: devuelve el userId de la sesión", async () => {
    process.env.STORAGE_MODE = "hosted";
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });

    const session = await requireSession();

    expect(session).toEqual({ ok: true, userId: "user-123" });
  });

  it("modo hosteado sin sesión (usuario null): 401", async () => {
    process.env.STORAGE_MODE = "hosted";
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const session = await requireSession();

    expect(session.ok).toBe(false);
    if (!session.ok) {
      expect(session.response.status).toBe(401);
      const body = await session.response.json();
      expect(body.error).toBeTruthy();
    }
  });

  it("modo hosteado con error de Supabase al validar el token: 401", async () => {
    process.env.STORAGE_MODE = "hosted";
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("token inválido") });

    const session = await requireSession();

    expect(session.ok).toBe(false);
    if (!session.ok) {
      expect(session.response.status).toBe(401);
    }
  });

  it("STORAGE_MODE inválido: propaga el error de resolveStorageMode (StorageAdapterError)", async () => {
    process.env.STORAGE_MODE = "algo-raro";

    await expect(requireSession()).rejects.toThrow();
  });
});
