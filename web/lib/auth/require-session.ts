/**
 * Chequeo de sesión de Supabase para las rutas de API en modo hosteado (#17).
 * Contraparte de `getStorageAdapter(userId?)` (lib/storage/get-storage-adapter.ts,
 * #14): acá se resuelve DE DÓNDE sale ese `userId` -- nunca de un valor que
 * venga en el body/query de la request, siempre de la sesión real.
 *
 * En modo local no hay concepto de sesión -- `requireSession()` no toca
 * Supabase para nada y devuelve `{ ok: true, userId: undefined }`, que es
 * exactamente lo que `getStorageAdapter()` (sin argumento) espera hoy. Así
 * las rutas quedan con el mismo código en ambos modos: siempre
 * `getStorageAdapter(session.userId)`.
 *
 * En modo hosteado se usa `supabase.auth.getUser()` (no `getSession()`):
 * revalida el usuario contra el servidor de Supabase en cada llamada, que es
 * lo recomendado por Supabase para código de servidor -- `getSession()` solo
 * lee la cookie tal cual llegó, sin confirmar que el token siga siendo
 * válido.
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveStorageMode } from "@/lib/storage/get-storage-adapter";

const UNAUTHENTICATED_RESPONSE = () =>
  NextResponse.json(
    { error: "Necesitás iniciar sesión para usar esta funcionalidad." },
    { status: 401 },
  );

/**
 * Unión discriminada en vez de lanzar: cada ruta hace
 * `const session = await requireSession(); if (!session.ok) return session.response;`
 * y sigue con `session.userId` -- sin try/catch extra, mismo patrón corto en
 * las 10 rutas de app/api.
 */
export type SessionCheck = { ok: true; userId: string | undefined } | { ok: false; response: NextResponse };

export async function requireSession(): Promise<SessionCheck> {
  if (resolveStorageMode() === "local") {
    return { ok: true, userId: undefined };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, response: UNAUTHENTICATED_RESPONSE() };
  }

  return { ok: true, userId: user.id };
}
