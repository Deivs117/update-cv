/**
 * Espejo en Zod de `data/profile.schema.json`.
 *
 * Se usa para:
 * - Validar en tiempo real el formulario del editor de perfil (Fase 2).
 * - Validar cualquier JSON antes de que entre al pipeline de generación
 *   (extracción, motor de generación, compilación), para nunca dejar que
 *   un perfil mal formado rompa la compilación LaTeX a mitad de proceso.
 *
 * Si cambias este archivo, cambia también `data/profile.schema.json` en el
 * mismo commit — deben describir exactamente la misma forma de datos.
 */
import { z } from "zod";

const yearMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Formato esperado: YYYY-MM");

const yearMonthOrPresent = z
  .string()
  .regex(/^(\d{4}-\d{2}|present)$/, "Formato esperado: YYYY-MM o 'present'");

export const socialNetworkSchema = z.object({
  platform: z.string().min(1),
  url: z.string().min(1),
});

export const personalSchema = z.object({
  full_name: z.string().min(1, "El nombre completo es obligatorio"),
  headline_es: z.string().optional(),
  headline_en: z.string().optional(),
  age: z.number().int().min(0).optional(),
  photo_path: z.string().optional(),
  location: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email inválido"),
  website: z.string().optional(),
  social_networks: z.array(socialNetworkSchema).optional(),
});

export const summarySchema = z.object({
  es: z.string().optional(),
  en: z.string().optional(),
});

export const foundedCompanySchema = z.object({
  name: z.string().min(1),
  role_es: z.string().min(1),
  role_en: z.string().min(1),
  url: z.string().optional(),
  description_es: z.string().optional(),
  description_en: z.string().optional(),
});

export const educationSchema = z.object({
  id: z.string().min(1),
  institution: z.string().min(1),
  degree_es: z.string().min(1),
  degree_en: z.string().min(1),
  start_date: yearMonth,
  end_date: yearMonthOrPresent.optional(),
  location: z.string().optional(),
});

export const bulletSchema = z.object({
  id: z.string().min(1),
  text_es: z.string().min(1),
  text_en: z.string().min(1),
  keywords: z.array(z.string()).optional(),
});

export const experienceSchema = z.object({
  id: z.string().min(1),
  company: z.string().min(1),
  role_es: z.string().min(1),
  role_en: z.string().min(1),
  start_date: yearMonth,
  end_date: yearMonthOrPresent.optional(),
  location: z.string().optional(),
  bullets: z.array(bulletSchema),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  date: z.string().optional(),
  bullets: z.array(bulletSchema),
});

export const technicalSkillGroupSchema = z.object({
  category_es: z.string().min(1),
  category_en: z.string().min(1),
  items: z.array(z.string()),
});

export const languageSchema = z.object({
  language_es: z.string().min(1),
  language_en: z.string().min(1),
  level_es: z.string().min(1),
  level_en: z.string().min(1),
});

export const softSkillSchema = z.object({
  text_es: z.string().min(1),
  text_en: z.string().min(1),
});

export const metaSchema = z.object({
  schema_version: z.string(),
  last_updated: z.string(),
});

export const profileSchema = z.object({
  personal: personalSchema,
  summary: summarySchema,
  founded_companies: z.array(foundedCompanySchema).optional(),
  education: z.array(educationSchema),
  experience: z.array(experienceSchema),
  projects: z.array(projectSchema).optional(),
  technical_skills: z.array(technicalSkillGroupSchema).optional(),
  soft_skills: z.array(softSkillSchema).optional(),
  languages: z.array(languageSchema).optional(),
  certifications_compliance: z.array(z.string()).optional(),
  meta: metaSchema,
});

export type Profile = z.infer<typeof profileSchema>;
export type Bullet = z.infer<typeof bulletSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Project = z.infer<typeof projectSchema>;

/**
 * Igual que profileSchema pero con `meta` opcional: el editor web nunca
 * decide `last_updated`, eso lo calcula el servidor en cada guardado
 * (ver profile-io.ts writeProfile). Se usa para validar el body de PUT /api/profile.
 */
export const profileInputSchema = profileSchema
  .omit({ meta: true })
  .extend({ meta: metaSchema.partial().optional() });

export type ProfileInput = z.infer<typeof profileInputSchema>;

/**
 * Regla mínima de la sección 8.3: antes de generar cualquier CV, el perfil
 * debe tener al menos nombre, email, y al menos una experiencia o proyecto.
 */
export function hasMinimumViableContent(profile: Profile): boolean {
  const hasNameAndEmail =
    profile.personal.full_name.trim().length > 0 &&
    profile.personal.email.trim().length > 0;
  const hasExperienceOrProject =
    (profile.experience?.length ?? 0) > 0 ||
    (profile.projects?.length ?? 0) > 0;
  return hasNameAndEmail && hasExperienceOrProject;
}

/**
 * Draft de perfil devuelto por el Módulo 1 (extracción). Es un perfil parcial
 * -- no se exige que cumpla profileSchema completo porque la extracción puede
 * dejar campos vacíos o inciertos que el usuario completa en el editor antes
 * de guardar como profile.json definitivo (sección 7.1: nunca se sobreescribe
 * el perfil automáticamente sin confirmación del usuario).
 *
 * `.partial()` en Zod solo relaja el nivel superior del objeto al que se
 * aplica -- no se propaga dentro de arrays ni de objetos anidados. Por eso
 * cada sub-schema anidado (bullet, education, experience, project) tiene su
 * propia versión "draft" explícita, en vez de reusar profileSchema.partial()
 * a secas (eso dejaba, por ejemplo, education[].start_date como obligatorio).
 */
const bulletDraftSchema = bulletSchema.partial().extend({
  id: z.string().min(1),
});

const educationDraftSchema = educationSchema.partial().extend({
  id: z.string().min(1),
});

const experienceDraftSchema = experienceSchema.partial().extend({
  id: z.string().min(1),
  bullets: z.array(bulletDraftSchema).optional(),
});

const projectDraftSchema = projectSchema.partial().extend({
  id: z.string().min(1),
  bullets: z.array(bulletDraftSchema).optional(),
});

const foundedCompanyDraftSchema = foundedCompanySchema.partial();
const technicalSkillGroupDraftSchema = technicalSkillGroupSchema.partial();
const languageDraftSchema = languageSchema.partial();
const softSkillDraftSchema = softSkillSchema.partial();

export const profileDraftSchema = profileSchema.partial().extend({
  personal: personalSchema.partial(),
  founded_companies: z.array(foundedCompanyDraftSchema).optional(),
  education: z.array(educationDraftSchema).optional(),
  experience: z.array(experienceDraftSchema).optional(),
  projects: z.array(projectDraftSchema).optional(),
  technical_skills: z.array(technicalSkillGroupDraftSchema).optional(),
  languages: z.array(languageDraftSchema).optional(),
  soft_skills: z.array(softSkillDraftSchema).optional(),
});

export type ProfileDraft = z.infer<typeof profileDraftSchema>;
