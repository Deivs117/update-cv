/**
 * Fábrica del adaptador de almacenamiento activo (#13), análoga a
 * `getConnector`/`resolveClaudeMode` (lib/claude/get-connector.ts):
 * `STORAGE_MODE` en .env decide qué implementación de `StorageAdapter` usa
 * el resto del sistema -- ninguna ruta de API debe elegir esto por su cuenta
 * ni importar `fs`/rutas de archivo directo.
 */
import { FilesystemStorageAdapter } from "@/lib/storage/filesystem-storage-adapter";
import { StorageAdapterError, type StorageAdapter } from "@/lib/storage/storage-adapter.interface";

export type StorageMode = "local" | "hosted";

export function resolveStorageMode(): StorageMode {
  const raw = process.env.STORAGE_MODE?.trim().toLowerCase();
  if (raw === "hosted") return "hosted";
  if (raw && raw !== "local") {
    throw new StorageAdapterError(`STORAGE_MODE="${raw}" no es válido. Usa "local" u "hosted".`);
  }
  return "local"; // default: instalaciones existentes de antes de que este modo existiera.
}

let cachedAdapter: StorageAdapter | undefined;

/**
 * `SupabaseStorageAdapter` (#14) todavía no existe -- este selector ya deja
 * el punto de entrada listo para cuando se implemente, sin bloquear el modo
 * local mientras tanto.
 */
export function getStorageAdapter(): StorageAdapter {
  if (cachedAdapter) return cachedAdapter;

  const mode = resolveStorageMode();
  if (mode === "hosted") {
    throw new StorageAdapterError(
      "STORAGE_MODE=hosted todavía no tiene adaptador implementado (issue #14, StorageAdapter contra Supabase). " +
        "Usa STORAGE_MODE=local (o déjalo sin configurar) mientras tanto.",
    );
  }

  cachedAdapter = new FilesystemStorageAdapter();
  return cachedAdapter;
}
