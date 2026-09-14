import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageAdapterError } from "@/lib/storage/storage-adapter.interface";

/**
 * Mismo criterio que usage-quota.test.ts (#65): el I/O real contra Supabase
 * se testea con un mock del cliente de Drizzle, nunca contra el proyecto
 * real. `dbChain(value)` reproduce la forma "thenable" de cualquier cadena
 * de Drizzle (select().from().where().limit(), insert().values().returning(),
 * update().set().where(), etc.) sin tener que declarar un mock distinto por
 * cada combinación de métodos encadenados -- cada método de la cadena
 * devuelve la misma cadena, y `await` la resuelve al valor configurado.
 */
function dbChain(value: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit", "orderBy", "values", "set", "onConflictDoUpdate", "returning"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(value).then(resolve, reject);
  return chain;
}

const mockState: { select: unknown; insert: unknown; update: unknown } = {
  select: [],
  insert: [],
  update: undefined,
};

const mockSelect = vi.fn(() => dbChain(mockState.select));
const mockInsert = vi.fn(() => dbChain(mockState.insert));
const mockUpdate = vi.fn(() => dbChain(mockState.update));

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({ select: mockSelect, insert: mockInsert, update: mockUpdate }),
}));

const mockUploadGeneratedPdf = vi.fn().mockResolvedValue(undefined);
const mockGetSignedPdfUrl = vi.fn().mockResolvedValue("https://signed.example/cv.pdf");

vi.mock("@/lib/storage/supabase-storage", () => ({
  uploadGeneratedPdf: mockUploadGeneratedPdf,
  getSignedPdfUrl: mockGetSignedPdfUrl,
}));

const mockMkdtemp = vi.fn();
vi.mock("node:fs/promises", () => ({ mkdtemp: mockMkdtemp }));

const { SupabaseStorageAdapter } = await import("@/lib/storage/supabase-storage-adapter");

const VALID_PROFILE = {
  personal: { full_name: "Ada Lovelace", email: "ada@example.com" },
  summary: {},
  education: [],
  experience: [],
  meta: { schema_version: "1.0", last_updated: "2026-01-01T00:00:00.000Z" },
};

beforeEach(() => {
  mockState.select = [];
  mockState.insert = [];
  mockState.update = undefined;
  mockSelect.mockClear();
  mockInsert.mockClear();
  mockUpdate.mockClear();
  mockUploadGeneratedPdf.mockClear();
  mockGetSignedPdfUrl.mockClear();
  mockMkdtemp.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SupabaseStorageAdapter -- perfil", () => {
  it("getProfile: sin fila -> null", async () => {
    mockState.select = [];
    const adapter = new SupabaseStorageAdapter("user-1");
    expect(await adapter.getProfile()).toBeNull();
  });

  it("getProfile: fila con data={} (recién creada por el trigger de signup) -> null", async () => {
    mockState.select = [{ id: "user-1", data: {}, updatedAt: new Date() }];
    const adapter = new SupabaseStorageAdapter("user-1");
    expect(await adapter.getProfile()).toBeNull();
  });

  it("getProfile: fila con un perfil válido -> lo devuelve parseado", async () => {
    mockState.select = [{ id: "user-1", data: VALID_PROFILE, updatedAt: new Date() }];
    const adapter = new SupabaseStorageAdapter("user-1");
    const profile = await adapter.getProfile();
    expect(profile?.personal.full_name).toBe("Ada Lovelace");
  });

  it("getProfile: fila con datos que no cumplen el schema -> StorageAdapterError", async () => {
    mockState.select = [{ id: "user-1", data: { personal: { full_name: "sin email" } }, updatedAt: new Date() }];
    const adapter = new SupabaseStorageAdapter("user-1");
    await expect(adapter.getProfile()).rejects.toThrow(StorageAdapterError);
  });

  it("saveProfile: perfil válido -> hace upsert y devuelve el perfil parseado", async () => {
    const adapter = new SupabaseStorageAdapter("user-1");
    const saved = await adapter.saveProfile(VALID_PROFILE);
    expect(saved.personal.full_name).toBe("Ada Lovelace");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("saveProfile: perfil inválido -> StorageAdapterError, sin llegar a tocar la base", async () => {
    const adapter = new SupabaseStorageAdapter("user-1");
    await expect(adapter.saveProfile({ personal: { full_name: "" } } as never)).rejects.toThrow(
      StorageAdapterError,
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("getProfileDraft/saveProfileDraft/findProfileSeedFiles: no implementado en modo hosteado (#26)", async () => {
    const adapter = new SupabaseStorageAdapter("user-1");
    await expect(adapter.getProfileDraft()).rejects.toThrow(/#26/);
    await expect(adapter.saveProfileDraft()).rejects.toThrow(/#26/);
    await expect(adapter.findProfileSeedFiles()).rejects.toThrow(/#26/);
  });
});

describe("SupabaseStorageAdapter -- aplicaciones", () => {
  const ROW = {
    id: "app-1",
    userId: "user-1",
    company: "Acme",
    role: "Backend Engineer",
    language: "es",
    status: "done",
    jobDescription: "Buscamos...",
    tailoredContent: null,
    cvTex: "\\documentclass{article}",
    coverLetterTex: null,
    coverLetterText: null,
    cvPdfPath: "user-1/app-1/cv.pdf",
    coverLetterPdfPath: null,
    metadata: { claudeMode: "api", templateVariant: "visual", pages: 2, recommendedMaxPages: 2, forcedTrim: true, coverLetter: "none" },
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("listApplications: mapea cada fila a ApplicationSummary con slug=id", async () => {
    mockState.select = [ROW];
    const adapter = new SupabaseStorageAdapter("user-1");
    const list = await adapter.listApplications();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ slug: "app-1", company: "Acme", templateVariant: "visual", pages: 2 });
  });

  it("getApplication: fila inexistente -> null", async () => {
    mockState.select = [];
    const adapter = new SupabaseStorageAdapter("user-1");
    expect(await adapter.getApplication("app-1")).toBeNull();
  });

  it("getApplication: fila existente -> ApplicationRecord con defaults para metadata ausente", async () => {
    mockState.select = [{ ...ROW, metadata: null, coverLetterText: "Estimados..." }];
    const adapter = new SupabaseStorageAdapter("user-1");
    const record = await adapter.getApplication("app-1");
    expect(record?.cvTex).toBe(ROW.cvTex);
    expect(record?.coverLetterText).toBe("Estimados...");
    expect(record?.metadata.templateVariant).toBe("ats"); // default cuando metadata es null
    expect(record?.metadata.coverLetter).toBe("none");
  });

  it("createApplication: inserta con placeholders y devuelve el id como slug", async () => {
    mockState.insert = [{ id: "app-nuevo" }];
    const adapter = new SupabaseStorageAdapter("user-1");
    const { slug } = await adapter.createApplication("Acme", "Backend Engineer");
    expect(slug).toBe("app-nuevo");
  });

  it("saveApplication: patch vacío no toca la base", async () => {
    const adapter = new SupabaseStorageAdapter("user-1");
    await adapter.saveApplication("app-1", {});
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("saveApplication: escribe company/role/language a columnas reales y el resto a `metadata`", async () => {
    const adapter = new SupabaseStorageAdapter("user-1");
    await adapter.saveApplication("app-1", {
      jobDescription: "nueva descripción",
      metadata: { company: "Acme", role: "SRE", language: "en", pages: 3, createdAt: "2026-01-01T00:00:00Z" },
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("getApplicationDir: cachea el mismo directorio para el mismo slug dentro de la instancia", async () => {
    mockMkdtemp.mockResolvedValueOnce("/tmp/update-cv-abc123");
    const adapter = new SupabaseStorageAdapter("user-1");
    const first = await adapter.getApplicationDir("app-1");
    const second = await adapter.getApplicationDir("app-1");
    expect(first).toBe(second);
    expect(mockMkdtemp).toHaveBeenCalledTimes(1);
  });

  it("getApplicationPdf: fila inexistente -> null", async () => {
    mockState.select = [];
    const adapter = new SupabaseStorageAdapter("user-1");
    expect(await adapter.getApplicationPdf("app-1", "cv")).toBeNull();
  });

  it("getApplicationPdf: sin path guardado para ese archivo -> null", async () => {
    mockState.select = [{ cvPdfPath: null, coverLetterPdfPath: null }];
    const adapter = new SupabaseStorageAdapter("user-1");
    expect(await adapter.getApplicationPdf("app-1", "cv")).toBeNull();
  });

  it("getApplicationPdf: con path guardado -> devuelve un redirect con la URL firmada", async () => {
    mockState.select = [{ cvPdfPath: "user-1/app-1/cv.pdf", coverLetterPdfPath: null }];
    const adapter = new SupabaseStorageAdapter("user-1");
    const result = await adapter.getApplicationPdf("app-1", "cv");
    expect(result).toEqual({ kind: "redirect", url: "https://signed.example/cv.pdf" });
    expect(mockGetSignedPdfUrl).toHaveBeenCalledWith("user-1/app-1/cv.pdf");
  });

  it("saveApplicationPdf: sube al bucket con path namespaceado por userId y registra la columna", async () => {
    const adapter = new SupabaseStorageAdapter("user-1");
    await adapter.saveApplicationPdf("app-1", "cover_letter", Buffer.from("%PDF"));
    expect(mockUploadGeneratedPdf).toHaveBeenCalledWith("user-1/app-1/cover_letter.pdf", Buffer.from("%PDF"));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
