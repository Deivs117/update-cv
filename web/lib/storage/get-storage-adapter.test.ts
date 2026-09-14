import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { FilesystemStorageAdapter } from "@/lib/storage/filesystem-storage-adapter";
import { getStorageAdapter, resolveStorageMode } from "@/lib/storage/get-storage-adapter";
import { SupabaseStorageAdapter } from "@/lib/storage/supabase-storage-adapter";
import { StorageAdapterError } from "@/lib/storage/storage-adapter.interface";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.STORAGE_MODE;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveStorageMode", () => {
  it("sin STORAGE_MODE configurado, default 'local' (compatibilidad con instalaciones existentes)", () => {
    expect(resolveStorageMode()).toBe("local");
  });

  it("STORAGE_MODE=local explícito", () => {
    process.env.STORAGE_MODE = "local";
    expect(resolveStorageMode()).toBe("local");
  });

  it("STORAGE_MODE=hosted", () => {
    process.env.STORAGE_MODE = "hosted";
    expect(resolveStorageMode()).toBe("hosted");
  });

  it("valor desconocido lanza StorageAdapterError", () => {
    process.env.STORAGE_MODE = "cloud";
    expect(() => resolveStorageMode()).toThrow(StorageAdapterError);
  });
});

describe("getStorageAdapter", () => {
  it("modo hosteado sin userId lanza StorageAdapterError (nunca un adaptador sin dueño)", () => {
    process.env.STORAGE_MODE = "hosted";
    expect(() => getStorageAdapter()).toThrow(StorageAdapterError);
    expect(() => getStorageAdapter()).toThrow(/userId/);
  });

  it("modo hosteado con userId devuelve una instancia nueva de SupabaseStorageAdapter cada vez (nunca cacheada)", () => {
    process.env.STORAGE_MODE = "hosted";
    const first = getStorageAdapter("user-1");
    const second = getStorageAdapter("user-1");
    expect(first).toBeInstanceOf(SupabaseStorageAdapter);
    expect(second).toBeInstanceOf(SupabaseStorageAdapter);
    expect(second).not.toBe(first); // distinto usuario en teoría, o el mismo -- nunca se cachea.
  });

  // Un solo test para toda la secuencia en modo local: getStorageAdapter()
  // cachea el FilesystemStorageAdapter en una variable de módulo, así que
  // el orden importa dentro de este bloque.
  it("modo local devuelve y cachea un único FilesystemStorageAdapter, ignorando userId", () => {
    process.env.STORAGE_MODE = "local";
    const first = getStorageAdapter();
    expect(first).toBeInstanceOf(FilesystemStorageAdapter);

    // Segunda llamada (incluso sin STORAGE_MODE, incluso con un userId)
    // devuelve la MISMA instancia cacheada, no una nueva.
    delete process.env.STORAGE_MODE;
    const second = getStorageAdapter("algún-user-id-ignorado");
    expect(second).toBe(first);
  });
});
