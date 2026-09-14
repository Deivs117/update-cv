/**
 * Fábrica de conectores (sección 8.2: "Selector de modo Claude ... disponible
 * también como override puntual en /nueva-aplicacion"). CLAUDE_MODE en .env
 * define qué modos están habilitados en este servidor ("api" | "agent" |
 * "both"); el caller puede pedir un modo puntual si está permitido.
 *
 * Dentro del modo "api", MODEL_PROVIDER elige a cuál proveedor de modelo se
 * llama (issue #32) -- anthropic | google | nvidia, todos implementando el
 * mismo ClaudeConnector (api-connector.ts, gemini-connector.ts,
 * nvidia-nim-connector.ts), así que el resto del sistema no distingue cuál
 * está activo. El modo "agent" (Claude Code) es independiente de esto.
 */
import { ApiConnector } from "@/lib/claude/api-connector";
import { AgentConnector } from "@/lib/claude/agent-connector";
import { GeminiConnector } from "@/lib/claude/gemini-connector";
import { NvidiaNimConnector } from "@/lib/claude/nvidia-nim-connector";
import { ClaudeConnectorError, type ClaudeConnector } from "@/lib/claude/connector.interface";

export type ClaudeMode = "api" | "agent";
export type ModelProvider = "anthropic" | "google" | "nvidia";

function getAllowedModes(): Set<ClaudeMode> {
  const raw = process.env.CLAUDE_MODE?.trim().toLowerCase();
  if (raw === "api") return new Set(["api"]);
  if (raw === "agent") return new Set(["agent"]);
  return new Set(["api", "agent"]); // "both" o sin configurar
}

/**
 * El modo Agente (buzón `.claude-tasks/`, Claude Code procesando tareas) solo
 * tiene sentido contra un filesystem local -- en una instalación hosteada
 * (STORAGE_MODE=hosted, ver resolveStorageMode() en
 * lib/storage/get-storage-adapter.ts) nunca debe quedar disponible ni
 * configurable por un usuario final, sin importar CLAUDE_MODE ni un
 * requestedMode explícito (issue #16).
 */
function isHostedStorage(): boolean {
  return process.env.STORAGE_MODE?.trim().toLowerCase() === "hosted";
}

/** Resuelve qué modo se va a usar realmente, validando contra CLAUDE_MODE. */
export function resolveClaudeMode(requestedMode?: ClaudeMode): ClaudeMode {
  if (isHostedStorage()) {
    if (requestedMode === "agent") {
      throw new ClaudeConnectorError(
        "El modo Agente no está disponible en instalaciones hosteadas -- usa MODEL_PROVIDER en su lugar.",
      );
    }
    return "api";
  }

  const allowed = getAllowedModes();
  const mode = requestedMode ?? (allowed.has("api") ? "api" : "agent");

  if (!allowed.has(mode)) {
    throw new ClaudeConnectorError(
      `El modo '${mode}' no está habilitado en este servidor (CLAUDE_MODE=${process.env.CLAUDE_MODE ?? "both"}). ` +
        `Cambia CLAUDE_MODE en .env, o elige el otro modo disponible.`,
    );
  }
  return mode;
}

/**
 * Resuelve MODEL_PROVIDER. Default explícito "anthropic" (compatibilidad con
 * instalaciones existentes de antes de que este proveedor existiera) --
 * .env.example, en cambio, ya trae MODEL_PROVIDER=google como valor
 * recomendado para instalaciones nuevas, dado que hoy no hay créditos de
 * Anthropic activos.
 */
export function resolveModelProvider(): ModelProvider {
  const raw = process.env.MODEL_PROVIDER?.trim().toLowerCase();
  if (raw === "google") return "google";
  if (raw === "nvidia") return "nvidia";
  if (raw && raw !== "anthropic") {
    throw new ClaudeConnectorError(
      `MODEL_PROVIDER="${raw}" no es válido. Usa "anthropic", "google" o "nvidia".`,
    );
  }
  return "anthropic";
}

function createApiConnector(): ClaudeConnector {
  const provider = resolveModelProvider();
  if (provider === "google") return new GeminiConnector();
  if (provider === "nvidia") return new NvidiaNimConnector();
  return new ApiConnector();
}

export function getConnector(requestedMode?: ClaudeMode): ClaudeConnector {
  const mode = resolveClaudeMode(requestedMode);
  return mode === "agent" ? new AgentConnector() : createApiConnector();
}
