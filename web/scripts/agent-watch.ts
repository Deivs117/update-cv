/**
 * Watcher del modo Agente (sección 7.3 / Fase 6, refinado): en vez de tener
 * que pedirle manualmente a Claude Code, en una terminal, que "procese las
 * tareas pendientes" cada vez que la web app escribe una en
 * .claude-tasks/pending/, este script vigila esa carpeta y usa el CLI
 * headless de Claude Code (`claude -p`) para procesarlas solo, apenas
 * aparecen -- una detrás de otra, sin que tengas que volver a la terminal
 * por cada paso del flujo (analizar vacante, adaptar CV, carta, etc).
 *
 * Uso: `npm run agent:watch` (déjalo corriendo en una terminal aparte
 * mientras usas la web app en modo Agente). Ctrl+C para detenerlo.
 *
 * Requiere el CLI `claude` instalado y autenticado (mismo que usarías para
 * pedirme esto manualmente) -- este script solo automatiza el "pedírmelo".
 * Las instrucciones exactas de qué hacer con cada tipo de tarea siguen
 * viviendo en CLAUDE.md (única fuente de verdad, para no duplicar criterio).
 */
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const PENDING_DIR = path.join(REPO_ROOT, ".claude-tasks", "pending");

const POLL_INTERVAL_MS = Number(process.env.AGENT_WATCH_POLL_INTERVAL_MS ?? "3000");
const TASK_TIMEOUT_MS = Number(process.env.AGENT_WATCH_TASK_TIMEOUT_MS ?? String(10 * 60 * 1000));
const CLAUDE_BIN = process.env.AGENT_WATCH_CLAUDE_BIN ?? "claude";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function log(msg: string) {
  console.log(`[agent-watch] ${msg}`);
}

interface PendingTask {
  type: string;
  task_id: string;
  output_path: string;
}

function isPendingTask(value: unknown): value is PendingTask {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === "string" && typeof v.task_id === "string" && typeof v.output_path === "string";
}

/** Corre `claude -p` sobre una única tarea, con timeout, y reporta éxito/fracaso. */
async function processTask(fileName: string): Promise<void> {
  const pendingPath = path.join(PENDING_DIR, fileName);

  let raw: string;
  let task: unknown;
  try {
    raw = await readFile(pendingPath, "utf-8");
    task = JSON.parse(raw);
  } catch (err) {
    log(`⚠️  No se pudo leer/parsear ${fileName}, se ignora: ${err instanceof Error ? err.message : err}`);
    return;
  }
  if (!isPendingTask(task)) {
    log(`⚠️  ${fileName} no tiene la forma esperada de tarea (type/task_id/output_path), se ignora.`);
    return;
  }

  const resultAbsPath = path.join(REPO_ROOT, task.output_path);
  if (await fileExists(resultAbsPath)) {
    log(`↷ Tarea "${task.type}" (${task.task_id}) ya tiene resultado en ${task.output_path} -- esperando a que la web app la recoja.`);
    return;
  }

  log(`▶ Procesando tarea "${task.type}" (${task.task_id})...`);
  const started = Date.now();

  const prompt =
    `Procesa ÚNICAMENTE la tarea del modo Agente escrita en .claude-tasks/pending/${fileName}, ` +
    `siguiendo exactamente las instrucciones de CLAUDE.md para su "type" ("${task.type}"). ` +
    `Escribe el resultado en la ruta que indica su campo "output_path" (${task.output_path}), como JSON válido. ` +
    `No proceses ninguna otra tarea ni toques ningún otro archivo. No borres el archivo de pending/.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TASK_TIMEOUT_MS);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        CLAUDE_BIN,
        [
          "-p",
          prompt,
          "--permission-mode",
          "acceptEdits",
          "--allowedTools",
          "Read Write Glob Grep",
        ],
        { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], signal: controller.signal },
      );

      let stderr = "";
      child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`claude -p salió con código ${code}.${stderr ? ` stderr: ${stderr.slice(0, 500)}` : ""}`));
      });
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    log(
      isAbort
        ? `✗ Tarea "${task.type}" (${task.task_id}) superó el timeout de ${Math.round(TASK_TIMEOUT_MS / 1000)}s -- se reintentará en el próximo ciclo.`
        : `✗ Falló procesando "${task.type}" (${task.task_id}): ${err instanceof Error ? err.message : err}`,
    );
    return;
  } finally {
    clearTimeout(timer);
  }

  const elapsedS = Math.round((Date.now() - started) / 1000);
  if (await fileExists(resultAbsPath)) {
    log(`✓ Tarea "${task.type}" (${task.task_id}) resuelta en ${elapsedS}s -> ${task.output_path}`);
  } else {
    log(
      `⚠️  "claude -p" terminó sin error pero no encontré ${task.output_path} -- revisa la tarea manualmente ` +
        `(.claude-tasks/pending/${fileName}).`,
    );
  }
}

async function main() {
  log(`Vigilando ${path.relative(REPO_ROOT, PENDING_DIR)}/ -- Ctrl+C para detener.`);
  log(`(cada tarea nueva se procesa con "${CLAUDE_BIN} -p", una a la vez, siguiendo CLAUDE.md)`);

  for (;;) {
    let files: string[];
    try {
      files = (await readdir(PENDING_DIR)).filter((f) => f.endsWith(".json"));
    } catch {
      files = [];
    }

    // Orden estable (FIFO aproximado por nombre de archivo/UUID no garantiza
    // orden de creación, pero procesarlas todas en el mismo ciclo sí evita
    // que el usuario tenga que volver a intervenir entre pasos).
    for (const file of files) {
      await processTask(file);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

main().catch((err) => {
  console.error(`[agent-watch] Error fatal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
