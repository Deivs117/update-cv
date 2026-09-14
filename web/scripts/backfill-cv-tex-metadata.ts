/**
 * Script de backfill one-off (issue #92): rellena `cvTex`, `coverLetterTex`,
 * `coverLetterText` y `metadata` en las aplicaciones que ya se migraron con
 * scripts/migrate-local-data.ts (#12) ANTES de que esas columnas existieran
 * (#14) -- verificado con una consulta real: las 51 aplicaciones migradas
 * tenían los 4 campos en NULL, incluidas las 3 con carta en texto plano
 * (blossom, ITSTK, Power Digital), que quedaron sin su carta en absoluto en
 * la versión hosteada.
 *
 * Nunca se corre automáticamente en ningún deploy -- comando manual,
 * explícito, primero contra dev/preview y solo después contra producción
 * con confirmación aparte.
 *
 * Uso:
 *   cd web && npm run backfill-cv-tex-metadata -- --email tu@correo.com [--dry-run]
 *
 * Usa el mismo `deriveId(userId:slug)` que migrate-local-data.ts para saber
 * exactamente qué fila de `applications` corresponde a cada carpeta de
 * apps/ -- no matchea por company+role (podría haber colisiones), matchea
 * por el id determinístico exacto que ya se usó para crear esa fila.
 */
import { config as loadEnv } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { applications } from "@/lib/db/schema";
import { APPS_DIR, type ApplicationMetadata } from "@/lib/apps-io";
import { deriveId } from "./lib/deterministic-id";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
loadEnv({ path: path.join(REPO_ROOT, ".env") });

function parseArgs(): { email: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf("--email");
  const email = emailIndex !== -1 ? args[emailIndex + 1] : undefined;
  if (!email) {
    console.error(
      "Falta --email. Uso: npm run backfill-cv-tex-metadata -- --email tu@correo.com [--dry-run]",
    );
    process.exit(1);
  }
  return { email, dryRun: args.includes("--dry-run") };
}

/** Mismo mecanismo que migrate-local-data.ts -- busca el usuario por email vía la Admin API, no crea cuentas. */
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
    throw new Error(`No existe ninguna cuenta con el email "${email}" en este proyecto Supabase.`);
  }
  return user.id;
}

async function main() {
  const { email, dryRun } = parseArgs();
  console.log(`Backfill de cvTex/coverLetterTex/coverLetterText/metadata -- destino: ${email}${dryRun ? " (dry-run, sin escribir)" : ""}\n`);

  const userId = await findUserIdByEmail(email);
  console.log(`Cuenta encontrada: ${userId}\n`);

  let entries: string[];
  try {
    entries = (await readdir(APPS_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    console.log("apps/ no existe -- nada que rellenar.");
    process.exit(0);
  }

  console.log(`${entries.length} carpetas en apps/ encontradas.\n`);
  const db = dryRun ? null : getDb();
  let updated = 0;
  let skippedNoRow = 0;

  for (const slug of entries) {
    const dir = path.join(APPS_DIR, slug);
    let metadata: ApplicationMetadata;
    try {
      metadata = JSON.parse(await readFile(path.join(dir, "metadata.json"), "utf-8"));
    } catch {
      console.log(`  [omitido] ${slug}: sin metadata.json válido.`);
      continue;
    }

    const appId = deriveId(`${userId}:${slug}`);
    const cvTex = await readFile(path.join(dir, "cv.tex"), "utf-8").catch(() => null);

    let coverLetterTex: string | null = null;
    let coverLetterText: string | null = null;
    if (metadata.coverLetter === "pdf") {
      coverLetterTex = await readFile(path.join(dir, "cover_letter.tex"), "utf-8").catch(() => null);
    } else if (metadata.coverLetter === "text") {
      coverLetterText = await readFile(path.join(dir, "cover_letter.txt"), "utf-8").catch(() => null);
    }

    const {
      claudeMode,
      claudeModel,
      templateVariant,
      pages,
      recommendedMaxPages,
      forcedTrim,
      coverLetter,
    } = metadata;
    const metadataExtra = { claudeMode, claudeModel, templateVariant, pages, recommendedMaxPages, forcedTrim, coverLetter };

    console.log(
      `  - ${slug}: cvTex=${cvTex ? "sí" : "no"}, coverLetterTex=${coverLetterTex ? "sí" : "no"}, ` +
        `coverLetterText=${coverLetterText ? "sí" : "no"}`,
    );
    if (dryRun) continue;

    const result = await db!
      .update(applications)
      .set({ cvTex, coverLetterTex, coverLetterText, metadata: metadataExtra })
      .where(eq(applications.id, appId))
      .returning({ id: applications.id });

    if (result.length === 0) {
      // La carpeta existe localmente pero nunca se migró a esta cuenta (ej.
      // se creó después de correr #12 la última vez) -- no es un error, no
      // hay fila que rellenar todavía.
      console.log(`    [sin fila] no existe applications.id=${appId} para esta cuenta -- se omite.`);
      skippedNoRow++;
      continue;
    }
    updated++;
  }

  console.log(`\nListo. ${dryRun ? `${entries.length} carpetas revisadas (dry-run).` : `${updated} filas actualizadas, ${skippedNoRow} omitidas (sin fila migrada todavía).`}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});
