import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { APPS_DIR, type ApplicationMetadata } from "@/lib/apps-io";
import { compileLatex, LatexCompileError } from "@/lib/latex/compile";
import { countPdfPages, PageCountError } from "@/lib/latex/page-count";

/**
 * Editor de LaTeX avanzado (sección 8.2): recibe el .tex editado a mano y lo
 * recompila SIN volver a pasar por Claude. Para ajustes finos de último
 * minuto (ej. acortar una línea para que quepa en una página).
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug || slug.includes("/") || slug.includes("..")) {
    return NextResponse.json({ error: "Slug inválido." }, { status: 400 });
  }
  const dir = path.join(APPS_DIR, slug);
  if (path.resolve(dir) !== path.join(path.resolve(APPS_DIR), slug)) {
    return NextResponse.json({ error: "Slug inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }

  const tex = (body as { tex?: unknown })?.tex;
  const file = (body as { file?: unknown })?.file === "cover_letter" ? "cover_letter" : "cv";
  if (typeof tex !== "string" || !tex.trim()) {
    return NextResponse.json({ error: "Falta el contenido .tex a compilar." }, { status: 400 });
  }

  const texFileName = `${file}.tex`;

  try {
    await writeFile(path.join(dir, texFileName), tex, "utf-8");
    const { pdfPath } = await compileLatex(texFileName, dir);
    const pages = await countPdfPages(pdfPath);

    // Solo el CV lleva conteo de páginas en metadata.json (la carta no tiene
    // recomendación de páginas asociada).
    if (file === "cv") {
      try {
        const metadataPath = path.join(dir, "metadata.json");
        const metadata = JSON.parse(await readFile(metadataPath, "utf-8")) as ApplicationMetadata;
        metadata.pages = pages;
        await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf-8");
      } catch {
        // metadata.json ausente/corrupto: no bloquea la recompilación, solo no se actualiza el conteo.
      }
    }

    return NextResponse.json({ pages, pdfUrl: `/api/apps/${slug}/${file}.pdf` });
  } catch (err) {
    if (err instanceof LatexCompileError) {
      // Manejo de errores de compilación visible en UI (sección 16, Fase 7):
      // se devuelve el mensaje completo (incluye resumen del log de LaTeX).
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof PageCountError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Error inesperado recompilando el documento." }, { status: 500 });
  }
}
