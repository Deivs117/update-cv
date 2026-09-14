/**
 * Schema del modo hosteado (Supabase/Postgres) -- issue #8. Modelo híbrido
 * decidido en la planeación: columnas reales donde hay necesidad real de
 * filtrar/ordenar/relacionar, JSONB para el contenido anidado que siempre se
 * carga/escribe completo (mismo criterio que profile.schema.json hoy).
 *
 * Reemplaza data/profile.json y apps/{slug}/metadata.json en modo hosteado
 * (STORAGE_MODE=hosted, ver #13) -- el modo local sigue usando el filesystem
 * sin tocar este archivo.
 *
 * RLS declarativo con drizzle-orm/supabase (authenticatedRole): cada usuario
 * solo puede leer/escribir sus propias filas. Un policy nuevo en una tabla
 * habilita RLS automáticamente (no hace falta enableRLS() aparte); si una
 * tabla no tuviera ningún policy, Postgres deniega todo por defecto.
 */
import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgPolicy,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

/**
 * Referencia al schema `auth` que ya gestiona Supabase Auth -- no lo creamos
 * nosotros, solo declaramos su forma para poder tener foreign keys reales
 * hacia auth.users.id (patrón estándar de la integración Supabase+Drizzle).
 */
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

/** Un perfil por cuenta (1:1) -- id = auth.uid() directo, sin tabla intermedia. */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** Misma forma que profile.schema.json / profileDraftSchema (Zod) hoy. */
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("profiles_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.id} = auth.uid()`,
    }),
    pgPolicy("profiles_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.id} = auth.uid()`,
    }),
    pgPolicy("profiles_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.id} = auth.uid()`,
      withCheck: sql`${table.id} = auth.uid()`,
    }),
    pgPolicy("profiles_delete_own", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${table.id} = auth.uid()`,
    }),
  ],
);

export const applicationStatus = [
  "draft",
  "analyzing",
  "generating",
  "compiling",
  "done",
  "error",
] as const;

/** Una fila por aplicación de empleo generada -- reemplaza apps/{slug}/ en modo hosteado. */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    role: text("role").notNull(),
    language: text("language").notNull(), // "es" | "en"
    status: text("status").notNull().default("draft"),
    jobDescription: text("job_description").notNull(),
    /** Salida de tailorCV -- misma forma que TailoredContent (connector.interface.ts). */
    tailoredContent: jsonb("tailored_content"),
    /**
     * .tex editable a mano (editor LaTeX avanzado, sección 8.2) -- decisión
     * de diseño #13: columna de texto, no un archivo aparte en Storage.
     * Mismo criterio que `tailoredContent`: contenido que siempre se
     * carga/escribe completo, texto de pocos KB reescrito en cada
     * recompilación (ver comparación de seguridad/escalabilidad/eficiencia
     * en el comentario del issue).
     */
    cvTex: text("cv_tex"),
    coverLetterTex: text("cover_letter_tex"),
    /**
     * Cuerpo de la carta de presentación en texto plano (coverLetter="text",
     * sin PDF) -- issue #14, mismo criterio que `cvTex`/`coverLetterTex`:
     * contenido de pocos KB que siempre se carga/escribe completo.
     */
    coverLetterText: text("cover_letter_text"),
    /** Rutas dentro del bucket privado de Storage (#10), no URLs firmadas. */
    cvPdfPath: text("cv_pdf_path"),
    coverLetterPdfPath: text("cover_letter_pdf_path"),
    /**
     * Resto de `ApplicationMetadata` (storage-adapter.interface.ts) sin
     * columna propia -- issue #14: `claudeMode`, `claudeModel`,
     * `templateVariant`, `pages`, `recommendedMaxPages`, `forcedTrim`,
     * `coverLetter` (el tipo "none"|"pdf"|"text", no el contenido). Mismo
     * criterio híbrido del comentario de arriba: nada acá se filtra/ordena
     * hoy, así que no ganan columna propia. `company`/`role`/`language`/
     * `createdAt` sí son columnas reales (se usaban ya para RLS/orden antes
     * de este ticket) y `saveApplication` los escribe ahí, no acá.
     */
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("applications_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("applications_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("applications_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
      withCheck: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("applications_delete_own", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
  ],
);

export const jobStage = [
  "analyzing",
  "tailoring",
  "rendering",
  "compiling",
  "done",
] as const;

export const jobStatus = ["pending", "running", "done", "error"] as const;

/**
 * Cola de jobs para el pipeline de generación en modo hosteado (#15) --
 * reemplaza la cola en memoria de web/lib/jobs.ts, que no sobrevive entre
 * invocaciones de una función serverless.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    stage: text("stage"),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy("jobs_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("jobs_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("jobs_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
      withCheck: sql`${table.userId} = auth.uid()`,
    }),
    // Sin policy de delete a propósito: los jobs son historial de progreso,
    // no hace falta que el usuario final los borre (a diferencia de jobs.ts
    // en memoria, que sí se descartaba solo).
  ],
);

/**
 * Cuotas de uso por cuenta (issue #18): una fila por usuario por día (UTC).
 * Solo aplica en modo hosteado, donde una única ANTHROPIC_API_KEY (o la del
 * proveedor que sea) paga por el uso de todos -- sin esto, una cuenta podría
 * disparar el costo sin límite.
 *
 * A propósito, SOLO tiene policy de SELECT: el usuario puede ver su propia
 * cuota restante (para mostrarla en la UI), pero nunca puede escribir su
 * propia fila -- eso solo lo hace el servidor con la secret key (que
 * bypassea RLS), así ningún cliente puede inflar o resetear su cuota
 * llamando directo a la API de Supabase.
 */
export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** Día UTC (YYYY-MM-DD) al que corresponde el contador -- ver usage-quota.ts. */
    period: text("period").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.period] }),
    pgPolicy("usage_counters_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type UsageCounter = typeof usageCounters.$inferSelect;
