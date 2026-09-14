import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getStorageAdapter } from "@/lib/storage/get-storage-adapter";
import type { ApplicationRecord } from "@/lib/storage/storage-adapter.interface";

/**
 * Sirve los archivos de una aplicación (previsualización embebida y editor
 * LaTeX avanzado, Fase 7) -- reemplaza el antiguo `GET /api/apps/[...path]`
 * (decisión de diseño #13).
 *
 * `[file]` es un solo segmento (no un catch-all): a diferencia de la ruta
 * anterior, acá no hay "cualquier path dentro de apps/" que restringir
 * después con una comparación de prefijos -- solo se reconoce un conjunto
 * fijo de nombres, cualquier otro valor es simplemente un 404. El contenido
 * de texto (.tex/.txt/.json) viene de `getApplication` (campos de la fila,
 * no archivos sueltos en modo hosteado); solo los PDFs son binarios reales
 * y pueden resolver a una redirección a URL firmada en modo hosteado (#10).
 */
const TEXT_FILES = {
  "cv.tex": (record: ApplicationRecord) => record.cvTex,
  "job_description.txt": (record: ApplicationRecord) => record.jobDescription,
  "cover_letter.tex": (record: ApplicationRecord) => record.coverLetterTex,
  "cover_letter.txt": (record: ApplicationRecord) => record.coverLetterText,
  "metadata.json": (record: ApplicationRecord) => JSON.stringify(record.metadata, null, 2) + "\n",
} as const satisfies Record<string, (record: ApplicationRecord) => string | undefined>;

const TEXT_CONTENT_TYPES: Record<string, string> = {
  "cv.tex": "text/plain; charset=utf-8",
  "job_description.txt": "text/plain; charset=utf-8",
  "cover_letter.tex": "text/plain; charset=utf-8",
  "cover_letter.txt": "text/plain; charset=utf-8",
  "metadata.json": "application/json",
};

const PDF_FILES = new Set(["cv.pdf", "cover_letter.pdf"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; file: string }> },
) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const { slug, file } = await params;
  const adapter = getStorageAdapter(session.userId);

  if (PDF_FILES.has(file)) {
    const pdfFile = file === "cover_letter.pdf" ? "cover_letter" : "cv";
    const source = await adapter.getApplicationPdf(slug, pdfFile);
    if (!source) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });

    if (source.kind === "redirect") {
      return NextResponse.redirect(source.url);
    }
    return new NextResponse(new Uint8Array(source.data), {
      headers: { "Content-Type": "application/pdf" },
    });
  }

  if (file in TEXT_FILES) {
    const record = await adapter.getApplication(slug);
    if (!record) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });

    const content = TEXT_FILES[file as keyof typeof TEXT_FILES](record);
    if (content === undefined) {
      return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
    }
    return new NextResponse(content, {
      headers: { "Content-Type": TEXT_CONTENT_TYPES[file] },
    });
  }

  return NextResponse.json({ error: "Tipo de archivo no permitido." }, { status: 400 });
}
