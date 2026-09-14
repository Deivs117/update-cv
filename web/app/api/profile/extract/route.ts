import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getConnector, type ClaudeMode } from "@/lib/claude/get-connector";
import { ClaudeConnectorError } from "@/lib/claude/connector.interface";
import { ProfileIOError } from "@/lib/profile-io";
import { getStorageAdapter } from "@/lib/storage/get-storage-adapter";

/**
 * Dispara el Módulo 1 (extracción) sobre lo que haya en data/raw/ y guarda el
 * resultado en data/profile.draft.json para revisión humana.
 *
 * Body opcional: { "mode": "api" | "agent" } para forzar un modo puntual
 * (sección 8.2); si se omite, usa el default de CLAUDE_MODE en .env.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  let mode: ClaudeMode | undefined;
  try {
    const body = await request.json();
    if (body?.mode === "api" || body?.mode === "agent") mode = body.mode;
  } catch {
    // Sin body o no-JSON: usar el modo default de CLAUDE_MODE.
  }

  try {
    const adapter = getStorageAdapter(session.userId);
    const { pdfPath, imagePaths } = await adapter.findProfileSeedFiles();
    const connector = getConnector(mode);
    const draft = await connector.extractProfile({ pdfPath, imagePaths });
    await adapter.saveProfileDraft(draft);
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof ClaudeConnectorError || err instanceof ProfileIOError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "Error inesperado durante la extracción del perfil." },
      { status: 500 },
    );
  }
}
