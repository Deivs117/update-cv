/**
 * Compilación local LaTeX -> PDF (sección 9.6). Motor configurable vía
 * LATEX_ENGINE (tectonic | pdflatex, ver .env.example).
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export class LatexCompileError extends Error {
  constructor(
    message: string,
    public readonly log: string,
  ) {
    super(message);
    this.name = "LatexCompileError";
  }
}

export type LatexEngine = "tectonic" | "pdflatex";

function getEngine(): LatexEngine {
  const engine = process.env.LATEX_ENGINE?.trim();
  return engine === "pdflatex" ? "pdflatex" : "tectonic";
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", (err) => {
      // ENOENT etc.: el binario no existe / no está en PATH.
      reject(err);
    });
    child.on("close", (code) => resolve({ code, output }));
  });
}

/**
 * Compila `texFileName` (ej. "cv.tex") dentro de `cwd` y devuelve la ruta al
 * PDF resultante. Guarda el log completo en `compile.log` dentro de `cwd`
 * (tanto en éxito como en fallo, para poder auditar después).
 */
export async function compileLatex(
  texFileName: string,
  cwd: string,
): Promise<{ pdfPath: string; log: string }> {
  const engine = getEngine();
  const pdfFileName = texFileName.replace(/\.tex$/, ".pdf");
  const pdfPath = path.join(cwd, pdfFileName);
  const logPath = path.join(cwd, "compile.log");

  let result: { code: number | null; output: string };
  try {
    if (engine === "tectonic") {
      result = await runProcess("tectonic", [texFileName], cwd);
    } else {
      result = await runProcess(
        "pdflatex",
        ["-interaction=nonstopmode", "-halt-on-error", texFileName],
        cwd,
      );
    }
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      throw new LatexCompileError(
        `No se encontró el binario "${engine}" en el PATH. Instálalo (ver README.md) o cambia LATEX_ENGINE en .env.`,
        "",
      );
    }
    throw new LatexCompileError(
      `Error inesperado ejecutando ${engine}: ${(err as Error).message}`,
      "",
    );
  }

  await writeFile(logPath, result.output, "utf-8");

  if (result.code !== 0) {
    const errorLines = result.output
      .split("\n")
      .filter((line) => line.startsWith("!") || /error/i.test(line));
    const summary = errorLines.length
      ? errorLines.slice(0, 10).join("\n")
      : result.output.slice(-2000);
    throw new LatexCompileError(
      `La compilación LaTeX falló (${engine}, código de salida ${result.code}). ` +
        `Log completo en ${logPath}.\n\nResumen del error:\n${summary}`,
      result.output,
    );
  }

  return { pdfPath, log: result.output };
}
