/**
 * Config de Drizzle Kit (issue #9) -- genera/aplica migraciones SQL a partir
 * de lib/db/schema.ts. DATABASE_URL solo hace falta para `db:push`/`db:migrate`
 * contra una base real; `db:generate` (solo lee el schema) funciona sin ella.
 */
import { defineConfig } from "drizzle-kit";

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
