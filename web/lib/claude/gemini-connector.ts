/**
 * Implementación del ClaudeConnector vía Google Gemini (AI Studio, @google/genai).
 * Requiere GOOGLE_API_KEY en el entorno.
 *
 * Existe porque el free tier de Gemini es real, sin tarjeta de crédito, y es
 * multimodal (cubre extractProfile, que necesita leer PDF+imágenes) — ver
 * issue #30. Reusa los mismos prompts que api-connector.ts (paridad de
 * comportamiento entre proveedores, mismo criterio que exige CLAUDE.md entre
 * modo API y modo Agente).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
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

const DEFAULT_MODEL = "gemini-2.5-flash";
const EXTRACTION_MAX_TOKENS = 16000;
const ANALYSIS_MAX_TOKENS = 2000;
const TAILOR_MAX_TOKENS = 8000;
const COVER_LETTER_MAX_TOKENS = 2000;

// Reintentos ante 429 (rate limit) del free tier -- ver issue #30. Backoff
// exponencial simple, no hace falta nada más sofisticado para el volumen de
// uso de este sistema.
const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 2000;

function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new ClaudeConnectorError(
      "Falta GOOGLE_API_KEY. Consíguela gratis en https://aistudio.google.com/apikey " +
        "y configúrala en .env para usar MODEL_PROVIDER=google.",
    );
  }
  return key;
}

function getModel(): string {
  return process.env.GOOGLE_MODEL?.trim() || DEFAULT_MODEL;
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

/** Detecta si un error de la API de Gemini es un rate limit (429 / RESOURCE_EXHAUSTED). */
function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b429\b|RESOURCE_EXHAUSTED|rate.?limit/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extrae el primer objeto JSON balanceado que aparezca en el texto de
 * respuesta (mismo criterio de tolerancia que api-connector.ts: el modelo
 * puede envolver el JSON en texto o un bloque de código markdown a pesar de
 * la instrucción de salida estricta).
 */
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  if (start === -1) {
    throw new ClaudeConnectorError(
      "La respuesta de Gemini no contiene un objeto JSON reconocible.",
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
    "La respuesta de Gemini tiene un objeto JSON sin cerrar (posiblemente truncado por maxOutputTokens).",
  );
}

type GenAIPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export class GeminiConnector implements ClaudeConnector {
  private client: GoogleGenAI;
  private model: string;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: getApiKey() });
    this.model = getModel();
  }

  /** generateContent con reintento ante 429, para no propagar un rate limit transitorio como error final. */
  private async generateWithRetry(params: {
    systemInstruction: string;
    parts: GenAIPart[];
    maxOutputTokens: number;
    jsonMode: boolean;
  }): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents: [{ role: "user", parts: params.parts }],
          config: {
            systemInstruction: params.systemInstruction,
            maxOutputTokens: params.maxOutputTokens,
            ...(params.jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        });
        const text = response.text;
        if (!text) {
          throw new ClaudeConnectorError("Gemini no devolvió contenido de texto en la respuesta.");
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

  private async askForText(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
  ): Promise<string> {
    try {
      return await this.generateWithRetry({
        systemInstruction: systemPrompt,
        parts: [{ text: userPrompt }],
        maxOutputTokens: maxTokens,
        jsonMode: false,
      });
    } catch (err) {
      if (err instanceof ClaudeConnectorError) throw err;
      throw new ClaudeConnectorError(
        "Falló la llamada a la API de Gemini. Revisa tu GOOGLE_API_KEY o la conexión de red.",
        err,
      );
    }
  }

  private async askForJson(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
  ): Promise<unknown> {
    let text: string;
    try {
      text = await this.generateWithRetry({
        systemInstruction: systemPrompt,
        parts: [{ text: userPrompt }],
        maxOutputTokens: maxTokens,
        jsonMode: true,
      });
    } catch (err) {
      if (err instanceof ClaudeConnectorError) throw err;
      throw new ClaudeConnectorError(
        "Falló la llamada a la API de Gemini. Revisa tu GOOGLE_API_KEY o la conexión de red.",
        err,
      );
    }
    try {
      return JSON.parse(extractJsonObject(text));
    } catch (err) {
      throw new ClaudeConnectorError(
        "No se pudo interpretar la respuesta de Gemini como JSON válido (posiblemente truncada por maxOutputTokens).",
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

    const parts: GenAIPart[] = [
      { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
    ];

    for (const imagePath of input.imagePaths) {
      try {
        const mediaType = imageMimeType(imagePath);
        const buffer = await readFile(imagePath);
        parts.push({ inlineData: { mimeType: mediaType, data: buffer.toString("base64") } });
      } catch (err) {
        if (err instanceof ClaudeConnectorError) throw err;
        throw new ClaudeConnectorError(
          `No se pudo leer la imagen "${imagePath}". Verifica que el archivo exista.`,
          err,
        );
      }
    }
    parts.push({ text: EXTRACT_PROFILE_USER_PROMPT });

    let text: string;
    try {
      text = await this.generateWithRetry({
        systemInstruction: EXTRACT_PROFILE_SYSTEM_PROMPT,
        parts,
        maxOutputTokens: EXTRACTION_MAX_TOKENS,
        jsonMode: true,
      });
    } catch (err) {
      if (err instanceof ClaudeConnectorError) throw err;
      throw new ClaudeConnectorError(
        "Falló la llamada a la API de Gemini durante la extracción del perfil. " +
          "Revisa tu GOOGLE_API_KEY, conexión de red, o si el PDF es demasiado grande.",
        err,
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonObject(text));
    } catch (err) {
      throw new ClaudeConnectorError(
        "No se pudo interpretar la respuesta de Gemini como JSON válido. " +
          "Esto puede pasar si el CV es muy largo y la respuesta se truncó.",
        err,
      );
    }

    const result = profileDraftSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new ClaudeConnectorError(
        `El JSON devuelto por Gemini no cumple la forma esperada del perfil: ${result.error.message}`,
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
        `El análisis de vacante devuelto por Gemini no cumple la forma esperada: ${result.error.message}`,
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
        `El contenido adaptado devuelto por Gemini no cumple la forma esperada: ${result.error.message}`,
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
