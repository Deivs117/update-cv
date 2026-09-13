import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { FilesystemStorageAdapter } from "@/lib/storage/filesystem-storage-adapter";
import { getStorageAdapter, resolveStorageMode } from "@/lib/storage/get-storage-adapter";
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
  // Un solo test para toda la secuencia: getStorageAdapter() cachea el
  // adaptador en una variable de módulo, así que el orden importa --
  // STORAGE_MODE=hosted debe probarse primero, antes de que cualquier
  // llamada exitosa en modo local deje cacheada la instancia para el resto
  // del proceso.
  it("hosted lanza (sin adaptador todavía, #14) y no cachea nada; local sí devuelve y cachea FilesystemStorageAdapter", () => {
    process.env.STORAGE_MODE = "hosted";
    expect(() => getStorageAdapter()).toThrow(StorageAdapterError);
    expect(() => getStorageAdapter()).toThrow(/#14/);

    process.env.STORAGE_MODE = "local";
    const first = getStorageAdapter();
    expect(first).toBeInstanceOf(FilesystemStorageAdapter);

    // Segunda llamada (incluso sin STORAGE_MODE) devuelve la MISMA
    // instancia cacheada, no una nueva.
    delete process.env.STORAGE_MODE;
    const second = getStorageAdapter();
    expect(second).toBe(first);
  });
});
