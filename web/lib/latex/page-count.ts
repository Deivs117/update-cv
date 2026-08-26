/**
 * Verificación determinística del número de páginas de un PDF ya compilado
 * (sección 9.6, paso 2) -- no confiamos solo en que Claude "calculó bien"
 * cuánto contenido cabía en una página.
 */
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

export class PageCountError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PageCountError";
  }
}

export async function countPdfPages(pdfPath: string): Promise<number> {
  let bytes: Buffer;
  try {
    bytes = await readFile(pdfPath);
  } catch (err) {
    throw new PageCountError(`No se pudo leer el PDF en "${pdfPath}".`, err);
  }

  try {
    const doc = await PDFDocument.load(bytes);
    return doc.getPageCount();
  } catch (err) {
    throw new PageCountError(
      `El archivo en "${pdfPath}" no es un PDF válido o está corrupto.`,
      err,
    );
  }
}
