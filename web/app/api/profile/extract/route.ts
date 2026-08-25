import { NextResponse } from "next/server";
import { ApiConnector } from "@/lib/claude/api-connector";
import { ClaudeConnectorError } from "@/lib/claude/connector.interface";
import { findSeedFiles, ProfileIOError, writeDraft } from "@/lib/profile-io";

/**
 * Dispara el Módulo 1 (extracción) sobre lo que haya en data/raw/ y guarda el
 * resultado en data/profile.draft.json para revisión humana.
 *
 * Fase 1/2: solo modo API. El modo Agente (CLAUDE_MODE=agent) se implementa
 * en la Fase 6 vía el buzón .claude-tasks/.
 */
export async function POST() {
  try {
    const { pdfPath, imagePaths } = await findSeedFiles();
    const connector = new ApiConnector();
    const draft = await connector.extractProfile({ pdfPath, imagePaths });
    await writeDraft(draft);
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
