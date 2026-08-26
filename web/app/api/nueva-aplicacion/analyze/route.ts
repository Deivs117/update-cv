import { NextResponse } from "next/server";
import { getConnector, type ClaudeMode } from "@/lib/claude/get-connector";
import { ClaudeConnectorError } from "@/lib/claude/connector.interface";

/** Sección 9.2 — Paso 1: análisis de la vacante (para mostrar en la UI antes de generar). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }

  const jobDescription = (body as { jobDescription?: unknown })?.jobDescription;
  if (typeof jobDescription !== "string" || !jobDescription.trim()) {
    return NextResponse.json(
      { error: "Falta el texto de la vacante (jobDescription)." },
      { status: 400 },
    );
  }

  const rawMode = (body as { claudeMode?: unknown })?.claudeMode;
  const mode: ClaudeMode | undefined = rawMode === "api" || rawMode === "agent" ? rawMode : undefined;

  try {
    const connector = getConnector(mode);
    const analysis = await connector.analyzeJob({ jobDescription });
    return NextResponse.json({ analysis });
  } catch (err) {
    if (err instanceof ClaudeConnectorError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "Error inesperado analizando la vacante." },
      { status: 500 },
    );
  }
}
