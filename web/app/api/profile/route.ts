import { NextResponse } from "next/server";
import { ProfileIOError } from "@/lib/profile-io";
import { getStorageAdapter } from "@/lib/storage/get-storage-adapter";
import { profileInputSchema } from "@/lib/validation/profile.zod";

export async function GET() {
  try {
    const profile = await getStorageAdapter().getProfile();
    return NextResponse.json({ profile });
  } catch (err) {
    const message =
      err instanceof ProfileIOError ? err.message : "Error inesperado leyendo el perfil.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
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
    const saved = await getStorageAdapter().saveProfile(parsed.data);
    return NextResponse.json({ profile: saved });
  } catch (err) {
    const message =
      err instanceof ProfileIOError ? err.message : "Error inesperado guardando el perfil.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
