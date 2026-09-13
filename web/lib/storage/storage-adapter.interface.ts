/**
 * Contrato común de persistencia entre modo local (filesystem, hoy) y modo
 * hosteado (Supabase, #14) -- mismo patrón que `ClaudeConnector`
 * (connector.interface.ts) entre los dos modos de conexión con Claude:
 * el resto del sistema (rutas de API, generation-pipeline.ts) no necesita
 * saber cuál de los dos está activo, solo depende de esta interfaz.
 *
 * Decisión de diseño tomada con el usuario y documentada en el issue #13:
 * el `.tex` editable (editor LaTeX avanzado, sección 8.2) es contenido de
 * la fila -- columnas de texto en modo hosteado (`cvTex`/`coverLetterTex`
 * en `applications`, junto a `tailoredContent`), no un archivo aparte --
 * igual criterio que `jobDescription` y la metadata. El PDF compilado sí es
 * un binario real: en modo local se lee del filesystem, en modo hosteado se
 * resuelve a una URL firmada de corta duración (#10) -- por eso
 * `getApplicationPdf` devuelve una de dos formas posibles en vez de bytes
 * siempre (`ApplicationPdfSource`).
 *
 * Las operaciones de la cola de jobs (análisis → tailoring → render →
 * compile) NO viven acá a propósito: son mecanismo de ejecución (cola en
 * memoria vs. QStash), no persistencia de un registro, y el issue #15 ya las
 * scoped por separado ("en modo local se mantiene la cola en memoria actual
 * sin cambios, mismo StorageAdapter/modo, comportamiento intacto").
 */
import type { Profile, ProfileInput } from "@/lib/validation/profile.zod";

export type ApplicationLanguage = "es" | "en";
export type ApplicationTemplateVariant = "ats" | "visual";
export type ApplicationCoverLetterKind = "none" | "pdf" | "text";
export type ApplicationClaudeMode = "api" | "agent";

/** Misma forma que antes en apps-io.ts -- se mueve el "dueño" del tipo acá, apps-io.ts la re-exporta. */
export interface ApplicationMetadata {
  company: string;
  role: string;
  language: ApplicationLanguage;
  claudeMode: ApplicationClaudeMode;
  claudeModel?: string;
  templateVariant: ApplicationTemplateVariant;
  pages: number;
  recommendedMaxPages: number;
  forcedTrim: boolean;
  createdAt: string;
  coverLetter: ApplicationCoverLetterKind;
}

export interface ApplicationSummary extends ApplicationMetadata {
  slug: string;
}

/** Registro completo de una aplicación -- lo que antes eran los archivos sueltos de apps/{slug}/. */
export interface ApplicationRecord {
  slug: string;
  metadata: ApplicationMetadata;
  jobDescription: string;
  cvTex: string;
  coverLetterTex?: string;
  coverLetterText?: string;
}

/**
 * Patch parcial sobre una aplicación existente: cada campo presente se
 * persiste (archivo propio en modo local, columna/celda propia en modo
 * hosteado); `metadata` se fusiona con la existente, nunca la reemplaza.
 */
export interface ApplicationPatch {
  metadata?: Partial<ApplicationMetadata>;
  jobDescription?: string;
  cvTex?: string;
  coverLetterTex?: string;
  coverLetterText?: string;
}

export type ApplicationPdfFile = "cv" | "cover_letter";

/**
 * Dónde encontrar el PDF ya compilado. `bytes` en modo local (tectonic ya
 * lo dejó en el filesystem, se lee y se transmite directo); `redirect` en
 * modo hosteado (URL firmada, #10) -- la ruta que llama decide qué hacer
 * con cada forma explícitamente, nunca asume que siempre es una de las dos.
 */
export type ApplicationPdfSource = { kind: "bytes"; data: Buffer } | { kind: "redirect"; url: string };

export class StorageAdapterError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StorageAdapterError";
  }
}

export interface StorageAdapter {
  // -- Perfil (#7 profiles / data/profile.json) --
  getProfile(): Promise<Profile | null>;
  saveProfile(profile: ProfileInput): Promise<Profile>;
  getProfileDraft(): Promise<unknown | null>;
  saveProfileDraft(draft: unknown): Promise<void>;
  /**
   * Semilla para el Módulo 1 (extracción): PDF + imágenes de apoyo. Solo
   * tiene sentido tal cual en modo local (data/raw/) -- en modo hosteado el
   * onboarding de perfil (#26) tendrá su propio flujo de subida, todavía sin
   * diseñar, así que por ahora esto queda fuera de alcance de #13/#14.
   */
  findProfileSeedFiles(): Promise<{ pdfPath: string; imagePaths: string[] }>;

  // -- Aplicaciones (#8 applications / apps/{slug}/) --
  listApplications(): Promise<ApplicationSummary[]>;
  getApplication(slug: string): Promise<ApplicationRecord | null>;
  /** Reserva un slug + espacio de trabajo nuevo (carpeta en modo local, fila en modo hosteado). */
  createApplication(company: string, role: string): Promise<{ slug: string }>;
  saveApplication(slug: string, patch: ApplicationPatch): Promise<void>;
  /**
   * Directorio de trabajo real para la compilación LaTeX -- tectonic
   * necesita archivos reales en disco sin importar el modo (spike #19). En
   * modo local es `apps/{slug}/` tal cual hoy; en modo hosteado será un
   * directorio temporal por invocación (#14/#15), fuera de alcance de #13.
   */
  getApplicationDir(slug: string): Promise<string>;

  // -- PDFs generados (binarios reales, #10) --
  getApplicationPdf(slug: string, file: ApplicationPdfFile): Promise<ApplicationPdfSource | null>;
  /**
   * En modo local es un no-op documentado: el compilador ya dejó el archivo
   * en `getApplicationDir(slug)` y `getApplicationPdf` lo lee de ahí. En modo
   * hosteado (#14) sí sube el archivo al bucket privado y registra su path.
   */
  saveApplicationPdf(slug: string, file: ApplicationPdfFile, data: Buffer): Promise<void>;
}
