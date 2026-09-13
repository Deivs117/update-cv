import { describe, expect, it } from "vitest";
import { ClaudeConnectorError } from "@/lib/claude/connector.interface";
import { extractJsonObject } from "@/lib/claude/extract-json-object";

const OPTIONS = { providerLabel: "Claude", truncationParam: "max_tokens" };

describe("extractJsonObject", () => {
  it("extrae un objeto JSON puro sin texto alrededor", () => {
    expect(extractJsonObject('{"a":1}', OPTIONS)).toBe('{"a":1}');
  });

  it("extrae el JSON de un bloque ```json ... ```", () => {
    const text = 'Aquí está:\n```json\n{"a":1,"b":2}\n```\nEso es todo.';
    expect(extractJsonObject(text, OPTIONS)).toBe('{"a":1,"b":2}');
  });

  it("extrae el JSON de un bloque ``` sin la etiqueta 'json'", () => {
    const text = '```\n{"a":1}\n```';
    expect(extractJsonObject(text, OPTIONS)).toBe('{"a":1}');
  });

  it("ignora texto antes y después del objeto cuando no hay bloque de código", () => {
    const text = 'Claro, aquí tienes: {"a":1} -- espero que ayude.';
    expect(extractJsonObject(text, OPTIONS)).toBe('{"a":1}');
  });

  it("respeta llaves anidadas (cuenta profundidad, no se detiene en el primer '}')", () => {
    const text = '{"a":{"b":1},"c":2}';
    expect(extractJsonObject(text, OPTIONS)).toBe(text);
  });

  it("sin ningún '{' en el texto, lanza ClaudeConnectorError mencionando al proveedor", () => {
    expect(() => extractJsonObject("no hay nada acá", OPTIONS)).toThrow(ClaudeConnectorError);
    expect(() => extractJsonObject("no hay nada acá", OPTIONS)).toThrow(/Claude/);
  });

  it("objeto sin cerrar (truncado), lanza ClaudeConnectorError mencionando el parámetro de truncación", () => {
    expect(() => extractJsonObject('{"a":1,', OPTIONS)).toThrow(/max_tokens/);
  });

  it("usa providerLabel/truncationParam propios de cada proveedor en el mensaje", () => {
    const geminiOptions = { providerLabel: "Gemini", truncationParam: "maxOutputTokens" };
    expect(() => extractJsonObject("sin json", geminiOptions)).toThrow(/Gemini/);
    expect(() => extractJsonObject('{"a":', geminiOptions)).toThrow(/maxOutputTokens/);
  });
});
