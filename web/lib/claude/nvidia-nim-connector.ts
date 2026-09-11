/**
 * Implementación del ClaudeConnector vía NVIDIA NIM (build.nvidia.com), usando
 * el SDK de OpenAI apuntado a su base URL (API compatible con el formato de
 * OpenAI). Requiere NVIDIA_NIM_API_KEY en el entorno.
 *
 * Existe como proveedor gratuito alternativo a Gemini (#30) -- free tier
 * permanente, sin tarjeta de crédito, catálogo de 100+ modelos open-weight --
 * ver issue #31. Reusa los mismos prompts que api-connector.ts/gemini-connector.ts.
 *
 * LIMITACIÓN REAL, documentada a propósito (no asumida): a diferencia de
 * Anthropic y Gemini, el catálogo de NIM no documenta soporte nativo de PDF
 * como "documento" -- sus modelos de visión (VLMs) aceptan IMÁGENES vía
 * image_url, no un PDF crudo. Por eso extractProfile acá SOLO funciona con
 * imagePaths; si no se pasa ninguna imagen, falla con un error explícito en
 * vez de intentar algo no verificado contra el PDF. Si esto cambia (o se
 * confirma que algún modelo del catálogo sí acepta PDF), actualizar esta nota
 * y el código junto con ella.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
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

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

// meta/llama-3.3-70b-instruct (el default original) llegó a end-of-life el
// 2026-08-26 -- confirmado contra una llamada real (410 Gone). Muchos modelos
// "grandes" del catálogo (nemotron-70b, mistral-nemotron, glm-5.3-flash, etc.)
// devuelven 404 para una cuenta NIM recién creada sin solicitar acceso aparte
// en el dashboard -- meta/llama-3.2-11b-vision-instruct sí respondió con una
// cuenta nueva sin ningún paso extra, así que es el default más seguro para
// no técnicos (además cubre texto y visión con el mismo modelo, ver abajo).
// Modelo de visión: se exige explícito (NVIDIA_NIM_VISION_MODEL) porque no
// todos los modelos del catálogo tienen capacidad multimodal -- ver nota de
// limitación arriba.
const DEFAULT_TEXT_MODEL = "meta/llama-3.2-11b-vision-instruct";

const EXTRACTION_MAX_TOKENS = 16000;
const ANALYSIS_MAX_TOKENS = 2000;
const TAILOR_MAX_TOKENS = 8000;
const COVER_LETTER_MAX_TOKENS = 2000;

// Free tier: límite de 40 requests/minuto -- reintento con backoff ante 429.
const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 2000;

function getApiKey(): string {
  const key = process.env.NVIDIA_NIM_API_KEY;
  if (!key) {
    throw new ClaudeConnectorError(
      "Falta NVIDIA_NIM_API_KEY. Consíguela gratis en https://build.nvidia.com " +
        "y configúrala en .env para usar MODEL_PROVIDER=nvidia.",
    );
  }
  return key;
}

function getTextModel(): string {
  return process.env.NVIDIA_NIM_MODEL?.trim() || DEFAULT_TEXT_MODEL;
}

function getVisionModel(): string {
  const model = process.env.NVIDIA_NIM_VISION_MODEL?.trim();
  if (!model) {
    throw new ClaudeConnectorError(
      "Falta NVIDIA_NIM_VISION_MODEL para poder usar extractProfile con NVIDIA NIM. " +
        "Elige un modelo con capacidad de visión del catálogo de build.nvidia.com " +
        "(ej. una variante de Llama 3.2 Vision o Qwen-VL) y configúralo en .env.",
    );
  }
  return model;
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

function isRateLimitError(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err) {
    if ((err as { status?: number }).status === 429) return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate.?limit/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mismo criterio de tolerancia que api-connector.ts/gemini-connector.ts. */
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  if (start === -1) {
    throw new ClaudeConnectorError(
      "La respuesta de NVIDIA NIM no contiene un objeto JSON reconocible.",
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
    "La respuesta de NVIDIA NIM tiene un objeto JSON sin cerrar (posiblemente truncado por max_tokens).",
  );
}

export class NvidiaNimConnector implements ClaudeConnector {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: getApiKey(), baseURL: NIM_BASE_URL });
  }

  private async chatWithRetry(params: {
    model: string;
    systemPrompt: string;
    userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    maxTokens: number;
    jsonMode: boolean;
  }): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: params.model,
          max_tokens: params.maxTokens,
          messages: [
            { role: "system", content: params.systemPrompt },
            { role: "user", content: params.userContent },
          ],
          ...(params.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
        });
        const text = response.choices[0]?.message?.content;
        if (!text) {
          throw new ClaudeConnectorError("NVIDIA NIM no devolvió contenido de texto en la respuesta.");
        }
        return text;
      } catch (err) {
        lastError = err;
        if (isRateLimitError(err) && attempt < MAX_RATE_LIMIT_RETRIES) {
          await sleep(RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  private async askForText(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> {
    try {
      return await this.chatWithRetry({
        model: getTextModel(),
        systemPrompt,
        userContent: [{ type: "text", text: userPrompt }],
        maxTokens,
        jsonMode: false,
      });
    } catch (err) {
      if (err instanceof ClaudeConnectorError) throw err;
      throw new ClaudeConnectorError(
        "Falló la llamada a la API de NVIDIA NIM. Revisa tu NVIDIA_NIM_API_KEY o la conexión de red.",
        err,
      );
    }
  }

  private async askForJson(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<unknown> {
    let text: string;
    try {
      text = await this.chatWithRetry({
        model: getTextModel(),
        systemPrompt,
        userContent: [{ type: "text", text: userPrompt }],
        maxTokens,
        jsonMode: true,
      });
    } catch (err) {
      if (err instanceof ClaudeConnectorError) throw err;
      throw new ClaudeConnectorError(
        "Falló la llamada a la API de NVIDIA NIM. Revisa tu NVIDIA_NIM_API_KEY o la conexión de red.",
        err,
      );
    }
    try {
      return JSON.parse(extractJsonObject(text));
    } catch (err) {
      throw new ClaudeConnectorError(
        "No se pudo interpretar la respuesta de NVIDIA NIM como JSON válido (posiblemente truncada por max_tokens).",
        err,
      );
    }
  }

  async extractProfile(input: ExtractProfileInput): Promise<ProfileDraft> {
    if (input.imagePaths.length === 0) {
      throw new ClaudeConnectorError(
        "NVIDIA NIM no soporta PDF como documento nativo (a diferencia de Anthropic/Gemini) -- " +
          "extractProfile con este proveedor requiere al menos una imagen en imagePaths. " +
          "Usa MODEL_PROVIDER=google o MODEL_PROVIDER=anthropic para extraer directo del PDF.",
      );
    }

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    for (const imagePath of input.imagePaths) {
      try {
        const mediaType = imageMimeType(imagePath);
        const buffer = await readFile(imagePath);
        userContent.push({
          type: "image_url",
          image_url: { url: `data:${mediaType};base64,${buffer.toString("base64")}` },
        });
      } catch (err) {
        if (err instanceof ClaudeConnectorError) throw err;
        throw new ClaudeConnectorError(
          `No se pudo leer la imagen "${imagePath}". Verifica que el archivo exista.`,
          err,
        );
      }
    }
    userContent.push({ type: "text", text: EXTRACT_PROFILE_USER_PROMPT });

    let text: string;
    try {
      text = await this.chatWithRetry({
        model: getVisionModel(),
        systemPrompt: EXTRACT_PROFILE_SYSTEM_PROMPT,
        userContent,
        maxTokens: EXTRACTION_MAX_TOKENS,
        jsonMode: true,
      });
    } catch (err) {
      if (err instanceof ClaudeConnectorError) throw err;
      throw new ClaudeConnectorError(
        "Falló la llamada a la API de NVIDIA NIM durante la extracción del perfil. " +
          "Revisa tu NVIDIA_NIM_API_KEY, NVIDIA_NIM_VISION_MODEL, o la conexión de red.",
        err,
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonObject(text));
    } catch (err) {
      throw new ClaudeConnectorError(
        "No se pudo interpretar la respuesta de NVIDIA NIM como JSON válido.",
        err,
      );
    }

    const result = profileDraftSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new ClaudeConnectorError(
        `El JSON devuelto por NVIDIA NIM no cumple la forma esperada del perfil: ${result.error.message}`,
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
        `El análisis de vacante devuelto por NVIDIA NIM no cumple la forma esperada: ${result.error.message}`,
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
        `El contenido adaptado devuelto por NVIDIA NIM no cumple la forma esperada: ${result.error.message}`,
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
