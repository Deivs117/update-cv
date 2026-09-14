/**
 * Script de reconciliación one-off (issue #91): "bautiza" en
 * `drizzle.__drizzle_migrations` las migraciones que ya están aplicadas al
 * schema real (el proyecto se actualizó siempre con `drizzle-kit push`,
 * nunca `drizzle-kit migrate` -- esa tabla estaba vacía pese a que el
 * schema ya reflejaba las 5 migraciones locales).
 *
 * Mecanismo exacto que usa Drizzle Kit internamente (leído de
 * node_modules/drizzle-orm/{migrator,pg-core/dialect}.js -- no hay comando
 * nativo de "baseline", así que se reproduce a mano):
 * - Tabla `drizzle.__drizzle_migrations (id SERIAL, hash text, created_at bigint)`.
 * - `hash` = sha256 del CONTENIDO COMPLETO del archivo .sql (antes de
 *   partirlo por `--> statement-breakpoint`), NO de un statement individual.
 * - `created_at` = el campo `when` de esa migración en meta/_journal.json.
 * - `drizzle-kit migrate` solo compara contra el `created_at` de la ÚLTIMA
 *   fila (`order by created_at desc limit 1`) -- pero se insertan las 5
 *   filas igual (una por migración real) para que la tabla sea un historial
 *   fiel, no un atajo de una sola fila.
 *
 * NUNCA vuelve a ejecutar el SQL de las migraciones -- el schema real ya lo
 * tiene aplicado (verificado antes de correr esto). Solo escribe el
 * registro que debería haber existido desde el principio.
 *
 * Uso: cd web && npm run baseline-migrations -- [--dry-run]
 */
import { config as loadEnv } from "dotenv";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
loadEnv({ path: path.join(REPO_ROOT, ".env") });

const MIGRATIONS_DIR = path.join(__dirname, "..", "drizzle");

interface JournalEntry {
  when: number;
  tag: string;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Bautizando el historial de migraciones${dryRun ? " (dry-run, sin escribir)" : ""}\n`);

  const journal = JSON.parse(
    await readFile(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf-8"),
  ) as { entries: JournalEntry[] };

  const rows: { hash: string; createdAt: number; tag: string }[] = [];
  for (const entry of journal.entries) {
    const sqlContent = await readFile(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf-8");
    const hash = createHash("sha256").update(sqlContent).digest("hex");
    rows.push({ hash, createdAt: entry.when, tag: entry.tag });
    console.log(`  - ${entry.tag}: hash=${hash.slice(0, 12)}... created_at=${entry.when}`);
  }

  if (dryRun) {
    console.log("\nDry-run: no se escribió nada.");
    process.exit(0);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Falta DATABASE_URL en el entorno.");
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    // Mismo DDL que crea drizzle-orm internamente (pg-core/dialect.js) --
    // CREATE ... IF NOT EXISTS, no destruye nada si ya existiera.
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `;

    const existing = await sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
    if (existing[0].count > 0) {
      throw new Error(
        `drizzle.__drizzle_migrations ya tiene ${existing[0].count} fila(s) -- este script es para bautizar ` +
          `una tabla vacía. Si de verdad hace falta re-bautizar, vaciala a mano primero y confirmá qué migraciones ` +
          `están realmente aplicadas antes de volver a correr esto.`,
      );
    }

    for (const row of rows) {
      await sql`
        INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at")
        VALUES (${row.hash}, ${row.createdAt})
      `;
      console.log(`  -> insertada fila para ${row.tag}.`);
    }

    console.log(`\nListo. ${rows.length} migraciones bautizadas.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});
