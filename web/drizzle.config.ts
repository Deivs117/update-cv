/**
 * Config de Drizzle Kit (issue #9) -- genera/aplica migraciones SQL a partir
 * de lib/db/schema.ts. DATABASE_URL solo hace falta para `db:push`/`db:migrate`
 * contra una base real; `db:generate` (solo lee el schema) funciona sin ella.
 *
 * A diferencia de Next.js, drizzle-kit no carga el .env de la raíz del repo
 * solo -- hay que hacerlo explícito acá (confirmado probando contra una base
 * real: sin esto, DATABASE_URL llega vacío al proceso de drizzle-kit).
 */
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../.env" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // Solo gestionamos el schema "public" -- "auth" ya existe (lo gestiona
  // Supabase Auth) y solo lo referenciamos para las foreign keys de
  // user_id/profiles.id. Sin esto, drizzle-kit intenta CREATE TABLE
  // "auth"."users", que falla contra cualquier proyecto Supabase real
  // (la tabla ya existe) -- issue conocida de la comunidad Drizzle+Supabase.
  schemaFilter: ["public"],
});
