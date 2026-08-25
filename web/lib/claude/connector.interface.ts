/**
 * Contrato común entre los dos modos de conexión con Claude (sección 7.4):
 * - api-connector.ts: llamada directa vía @anthropic-ai/sdk (Fase 1+).
 * - agent-connector.ts: handoff vía buzón .claude-tasks/ a Claude Code (Fase 6).
 *
 * El resto del sistema (editor, motor de generación) no necesita saber cuál
 * de los dos modos está activo: solo depende de esta interfaz.
 */
import type { Profile, ProfileDraft } from "@/lib/validation/profile.zod";

export type Language = "es" | "en";

export interface ExtractProfileInput {
  pdfPath: string;
  imagePaths: string[];
}

export interface JobAnalysis {
  required_technical_skills: string[];
  soft_skills: string[];
  sector_keywords: string[];
  seniority: string;
}

export interface TailoredBullet {
  id: string;
  text: string;
  keywords: string[];
}

export interface TailoredExperience {
  id: string;
  company: string;
  role: string;
  start_date: string;
  end_date?: string;
  location?: string;
  bullets: TailoredBullet[];
}

export interface TailoredProject {
  id: string;
  name: string;
  date?: string;
  bullets: TailoredBullet[];
}

export interface TailoredContent {
  summary: string;
  experience: TailoredExperience[];
  projects: TailoredProject[];
  technical_skills: { category: string; items: string[] }[];
  soft_skills: string[];
}

export interface TailorCVInput {
  profile: Profile;
  jobDescription: string;
  language: Language;
  maxPages: number;
  jobAnalysis?: JobAnalysis;
}

export interface GenerateCoverLetterInput {
  profile: Profile;
  jobDescription: string;
  language: Language;
  jobAnalysis?: JobAnalysis;
}

/**
 * Error específico de llamadas a Claude, para que la UI pueda mostrar un
 * mensaje entendible en vez de un stack trace crudo (regla 4 del encargo).
 */
export class ClaudeConnectorError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ClaudeConnectorError";
  }
}

export interface ClaudeConnector {
  extractProfile(input: ExtractProfileInput): Promise<ProfileDraft>;
  analyzeJob(input: {
    jobDescription: string;
  }): Promise<JobAnalysis>;
  tailorCV(input: TailorCVInput): Promise<TailoredContent>;
  generateCoverLetter(input: GenerateCoverLetterInput): Promise<string>;
}
