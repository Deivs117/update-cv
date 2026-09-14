/**
 * Fábrica del adaptador de almacenamiento activo (#13/#14), análoga a
 * `getConnector`/`resolveClaudeMode` (lib/claude/get-connector.ts):
 * `STORAGE_MODE` en .env decide qué implementación de `StorageAdapter` usa
 * el resto del sistema -- ninguna ruta de API debe elegir esto por su cuenta
 * ni importar `fs`/rutas de archivo directo.
 */
import { FilesystemStorageAdapter } from "@/lib/storage/filesystem-storage-adapter";
import { SupabaseStorageAdapter } from "@/lib/storage/supabase-storage-adapter";
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
 * `userId` es opcional a propósito (#14): así ningún call-site existente en
 * modo local se rompe, y las rutas de `app/api/*` (#17, en paralelo) pueden
 * empezar a pasarlo sin esperar a que todas lo hagan a la vez.
 *
 * - Modo local: `userId` se ignora, comportamiento intacto -- sigue
 *   cacheando un singleton `FilesystemStorageAdapter` (no hay datos por
 *   usuario que aislar, es el filesystem local de una sola instalación).
 * - Modo hosteado: instancia NUEVA de `SupabaseStorageAdapter` en cada
 *   llamada, nunca cacheada -- los datos son por usuario, cachear una
 *   instancia (y por lo tanto un `userId`) sería un bug de seguridad real.
 *   Sin `userId`, lanza en vez de construir un adaptador sin dueño.
 */
export function getStorageAdapter(userId?: string): StorageAdapter {
  const mode = resolveStorageMode();

  if (mode === "hosted") {
    if (!userId) {
      throw new StorageAdapterError(
        "Falta userId en modo hosteado (STORAGE_MODE=hosted): getStorageAdapter(userId) requiere " +
          "un usuario autenticado, nunca se construye un SupabaseStorageAdapter sin dueño.",
      );
    }
    return new SupabaseStorageAdapter(userId);
  }

  if (cachedAdapter) return cachedAdapter;
  cachedAdapter = new FilesystemStorageAdapter();
  return cachedAdapter;
}
