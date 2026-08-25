/**
 * Implementación del ClaudeConnector vía Anthropic API directa (@anthropic-ai/sdk).
 * Requiere ANTHROPIC_API_KEY en el entorno (sección 7.2).
 *
 * Fase 1: solo extractProfile está implementado de verdad. analyzeJob, tailorCV
 * y generateCoverLetter se completan en las Fases 4 y 5.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  ClaudeConnectorError,
  type ClaudeConnector,
  type ExtractProfileInput,
  type GenerateCoverLetterInput,
  type JobAnalysis,
  type TailorCVInput,
  type TailoredContent,
} from "@/lib/claude/connector.interface";
import {
  EXTRACT_PROFILE_SYSTEM_PROMPT,
  EXTRACT_PROFILE_USER_PROMPT,
} from "@/lib/claude/prompts";
import {
  profileDraftSchema,
  type ProfileDraft,
} from "@/lib/validation/profile.zod";

const DEFAULT_MODEL = "claude-sonnet-5";
const EXTRACTION_MAX_TOKENS = 16000;

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new ClaudeConnectorError(
      "Falta ANTHROPIC_API_KEY. Configúrala en .env para usar el modo API " +
        "(o cambia CLAUDE_MODE a 'agent' si prefieres usar Claude Code sin API key).",
    );
  }
  return key;
}

function getModel(): string {
  return process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function imageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mime = IMAGE_MIME_BY_EXT[ext];
  if (!mime) {
    throw new ClaudeConnectorError(
      `Formato de imagen no soportado: "${ext}" (archivo: ${filePath}). ` +
        `Formatos soportados: ${Object.keys(IMAGE_MIME_BY_EXT).join(", ")}.`,
    );
  }
  return mime;
}

/**
 * Extrae el primer objeto JSON balanceado que aparezca en el texto de
 * respuesta. Claude puede, a pesar de la instrucción, envolver el JSON en
 * texto o un bloque de código markdown — esto lo tolera sin fallar.
 */
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  if (start === -1) {
    throw new ClaudeConnectorError(
      "La respuesta de Claude no contiene un objeto JSON reconocible.",
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
    "La respuesta de Claude tiene un objeto JSON sin cerrar (posiblemente truncado por max_tokens).",
  );
}

export class ApiConnector implements ClaudeConnector {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: getApiKey() });
    this.model = getModel();
  }

  async extractProfile(input: ExtractProfileInput): Promise<ProfileDraft> {
    let pdfBase64: string;
    try {
      const pdfBuffer = await readFile(input.pdfPath);
      pdfBase64 = pdfBuffer.toString("base64");
    } catch (err) {
      throw new ClaudeConnectorError(
        `No se pudo leer el PDF en "${input.pdfPath}". Verifica que el archivo exista.`,
        err,
      );
    }

    const imageBlocks: Anthropic.ImageBlockParam[] = [];
    for (const imagePath of input.imagePaths) {
      try {
        const mediaType = imageMimeType(imagePath);
        const buffer = await readFile(imagePath);
        imageBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as
              | "image/png"
              | "image/jpeg"
              | "image/webp"
              | "image/gif",
            data: buffer.toString("base64"),
          },
        });
      } catch (err) {
        if (err instanceof ClaudeConnectorError) throw err;
        throw new ClaudeConnectorError(
          `No se pudo leer la imagen "${imagePath}". Verifica que el archivo exista.`,
          err,
        );
      }
    }

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: EXTRACTION_MAX_TOKENS,
        system: EXTRACT_PROFILE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              ...imageBlocks,
              { type: "text", text: EXTRACT_PROFILE_USER_PROMPT },
            ],
          },
        ],
      });
    } catch (err) {
      throw new ClaudeConnectorError(
        "Falló la llamada a la API de Claude durante la extracción del perfil. " +
          "Revisa tu ANTHROPIC_API_KEY, conexión de red, o si el PDF es demasiado grande.",
        err,
      );
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new ClaudeConnectorError(
        "Claude no devolvió contenido de texto en la respuesta de extracción.",
      );
    }

    let rawJson: string;
    let parsedJson: unknown;
    try {
      rawJson = extractJsonObject(textBlock.text);
      parsedJson = JSON.parse(rawJson);
    } catch (err) {
      throw new ClaudeConnectorError(
        "No se pudo interpretar la respuesta de Claude como JSON válido. " +
          "Esto puede pasar si el CV es muy largo y la respuesta se truncó.",
        err,
      );
    }

    const result = profileDraftSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new ClaudeConnectorError(
        `El JSON devuelto por Claude no cumple la forma esperada del perfil: ${result.error.message}`,
        result.error,
      );
    }

    return result.data;
  }

  async analyzeJob(): Promise<JobAnalysis> {
    throw new ClaudeConnectorError(
      "analyzeJob todavía no está implementado (llega en la Fase 4 del roadmap).",
    );
  }

  async tailorCV(_input: TailorCVInput): Promise<TailoredContent> {
    throw new ClaudeConnectorError(
      "tailorCV todavía no está implementado (llega en la Fase 4 del roadmap).",
    );
  }

  async generateCoverLetter(_input: GenerateCoverLetterInput): Promise<string> {
    throw new ClaudeConnectorError(
      "generateCoverLetter todavía no está implementado (llega en la Fase 5 del roadmap).",
    );
  }
}
