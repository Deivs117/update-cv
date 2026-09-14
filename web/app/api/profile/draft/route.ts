import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { ProfileIOError } from "@/lib/profile-io";
import { getStorageAdapter } from "@/lib/storage/get-storage-adapter";

/** Devuelve el último borrador de extracción, si existe (para retomar tras recargar la página). */
export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  try {
    const draft = await getStorageAdapter(session.userId).getProfileDraft();
    return NextResponse.json({ draft });
  } catch (err) {
    const message =
      err instanceof ProfileIOError ? err.message : "Error inesperado leyendo el borrador.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
