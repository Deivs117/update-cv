import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentConnector } from "@/lib/claude/agent-connector";
import { ApiConnector } from "@/lib/claude/api-connector";
import { ClaudeConnectorError } from "@/lib/claude/connector.interface";
import { GeminiConnector } from "@/lib/claude/gemini-connector";
import { getConnector, resolveClaudeMode, resolveModelProvider } from "@/lib/claude/get-connector";
import { NvidiaNimConnector } from "@/lib/claude/nvidia-nim-connector";

// resolveClaudeMode/resolveModelProvider/getConnector leen process.env
// directo -- se guarda/restaura el valor original en cada test para no
// filtrar estado entre tests ni depender del .env real de quien corra la
// suite. Las API keys dummy son seguras: los constructores de los 3
// conectores solo guardan la key para llamadas futuras, nunca la validan
// contra el proveedor real al construirse.
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.CLAUDE_MODE;
  delete process.env.MODEL_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.NVIDIA_NIM_API_KEY;
  delete process.env.STORAGE_MODE;
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

  it("STORAGE_MODE=hosted fuerza 'api' aunque CLAUDE_MODE=agent", () => {
    process.env.STORAGE_MODE = "hosted";
    process.env.CLAUDE_MODE = "agent";
    expect(resolveClaudeMode()).toBe("api");
  });

  it("STORAGE_MODE=hosted rechaza un requestedMode='agent' explícito", () => {
    process.env.STORAGE_MODE = "hosted";
    expect(() => resolveClaudeMode("agent")).toThrow(ClaudeConnectorError);
    expect(() => resolveClaudeMode("agent")).toThrow(/instalaciones hosteadas/);
  });

  it("STORAGE_MODE=hosted con requestedMode='api' explícito sigue devolviendo 'api'", () => {
    process.env.STORAGE_MODE = "hosted";
    expect(resolveClaudeMode("api")).toBe("api");
  });

  it("STORAGE_MODE=local (o sin configurar) no altera el comportamiento existente", () => {
    process.env.STORAGE_MODE = "local";
    process.env.CLAUDE_MODE = "agent";
    expect(resolveClaudeMode()).toBe("agent");
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

describe("getConnector", () => {
  it("CLAUDE_MODE=agent devuelve un AgentConnector, sin importar MODEL_PROVIDER", () => {
    process.env.CLAUDE_MODE = "agent";
    expect(getConnector()).toBeInstanceOf(AgentConnector);
  });

  it("MODEL_PROVIDER=anthropic (o sin configurar) devuelve un ApiConnector", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-dummy";
    expect(getConnector()).toBeInstanceOf(ApiConnector);
  });

  it("MODEL_PROVIDER=google devuelve un GeminiConnector", () => {
    process.env.MODEL_PROVIDER = "google";
    process.env.GOOGLE_API_KEY = "test-dummy";
    expect(getConnector()).toBeInstanceOf(GeminiConnector);
  });

  it("MODEL_PROVIDER=nvidia devuelve un NvidiaNimConnector", () => {
    process.env.MODEL_PROVIDER = "nvidia";
    process.env.NVIDIA_NIM_API_KEY = "test-dummy";
    expect(getConnector()).toBeInstanceOf(NvidiaNimConnector);
  });

  it("un requestedMode='api' explícito fuerza modo API aunque CLAUDE_MODE=both", () => {
    process.env.CLAUDE_MODE = "both";
    process.env.ANTHROPIC_API_KEY = "sk-test-dummy";
    expect(getConnector("api")).toBeInstanceOf(ApiConnector);
  });

  it("STORAGE_MODE=hosted nunca instancia un AgentConnector, aunque CLAUDE_MODE=agent", () => {
    process.env.STORAGE_MODE = "hosted";
    process.env.CLAUDE_MODE = "agent";
    process.env.ANTHROPIC_API_KEY = "sk-test-dummy";
    expect(getConnector()).toBeInstanceOf(ApiConnector);
  });
});
