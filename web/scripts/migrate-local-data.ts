/**
 * Script de migración one-off (issue #12): sube data/profile.json y las
 * carpetas de apps/ existentes al modo hosteado (Supabase) construido en
 * #7-#11. Nunca se corre automáticamente en ningún deploy -- es un comando
 * manual, explícito, que el dueño del repo corre una sola vez por entorno
 * (primero contra dev/preview, después contra producción si aplica).
 *
 * Requiere DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY en el entorno
 * (mismas variables que #8-#10) apuntando al proyecto destino.
 *
 * Uso:
 *   cd web && npm run migrate-local-data -- --email tu@correo.com [--dry-run]
 *
 * El usuario destino debe existir ya en Supabase Auth (haber iniciado
 * sesión con Google al menos una vez, ver #11) -- este script NO crea
 * cuentas, solo asocia los datos locales a una cuenta ya existente.
 */
import { config as loadEnv } from "dotenv";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/lib/db/client";
import { applications, profiles } from "@/lib/db/schema";
import { readProfile } from "@/lib/profile-io";
import { uploadGeneratedPdf } from "@/lib/storage/supabase-storage";
import { APPS_DIR, type ApplicationMetadata } from "@/lib/apps-io";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
loadEnv({ path: path.join(REPO_ROOT, ".env") });

function parseArgs(): { email: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf("--email");
  const email = emailIndex !== -1 ? args[emailIndex + 1] : undefined;
  if (!email) {
    console.error(
      "Falta --email. Uso: npm run migrate-local-data -- --email tu@correo.com [--dry-run]",
    );
    process.exit(1);
  }
  return { email, dryRun: args.includes("--dry-run") };
}

/** Deriva un id determinístico (formato UUID) de un slug -- reintentar el script no duplica filas. */
function deriveId(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Busca el usuario de Supabase Auth por email vía la Admin API (no crea cuentas). */
async function findUserIdByEmail(email: string): Promise<string> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL/SUPABASE_SECRET_KEY en el entorno.");
  }

  const res = await fetch(`${url}/auth/v1/admin/users`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });
  if (!res.ok) {
    throw new Error(`No se pudo listar usuarios: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { users: { id: string; email?: string }[] };
  const user = body.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    throw new Error(
      `No existe ninguna cuenta con el email "${email}" en este proyecto Supabase. ` +
        `Inicia sesión con Google al menos una vez (ver #11) antes de correr esta migración.`,
    );
  }
  return user.id;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

async function migrateProfile(userId: string, dryRun: boolean): Promise<void> {
  const profile = await readProfile();
  if (!profile) {
    console.log("data/profile.json no existe -- se omite la migración del perfil.");
    return;
  }

  console.log(`Perfil: ${profile.personal?.full_name ?? "(sin nombre)"}`);
  if (dryRun) return;

  const db = getDb();
  await db
    .insert(profiles)
    .values({ id: userId, data: profile })
    .onConflictDoUpdate({ target: profiles.id, set: { data: profile, updatedAt: new Date() } });
  console.log("  -> guardado en profiles.");
}

async function migrateApplications(userId: string, dryRun: boolean): Promise<void> {
  let entries: string[];
  try {
    entries = (await readdir(APPS_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    console.log("apps/ no existe -- nada que migrar.");
    return;
  }

  console.log(`\n${entries.length} carpetas en apps/ encontradas.`);
  const db = dryRun ? null : getDb();

  for (const slug of entries) {
    const dir = path.join(APPS_DIR, slug);
    let metadata: ApplicationMetadata;
    try {
      metadata = JSON.parse(await readFile(path.join(dir, "metadata.json"), "utf-8"));
    } catch {
      console.log(`  [omitido] ${slug}: sin metadata.json válido.`);
      continue;
    }

    const jobDescription = await readFile(path.join(dir, "job_description.txt"), "utf-8").catch(
      () => "",
    );

    const appId = deriveId(`${userId}:${slug}`);
    const company = metadata.company.trim();
    const role = metadata.role.trim();

    console.log(`  - ${slug} (${company} / ${role})`);
    if (dryRun) continue;

    let cvPdfPath: string | null = null;
    const cvLocalPath = path.join(dir, "cv.pdf");
    if (await fileExists(cvLocalPath)) {
      cvPdfPath = `${userId}/${appId}/cv.pdf`;
      await uploadGeneratedPdf(cvPdfPath, await readFile(cvLocalPath));
    }

    let coverLetterPdfPath: string | null = null;
    if (metadata.coverLetter === "pdf") {
      const clLocalPath = path.join(dir, "cover_letter.pdf");
      if (await fileExists(clLocalPath)) {
        coverLetterPdfPath = `${userId}/${appId}/cover_letter.pdf`;
        await uploadGeneratedPdf(coverLetterPdfPath, await readFile(clLocalPath));
      }
    }
    // coverLetter === "text": el contenido vive solo en cover_letter.txt local;
    // el schema de applications (#8) no tiene una columna para texto plano de
    // carta -- se omite a propósito, no es un dato crítico como el CV mismo.

    await db!
      .insert(applications)
      .values({
        id: appId,
        userId,
        company,
        role,
        language: metadata.language,
        status: "done",
        jobDescription,
        tailoredContent: null,
        cvPdfPath,
        coverLetterPdfPath,
        createdAt: new Date(metadata.createdAt),
      })
      .onConflictDoUpdate({
        target: applications.id,
        set: { company, role, language: metadata.language, jobDescription, cvPdfPath, coverLetterPdfPath },
      });
    console.log(`    -> guardada (cv: ${cvPdfPath ? "sí" : "no"}, carta: ${coverLetterPdfPath ? "sí" : "no"}).`);
  }
}

async function main() {
  const { email, dryRun } = parseArgs();
  console.log(`Migración de datos locales -- destino: ${email}${dryRun ? " (dry-run, sin escribir)" : ""}\n`);

  const userId = await findUserIdByEmail(email);
  console.log(`Cuenta encontrada: ${userId}\n`);

  await migrateProfile(userId, dryRun);
  await migrateApplications(userId, dryRun);

  console.log("\nListo.");
  process.exit(0);
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});
