/**
 * Sirve archivos dentro de apps/{empresa}-{puesto}-{fecha}/ (cv.pdf, cv.tex,
 * job_description.txt) para la previsualización embebida y el historial
 * (Fase 7). Restringido a APPS_DIR para evitar path traversal.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { APPS_DIR } from "@/lib/apps-io";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".tex": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const requestedPath = path.join(APPS_DIR, ...segments);
  const resolved = path.resolve(requestedPath);

  // Nunca servir nada fuera de apps/ (evita ../../ path traversal).
  if (!resolved.startsWith(path.resolve(APPS_DIR) + path.sep)) {
    return NextResponse.json({ error: "Ruta inválida." }, { status: 400 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Tipo de archivo no permitido." }, { status: 400 });
  }

  try {
    const data = await readFile(resolved);
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  }
}
