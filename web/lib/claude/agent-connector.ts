/**
 * Implementación del ClaudeConnector vía el buzón de archivos .claude-tasks/
 * (sección 7.3): no hay llamada API propia. Se escribe una tarea en
 * .claude-tasks/pending/{task_id}.json y se espera (polling) a que Claude
 * Code -- corriendo en una terminal del usuario dentro del repo -- la
 * procese y escriba el resultado en .claude-tasks/done/{task_id}.result.json.
 *
 * Los prompts/criterios deben mantenerse en paridad con api-connector.ts --
 * ver CLAUDE.md para las instrucciones que sigue Claude Code al procesar
 * estas tareas.
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { REPO_ROOT } from "@/lib/profile-io";
import {
  ClaudeConnectorError,
  type ClaudeConnector,
  type ExtractProfileInput,
  type GenerateCoverLetterInput,
  type JobAnalysis,
  type TailorCVInput,
  type TailoredContent,
} from "@/lib/claude/connector.interface";
import { profileDraftSchema, type ProfileDraft } from "@/lib/validation/profile.zod";
import { jobAnalysisSchema, tailorRawResponseSchema } from "@/lib/validation/generation.zod";
import { buildCandidateContent, resolveTailoredContent } from "@/lib/tailoring";
import { z } from "zod";

const TASKS_DIR = path.join(REPO_ROOT, ".claude-tasks");
const PENDING_DIR = path.join(TASKS_DIR, "pending");
const DONE_DIR = path.join(TASKS_DIR, "done");

const POLL_INTERVAL_MS = Number(process.env.AGENT_POLL_INTERVAL_MS ?? "3000");
const TASK_TIMEOUT_MS = Number(process.env.AGENT_TASK_TIMEOUT_MS ?? String(15 * 60 * 1000));

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

/**
 * Escribe una tarea en pending/, espera (polling) el resultado en done/, y
 * limpia el archivo de pending una vez leído (CLAUDE.md: "no borres el
 * archivo de pending/ -- la web app lo mueve/limpia tras confirmar que leyó
 * el resultado").
 */
async function runAgentTask<T>(
  type: string,
  payload: Record<string, unknown>,
  resultSchema: z.ZodType<T>,
): Promise<T> {
  await mkdir(PENDING_DIR, { recursive: true });
  await mkdir(DONE_DIR, { recursive: true });

  const taskId = randomUUID();
  const pendingPath = path.join(PENDING_DIR, `${taskId}.json`);
  const resultPath = path.join(DONE_DIR, `${taskId}.result.json`);

  const task = {
    type,
    task_id: taskId,
    output_path: path.relative(REPO_ROOT, resultPath),
    ...payload,
  };
  await writeFile(pendingPath, JSON.stringify(task, null, 2), "utf-8");

  console.log(
    `[modo agente] Tarea "${type}" (${taskId}) escrita en .claude-tasks/pending/${taskId}.json. ` +
      `Esperando a que Claude Code la procese (hasta ${Math.round(TASK_TIMEOUT_MS / 1000)}s)...`,
  );

  // Claude Code (o el watcher) no escribe el archivo de forma atómica -- hay
  // una ventana real en la que fileExists() ya es true pero el contenido
  // todavía se está escribiendo. Un solo intento de parseo en ese instante
  // puede fallar con un JSON truncado que segundos después es válido. En vez
  // de fallar la tarea entera por esa carrera, se reintenta unas pocas veces
  // antes de darla por corrupta de verdad.
  let consecutiveParseFailures = 0;
  const MAX_PARSE_RETRIES = 5;

  const deadline = Date.now() + TASK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await fileExists(resultPath)) {
      let raw: string;
      let parsedJson: unknown;
      try {
        raw = await readFile(resultPath, "utf-8");
        parsedJson = JSON.parse(raw);
      } catch (err) {
        consecutiveParseFailures += 1;
        if (consecutiveParseFailures <= MAX_PARSE_RETRIES) {
          await sleep(POLL_INTERVAL_MS);
          continue;
        }
        throw new ClaudeConnectorError(
          `El resultado escrito por Claude Code en ${resultPath} no es JSON válido (tras ${MAX_PARSE_RETRIES} reintentos). ` +
            `El archivo de pending/ no se borró -- revísalo a mano antes de reintentar.`,
          err,
        );
      }

      await rm(pendingPath, { force: true });

      const result = resultSchema.safeParse(parsedJson);
      if (!result.success) {
        throw new ClaudeConnectorError(
          `El resultado de Claude Code para la tarea "${type}" no cumple la forma esperada: ${result.error.message}`,
          result.error,
        );
      }
      // Ya se consumió y validó -- limpiar done/ para que no acumule
      // indefinidamente un archivo por cada tarea procesada (son efímeros).
      await rm(resultPath, { force: true });
      return result.data;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new ClaudeConnectorError(
    `Se agotó el tiempo de espera (${Math.round(TASK_TIMEOUT_MS / 1000)}s) para la tarea "${type}" (${taskId}). ` +
      `La tarea sigue en .claude-tasks/pending/${taskId}.json -- abre una terminal con Claude Code en este repo, ` +
      `pídele que procese las tareas pendientes (ver CLAUDE.md), y vuelve a intentar.`,
  );
}

const coverLetterResultSchema = z.object({ body: z.string() });

export class AgentConnector implements ClaudeConnector {
  async extractProfile(input: ExtractProfileInput): Promise<ProfileDraft> {
    return runAgentTask(
      "extract_profile",
      { input_pdf: path.relative(REPO_ROOT, input.pdfPath), input_images: input.imagePaths.map((p) => path.relative(REPO_ROOT, p)) },
      profileDraftSchema,
    );
  }

  async analyzeJob(input: { jobDescription: string }): Promise<JobAnalysis> {
    if (!input.jobDescription.trim()) {
      throw new ClaudeConnectorError("La descripción de la vacante está vacía.");
    }
    return runAgentTask("analyze_job", { job_description: input.jobDescription }, jobAnalysisSchema);
  }

  async tailorCV(input: TailorCVInput): Promise<TailoredContent> {
    const jobAnalysis = input.jobAnalysis ?? (await this.analyzeJob({ jobDescription: input.jobDescription }));
    const candidateContent = buildCandidateContent(input.profile, input.language);

    const raw = await runAgentTask(
      "tailor_cv",
      {
        candidate_content: candidateContent,
        job_description: input.jobDescription,
        job_analysis: jobAnalysis,
        recommended_max_pages: input.maxPages,
        language: input.language,
      },
      tailorRawResponseSchema,
    );

    return resolveTailoredContent(input.profile, input.language, raw);
  }

  async generateCoverLetter(input: GenerateCoverLetterInput): Promise<string> {
    const jobAnalysis = input.jobAnalysis ?? (await this.analyzeJob({ jobDescription: input.jobDescription }));
    const candidateContent = buildCandidateContent(input.profile, input.language);

    const result = await runAgentTask(
      "generate_cover_letter",
      {
        candidate_content: candidateContent,
        job_description: input.jobDescription,
        job_analysis: jobAnalysis,
        company: input.company,
        role: input.role,
        language: input.language,
      },
      coverLetterResultSchema,
    );

    return result.body.trim();
  }
}
