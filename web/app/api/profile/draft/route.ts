import { NextResponse } from "next/server";
import { ProfileIOError } from "@/lib/profile-io";
import { getStorageAdapter } from "@/lib/storage/get-storage-adapter";

/** Devuelve el último borrador de extracción, si existe (para retomar tras recargar la página). */
export async function GET() {
  try {
    const draft = await getStorageAdapter().getProfileDraft();
    return NextResponse.json({ draft });
  } catch (err) {
    const message =
      err instanceof ProfileIOError ? err.message : "Error inesperado leyendo el borrador.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
