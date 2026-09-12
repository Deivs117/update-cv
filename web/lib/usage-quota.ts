/**
 * Cuotas de uso por cuenta en modo hosteado (issue #18). Solo aplica ahí --
 * en modo local no hay concepto de cuota (el usuario paga o usa su propia
 * key). El límite existe porque el modo hosteado usa una única key del
 * proveedor de modelo (dueño del servicio) para todos los usuarios.
 *
 * Pendiente (fuera del alcance de este ticket, depende de #17): conectar
 * checkAndIncrementUsage() en el punto real donde se llama a
 * analyzeJob/tailorCV/generateCoverLetter -- hoy no hay forma de saber qué
 * usuario está haciendo la request ahí, porque las rutas todavía no validan
 * sesión de Supabase (#17). La función ya queda lista y probada para
 * conectarse en cuanto exista esa identidad.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { usageCounters } from "@/lib/db/schema";

const DEFAULT_DAILY_LIMIT = 20;

function getDailyLimit(): number {
  const raw = process.env.HOSTED_DAILY_GENERATION_LIMIT;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function nextResetAt(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export class UsageQuotaExceededError extends Error {
  constructor(
    public readonly limit: number,
    public readonly resetAt: Date,
  ) {
    super(
      `Cuota diaria de ${limit} generaciones alcanzada. Se reinicia a las ${resetAt.toISOString()} (UTC).`,
    );
    this.name = "UsageQuotaExceededError";
  }
}

/**
 * Incrementa el contador del día para `userId` y lanza UsageQuotaExceededError
 * si ya alcanzó el límite -- NUNCA incrementa por encima del límite (si ya
 * está en el límite, ni siquiera suma antes de rechazar).
 */
export async function checkAndIncrementUsage(userId: string): Promise<{
  used: number;
  limit: number;
  resetAt: Date;
}> {
  const limit = getDailyLimit();
  const period = currentPeriod();
  const resetAt = nextResetAt();
  const db = getDb();

  // Upsert atómico: crea la fila en 1 si no existe, o suma 1 si el contador
  // actual sigue por debajo del límite -- el WHERE dentro del ON CONFLICT
  // hace que la fila NO se toque si ya llegó al límite (evita una carrera
  // entre el SELECT y el UPDATE de leer-luego-escribir por separado).
  const result = await db
    .insert(usageCounters)
    .values({ userId, period, count: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.period],
      set: { count: sql`${usageCounters.count} + 1`, updatedAt: new Date() },
      setWhere: sql`${usageCounters.count} < ${limit}`,
    })
    .returning({ count: usageCounters.count });

  // Si el conflicto existía y la condición del WHERE fue falsa (ya estaba en
  // el límite), Postgres no modifica la fila y RETURNING no devuelve nada --
  // NO es lo mismo que "used llegó a limit" (ese caso sí devuelve fila, con
  // used === limit, y se permite: es la última generación disponible).
  if (result.length === 0) {
    throw new UsageQuotaExceededError(limit, resetAt);
  }

  return { used: result[0].count, limit, resetAt };
}
