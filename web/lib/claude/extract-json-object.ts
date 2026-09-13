/**
 * Extrae el primer objeto JSON balanceado de la respuesta de texto de un
 * modelo (los tres proveedores devuelven a veces el JSON envuelto en un
 * bloque ```json ... ``` o con texto alrededor, nunca garantizan JSON puro).
 *
 * Compartido entre api-connector.ts, gemini-connector.ts y
 * nvidia-nim-connector.ts (#65: estaba triplicado idéntico salvo el nombre
 * del proveedor y del parámetro de truncación en los mensajes de error).
 */
import { ClaudeConnectorError } from "@/lib/claude/connector.interface";

export interface ExtractJsonObjectOptions {
  /** Nombre del proveedor tal como aparece en los mensajes de error (ej. "Claude", "Gemini", "NVIDIA NIM"). */
  providerLabel: string;
  /** Nombre del parámetro de truncación de ese proveedor (ej. "max_tokens", "maxOutputTokens"). */
  truncationParam: string;
}

export function extractJsonObject(text: string, options: ExtractJsonObjectOptions): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  if (start === -1) {
    throw new ClaudeConnectorError(
      `La respuesta de ${options.providerLabel} no contiene un objeto JSON reconocible.`,
    );
  }
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    if (candidate[i] === "{") depth++;
    if (candidate[i] === "}") depth--;
    if (depth === 0) {
      return candidate.slice(start, i + 1);
    }
  }
  throw new ClaudeConnectorError(
    `La respuesta de ${options.providerLabel} tiene un objeto JSON sin cerrar (posiblemente truncado por ${options.truncationParam}).`,
  );
}
