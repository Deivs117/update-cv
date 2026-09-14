/**
 * Compartido entre scripts one-off de migración/backfill de datos locales a
 * Supabase (#12, #92): deriva un id determinístico (formato UUID) de un
 * seed -- reintentar cualquiera de estos scripts nunca duplica filas, ni
 * hace falta guardar un mapeo slug->id en ningún lado.
 */
import { createHash } from "node:crypto";

export function deriveId(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
