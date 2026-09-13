/**
 * Implementación del ClaudeConnector vía Anthropic API directa (@anthropic-ai/sdk).
 * Requiere ANTHROPIC_API_KEY en el entorno (sección 7.2).
 *
 * extractProfile (Fase 1), analyzeJob/tailorCV (Fase 4) y generateCoverLetter
 * (Fase 5) están todos implementados. agent-connector.ts (modo Agente, Fase 6)
 * debe mantener paridad de comportamiento con este archivo.
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
  ANALYZE_JOB_SYSTEM_PROMPT,
  buildAnalyzeJobUserPrompt,
  buildCoverLetterUserPrompt,
  buildTailorCVUserPrompt,
  COVER_LETTER_SYSTEM_PROMPT,
  EXTRACT_PROFILE_SYSTEM_PROMPT,
  EXTRACT_PROFILE_USER_PROMPT,
  TAILOR_CV_SYSTEM_PROMPT,
} from "@/lib/claude/prompts";
import {
  profileDraftSchema,
  type ProfileDraft,
} from "@/lib/validation/profile.zod";
import { jobAnalysisSchema, tailorRawResponseSchema } from "@/lib/validation/generation.zod";
import { buildCandidateContent, resolveTailoredContent } from "@/lib/tailoring";
import { extractJsonObject as extractJsonObjectShared } from "@/lib/claude/extract-json-object";

const DEFAULT_MODEL = "claude-sonnet-5";
const EXTRACTION_MAX_TOKENS = 16000;
const ANALYSIS_MAX_TOKENS = 2000;
const TAILOR_MAX_TOKENS = 8000;
const COVER_LETTER_MAX_TOKENS = 2000;

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
  return extractJsonObjectShared(text, { providerLabel: "Claude", truncationParam: "max_tokens" });
}

export class ApiConnector implements ClaudeConnector {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: getApiKey() });
    this.model = getModel();
  }

  /** Llama a Claude con un system+user prompt y devuelve el texto crudo de la respuesta. */
  private async askForText(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
  ): Promise<string> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
    } catch (err) {
      throw new ClaudeConnectorError(
        "Falló la llamada a la API de Claude. Revisa tu ANTHROPIC_API_KEY o la conexión de red.",
        err,
      );
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new ClaudeConnectorError("Claude no devolvió contenido de texto en la respuesta.");
    }
    return textBlock.text;
  }

  /** Llama a Claude con un system+user prompt y devuelve el JSON parseado de la respuesta. */
  private async askForJson(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
  ): Promise<unknown> {
    const text = await this.askForText(systemPrompt, userPrompt, maxTokens);
    try {
      return JSON.parse(extractJsonObject(text));
    } catch (err) {
      throw new ClaudeConnectorError(
        "No se pudo interpretar la respuesta de Claude como JSON válido (posiblemente truncada por max_tokens).",
        err,
      );
    }
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

  async analyzeJob(input: { jobDescription: string }): Promise<JobAnalysis> {
    if (!input.jobDescription.trim()) {
      throw new ClaudeConnectorError("La descripción de la vacante está vacía.");
    }

    const json = await this.askForJson(
      ANALYZE_JOB_SYSTEM_PROMPT,
      buildAnalyzeJobUserPrompt(input.jobDescription),
      ANALYSIS_MAX_TOKENS,
    );

    const result = jobAnalysisSchema.safeParse(json);
    if (!result.success) {
      throw new ClaudeConnectorError(
        `El análisis de vacante devuelto por Claude no cumple la forma esperada: ${result.error.message}`,
        result.error,
      );
    }
    return result.data;
  }

  async tailorCV(input: TailorCVInput): Promise<TailoredContent> {
    const jobAnalysis = input.jobAnalysis ?? (await this.analyzeJob({ jobDescription: input.jobDescription }));
    const candidateContent = buildCandidateContent(input.profile, input.language);

    const json = await this.askForJson(
      TAILOR_CV_SYSTEM_PROMPT,
      buildTailorCVUserPrompt({
        candidateContentJson: JSON.stringify(candidateContent),
        jobDescription: input.jobDescription,
        jobAnalysisJson: JSON.stringify(jobAnalysis),
        recommendedMaxPages: input.maxPages,
        language: input.language,
      }),
      TAILOR_MAX_TOKENS,
    );

    const result = tailorRawResponseSchema.safeParse(json);
    if (!result.success) {
      throw new ClaudeConnectorError(
        `El contenido adaptado devuelto por Claude no cumple la forma esperada: ${result.error.message}`,
        result.error,
      );
    }

    return resolveTailoredContent(input.profile, input.language, result.data);
  }

  async generateCoverLetter(input: GenerateCoverLetterInput): Promise<string> {
    const jobAnalysis = input.jobAnalysis ?? (await this.analyzeJob({ jobDescription: input.jobDescription }));
    const candidateContent = buildCandidateContent(input.profile, input.language);

    const text = await this.askForText(
      COVER_LETTER_SYSTEM_PROMPT,
      buildCoverLetterUserPrompt({
        candidateContentJson: JSON.stringify(candidateContent),
        jobDescription: input.jobDescription,
        jobAnalysisJson: JSON.stringify(jobAnalysis),
        company: input.company,
        role: input.role,
        language: input.language,
      }),
      COVER_LETTER_MAX_TOKENS,
    );

    return text.trim();
  }
}
