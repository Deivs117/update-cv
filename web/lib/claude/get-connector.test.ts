import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeConnectorError } from "@/lib/claude/connector.interface";
import { resolveClaudeMode, resolveModelProvider } from "@/lib/claude/get-connector";

// resolveClaudeMode/resolveModelProvider leen process.env directo -- se
// guarda/restaura el valor original en cada test para no filtrar estado
// entre tests ni depender del .env real de quien corra la suite.
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.CLAUDE_MODE;
  delete process.env.MODEL_PROVIDER;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveClaudeMode", () => {
  it("sin CLAUDE_MODE configurado, permite ambos modos y prioriza 'api' por defecto", () => {
    expect(resolveClaudeMode()).toBe("api");
  });

  it("CLAUDE_MODE=both permite ambos modos y prioriza 'api' por defecto", () => {
    process.env.CLAUDE_MODE = "both";
    expect(resolveClaudeMode()).toBe("api");
    expect(resolveClaudeMode("agent")).toBe("agent");
  });

  it("CLAUDE_MODE=api rechaza un requestedMode='agent'", () => {
    process.env.CLAUDE_MODE = "api";
    expect(() => resolveClaudeMode("agent")).toThrow(ClaudeConnectorError);
  });

  it("CLAUDE_MODE=agent rechaza un requestedMode='api'", () => {
    process.env.CLAUDE_MODE = "agent";
    expect(() => resolveClaudeMode("api")).toThrow(ClaudeConnectorError);
  });

  it("CLAUDE_MODE=agent sin requestedMode devuelve 'agent'", () => {
    process.env.CLAUDE_MODE = "agent";
    expect(resolveClaudeMode()).toBe("agent");
  });

  it("respeta un requestedMode explícito cuando está permitido", () => {
    process.env.CLAUDE_MODE = "both";
    expect(resolveClaudeMode("api")).toBe("api");
  });
});

describe("resolveModelProvider", () => {
  it("sin MODEL_PROVIDER configurado, default explícito 'anthropic' (compatibilidad hacia atrás)", () => {
    expect(resolveModelProvider()).toBe("anthropic");
  });

  it("MODEL_PROVIDER=google", () => {
    process.env.MODEL_PROVIDER = "google";
    expect(resolveModelProvider()).toBe("google");
  });

  it("MODEL_PROVIDER=nvidia", () => {
    process.env.MODEL_PROVIDER = "nvidia";
    expect(resolveModelProvider()).toBe("nvidia");
  });

  it("MODEL_PROVIDER=anthropic explícito", () => {
    process.env.MODEL_PROVIDER = "anthropic";
    expect(resolveModelProvider()).toBe("anthropic");
  });

  it("no distingue mayúsculas/espacios (trim + lowercase)", () => {
    process.env.MODEL_PROVIDER = "  GOOGLE  ";
    expect(resolveModelProvider()).toBe("google");
  });

  it("valor desconocido lanza ClaudeConnectorError", () => {
    process.env.MODEL_PROVIDER = "openai";
    expect(() => resolveModelProvider()).toThrow(ClaudeConnectorError);
  });
});
