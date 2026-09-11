/**
 * Cliente de Drizzle contra Postgres (Supabase), usado solo en modo hosteado
 * (STORAGE_MODE=hosted, ver #13/#14). No se instancia en modo local -- nada
 * de esto se importa desde el FilesystemStorageAdapter.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta DATABASE_URL. Requerida en modo hosteado (STORAGE_MODE=hosted) -- " +
        "ver la sección de gestión de secretos en CLAUDE.md para cómo obtenerla " +
        "sin copiarla a mano del dashboard.",
    );
  }
  return url;
}

/** Reusa la conexión entre invocaciones del mismo proceso (evita abrir un pool por request). */
export function getDb() {
  if (!cachedDb) {
    const client = postgres(getDatabaseUrl(), { prepare: false });
    cachedDb = drizzle(client, { schema });
  }
  return cachedDb;
}
