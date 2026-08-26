/**
 * Fábrica de conectores (sección 8.2: "Selector de modo Claude ... disponible
 * también como override puntual en /nueva-aplicacion"). CLAUDE_MODE en .env
 * define qué modos están habilitados en este servidor ("api" | "agent" |
 * "both"); el caller puede pedir un modo puntual si está permitido.
 */
import { ApiConnector } from "@/lib/claude/api-connector";
import { AgentConnector } from "@/lib/claude/agent-connector";
import { ClaudeConnectorError, type ClaudeConnector } from "@/lib/claude/connector.interface";

export type ClaudeMode = "api" | "agent";

function getAllowedModes(): Set<ClaudeMode> {
  const raw = process.env.CLAUDE_MODE?.trim().toLowerCase();
  if (raw === "api") return new Set(["api"]);
  if (raw === "agent") return new Set(["agent"]);
  return new Set(["api", "agent"]); // "both" o sin configurar
}

/** Resuelve qué modo se va a usar realmente, validando contra CLAUDE_MODE. */
export function resolveClaudeMode(requestedMode?: ClaudeMode): ClaudeMode {
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

export function getConnector(requestedMode?: ClaudeMode): ClaudeConnector {
  const mode = resolveClaudeMode(requestedMode);
  return mode === "agent" ? new AgentConnector() : new ApiConnector();
}
