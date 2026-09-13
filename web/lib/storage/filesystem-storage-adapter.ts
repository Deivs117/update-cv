/**
 * Implementación en modo local (#13): envuelve la lógica ya existente de
 * profile-io.ts/apps-io.ts sin cambiar su comportamiento -- mismo patrón que
 * `ApiConnector`/`AgentConnector` envuelven la lógica ya existente de cada
 * modo de conexión con Claude.
 */
import {
  createApplicationDir,
  listApplications as listApplicationsFs,
  readApplicationPdf,
  readApplicationRecord,
  resolveApplicationDir,
  writeApplicationPatch,
} from "@/lib/apps-io";
import {
  findSeedFiles,
  readDraft,
  readProfile,
  writeDraft,
  writeProfile,
} from "@/lib/profile-io";
import type { Profile, ProfileInput } from "@/lib/validation/profile.zod";
import type {
  ApplicationPatch,
  ApplicationPdfFile,
  ApplicationPdfSource,
  ApplicationRecord,
  ApplicationSummary,
  StorageAdapter,
} from "@/lib/storage/storage-adapter.interface";

export class FilesystemStorageAdapter implements StorageAdapter {
  getProfile(): Promise<Profile | null> {
    return readProfile();
  }

  saveProfile(profile: ProfileInput): Promise<Profile> {
    return writeProfile(profile);
  }

  getProfileDraft(): Promise<unknown | null> {
    return readDraft();
  }

  saveProfileDraft(draft: unknown): Promise<void> {
    return writeDraft(draft);
  }

  findProfileSeedFiles(): Promise<{ pdfPath: string; imagePaths: string[] }> {
    return findSeedFiles();
  }

  listApplications(): Promise<ApplicationSummary[]> {
    return listApplicationsFs();
  }

  getApplication(slug: string): Promise<ApplicationRecord | null> {
    return readApplicationRecord(slug);
  }

  async createApplication(company: string, role: string): Promise<{ slug: string }> {
    const { slug } = await createApplicationDir(company, role);
    return { slug };
  }

  saveApplication(slug: string, patch: ApplicationPatch): Promise<void> {
    return writeApplicationPatch(slug, patch);
  }

  async getApplicationDir(slug: string): Promise<string> {
    return resolveApplicationDir(slug);
  }

  async getApplicationPdf(slug: string, file: ApplicationPdfFile): Promise<ApplicationPdfSource | null> {
    const data = await readApplicationPdf(slug, file);
    return data ? { kind: "bytes", data } : null;
  }

  async saveApplicationPdf(): Promise<void> {
    // No-op a propósito: en modo local, compileLatex ya deja el PDF en
    // getApplicationDir(slug)/{file}.pdf -- no hay nada más que "guardar".
  }
}
