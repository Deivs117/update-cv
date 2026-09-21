/**
 * Implementación en modo hosteado (#14): mismo contrato que
 * `FilesystemStorageAdapter`, pero contra Supabase (Postgres vía Drizzle +
 * el bucket privado de Storage) en vez del filesystem.
 *
 * Aislamiento entre cuentas: `getDb()` (lib/db/client.ts) es una conexión
 * directa con el connection string de `DATABASE_URL` (típicamente el rol
 * `postgres.<ref>` del pooler de Supabase), NO la sesión del usuario final --
 * no hay garantía de que RLS aplique desde acá. Por eso cada query de esta
 * clase filtra EXPLÍCITAMENTE por `userId` en el WHERE, sin excepción --
 * ver la discusión de diseño del issue #14.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { applications, profiles, type Application } from "@/lib/db/schema";
import { getSignedPdfUrl, uploadGeneratedPdf } from "@/lib/storage/supabase-storage";
import { profileSchema, type Profile, type ProfileInput } from "@/lib/validation/profile.zod";
import type {
  ApplicationLanguage,
  ApplicationMetadata,
  ApplicationPatch,
  ApplicationPdfFile,
  ApplicationPdfSource,
  ApplicationRecord,
  ApplicationSummary,
  StorageAdapter,
} from "@/lib/storage/storage-adapter.interface";
import { StorageAdapterError } from "@/lib/storage/storage-adapter.interface";

/**
 * Resto de `ApplicationMetadata` sin columna propia en `applications`
 * (ver el comentario junto a la columna `metadata` en lib/db/schema.ts).
 */
type ApplicationMetadataExtra = Pick<
  ApplicationMetadata,
  "claudeMode" | "claudeModel" | "templateVariant" | "pages" | "recommendedMaxPages" | "forcedTrim" | "coverLetter"
>;

const DEFAULT_METADATA_EXTRA: ApplicationMetadataExtra = {
  claudeMode: "api",
  templateVariant: "ats",
  pages: 0,
  recommendedMaxPages: 0,
  forcedTrim: false,
  coverLetter: "none",
};

function toApplicationMetadata(row: Application): ApplicationMetadata {
  const extra = { ...DEFAULT_METADATA_EXTRA, ...((row.metadata as Partial<ApplicationMetadataExtra>) ?? {}) };
  return {
    company: row.company,
    role: row.role,
    language: row.language as ApplicationLanguage,
    createdAt: row.createdAt.toISOString(),
    ...extra,
  };
}

function toApplicationSummary(row: Application): ApplicationSummary {
  return { ...toApplicationMetadata(row), slug: row.id };
}

export class SupabaseStorageAdapter implements StorageAdapter {
  /**
   * Directorios temporales de compilación (#14, punto 3), cacheados por slug
   * dentro de la instancia -- llamadas repetidas dentro del mismo request
   * reusan el mismo dir. TODO: sin limpieza automática todavía (no bloquea
   * este ticket, ver instrucciones del issue).
   */
  private readonly tempDirsBySlug = new Map<string, string>();

  constructor(private readonly userId: string) {}

  async getProfile(): Promise<Profile | null> {
    const rows = await getDb().select().from(profiles).where(eq(profiles.id, this.userId)).limit(1);
    const row = rows[0];
    // La fila se crea vacía ({}) por el trigger on_auth_user_created al
    // primer login (#11) -- eso es "todavía sin perfil", no un perfil roto.
    if (!row || !row.data || Object.keys(row.data as object).length === 0) return null;

    const result = profileSchema.safeParse(row.data);
    if (!result.success) {
      throw new StorageAdapterError(
        `El perfil guardado en Supabase no cumple el schema esperado: ${result.error.message}`,
        result.error,
      );
    }
    return result.data;
  }

  async saveProfile(profile: ProfileInput): Promise<Profile> {
    const withMeta = {
      ...profile,
      meta: {
        schema_version: profile.meta?.schema_version || "1.0",
        last_updated: new Date().toISOString(),
      },
    };
    const result = profileSchema.safeParse(withMeta);
    if (!result.success) {
      throw new StorageAdapterError(
        `El perfil no cumple el schema esperado, no se guardó: ${result.error.message}`,
        result.error,
      );
    }

    await getDb()
      .insert(profiles)
      .values({ id: this.userId, data: result.data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { data: result.data, updatedAt: new Date() },
      });

    return result.data;
  }

  async getProfileDraft(): Promise<unknown | null> {
    throw new StorageAdapterError(
      "No implementado en modo hosteado todavía (ver #26, onboarding de perfil hosteado sin diseñar). " +
        "Usa STORAGE_MODE=local para el flujo de extracción/borrador de perfil mientras tanto.",
    );
  }

  async saveProfileDraft(): Promise<void> {
    throw new StorageAdapterError(
      "No implementado en modo hosteado todavía (ver #26, onboarding de perfil hosteado sin diseñar). " +
        "Usa STORAGE_MODE=local para el flujo de extracción/borrador de perfil mientras tanto.",
    );
  }

  async findProfileSeedFiles(): Promise<{ pdfPath: string; imagePaths: string[] }> {
    throw new StorageAdapterError(
      "No implementado en modo hosteado todavía (ver #26, onboarding de perfil hosteado sin diseñar). " +
        "Usa STORAGE_MODE=local para extracción de perfil.",
    );
  }

  async listApplications(): Promise<ApplicationSummary[]> {
    const rows = await getDb()
      .select()
      .from(applications)
      .where(eq(applications.userId, this.userId))
      .orderBy(desc(applications.createdAt));
    return rows.map(toApplicationSummary);
  }

  async getApplication(slug: string): Promise<ApplicationRecord | null> {
    const rows = await getDb()
      .select()
      .from(applications)
      .where(and(eq(applications.id, slug), eq(applications.userId, this.userId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    const metadata = toApplicationMetadata(row);
    return {
      slug: row.id,
      metadata,
      jobDescription: row.jobDescription,
      cvTex: row.cvTex ?? "",
      coverLetterTex: row.coverLetterTex ?? undefined,
      coverLetterText: row.coverLetterText ?? undefined,
    };
  }

  async createApplication(company: string, role: string): Promise<{ slug: string }> {
    // `language`/`jobDescription` son NOT NULL en el schema pero esta firma
    // (igual que la de FilesystemStorageAdapter) no los recibe todavía --
    // generation-pipeline.ts los completa enseguida con el
    // `saveApplication(slug, { jobDescription, metadata })` que sigue justo
    // después en el mismo pipeline. Placeholders explícitos, nunca datos
    // reales inventados.
    const [row] = await getDb()
      .insert(applications)
      .values({ userId: this.userId, company, role, language: "es", jobDescription: "" })
      .returning({ id: applications.id });
    return { slug: row.id };
  }

  async saveApplication(slug: string, patch: ApplicationPatch): Promise<void> {
    // compileLatex lee cv.tex / cover_letter.tex desde getApplicationDir(slug);
    // en modo local saveApplication ya los escribe ahí, así que acá también.
    if (patch.cvTex !== undefined || patch.coverLetterTex !== undefined) {
      const dir = await this.getApplicationDir(slug);
      if (patch.cvTex !== undefined) await writeFile(path.join(dir, "cv.tex"), patch.cvTex, "utf-8");
      if (patch.coverLetterTex !== undefined) {
        await writeFile(path.join(dir, "cover_letter.tex"), patch.coverLetterTex, "utf-8");
      }
    }

    const updates: Partial<typeof applications.$inferInsert> = {};

    if (patch.jobDescription !== undefined) updates.jobDescription = patch.jobDescription;
    if (patch.cvTex !== undefined) updates.cvTex = patch.cvTex;
    if (patch.coverLetterTex !== undefined) updates.coverLetterTex = patch.coverLetterTex;
    if (patch.coverLetterText !== undefined) updates.coverLetterText = patch.coverLetterText;

    if (patch.metadata !== undefined) {
      // company/role/language tienen columna real (ya se usaban para
      // RLS/orden antes de este ticket); createdAt es inmutable (defaultNow()
      // en el INSERT) -- el resto va a la columna `metadata` (jsonb),
      // mezclado con lo que ya hubiera (ver comentario en schema.ts).
      const { company, role, language, ...extra } = patch.metadata;
      // createdAt no se propaga: es inmutable (defaultNow() en el INSERT),
      // nunca se reescribe desde un patch.
      delete extra.createdAt;
      if (company !== undefined) updates.company = company;
      if (role !== undefined) updates.role = role;
      if (language !== undefined) updates.language = language;
      if (Object.keys(extra).length > 0) {
        updates.metadata = sql`coalesce(${applications.metadata}, '{}'::jsonb) || ${JSON.stringify(extra)}::jsonb`;
      }
    }

    if (Object.keys(updates).length === 0) return;

    await getDb()
      .update(applications)
      .set(updates)
      .where(and(eq(applications.id, slug), eq(applications.userId, this.userId)));
  }

  async getApplicationDir(slug: string): Promise<string> {
    const cached = this.tempDirsBySlug.get(slug);
    if (cached) return cached;

    const dir = await mkdtemp(path.join(os.tmpdir(), "update-cv-"));
    this.tempDirsBySlug.set(slug, dir);
    return dir;
  }

  async getApplicationPdf(slug: string, file: ApplicationPdfFile): Promise<ApplicationPdfSource | null> {
    const rows = await getDb()
      .select({ cvPdfPath: applications.cvPdfPath, coverLetterPdfPath: applications.coverLetterPdfPath })
      .from(applications)
      .where(and(eq(applications.id, slug), eq(applications.userId, this.userId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    const storagePath = file === "cv" ? row.cvPdfPath : row.coverLetterPdfPath;
    if (!storagePath) return null;

    const url = await getSignedPdfUrl(storagePath);
    return { kind: "redirect", url };
  }

  async saveApplicationPdf(slug: string, file: ApplicationPdfFile, data: Buffer): Promise<void> {
    // Namespacing por userId (#14): dos aplicaciones de distintas cuentas
    // nunca chocan de nombre en el bucket, aunque compartieran slug.
    const fileName = file === "cv" ? "cv.pdf" : "cover_letter.pdf";
    const storagePath = `${this.userId}/${slug}/${fileName}`;
    await uploadGeneratedPdf(storagePath, data);

    const column = file === "cv" ? { cvPdfPath: storagePath } : { coverLetterPdfPath: storagePath };
    await getDb()
      .update(applications)
      .set(column)
      .where(and(eq(applications.id, slug), eq(applications.userId, this.userId)));
  }
}
