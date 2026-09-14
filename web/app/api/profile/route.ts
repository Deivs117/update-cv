import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { ProfileIOError } from "@/lib/profile-io";
import { getStorageAdapter } from "@/lib/storage/get-storage-adapter";
import { profileInputSchema } from "@/lib/validation/profile.zod";

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  try {
    const profile = await getStorageAdapter(session.userId).getProfile();
    return NextResponse.json({ profile });
  } catch (err) {
    const message =
      err instanceof ProfileIOError ? err.message : "Error inesperado leyendo el perfil.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la petición no es JSON válido." },
      { status: 400 },
    );
  }

  const parsed = profileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "El perfil enviado no cumple el formato esperado.",
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const saved = await getStorageAdapter(session.userId).saveProfile(parsed.data);
    return NextResponse.json({ profile: saved });
  } catch (err) {
    const message =
      err instanceof ProfileIOError ? err.message : "Error inesperado guardando el perfil.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
