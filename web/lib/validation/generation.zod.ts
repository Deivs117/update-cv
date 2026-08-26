/**
 * Validación de las respuestas de Claude para el Módulo 3 (motor de
 * generación): análisis de vacante (9.2) y selección/reescritura de
 * contenido (9.3).
 */
import { z } from "zod";

export const jobAnalysisSchema = z.object({
  required_technical_skills: z.array(z.string()).default([]),
  soft_skills: z.array(z.string()).default([]),
  sector_keywords: z.array(z.string()).default([]),
  seniority: z.string().default("sin especificar"),
});

const tailoredBulletRawSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  keywords: z.array(z.string()).optional().default([]),
});

const tailoredEntryRawSchema = z.object({
  id: z.string().min(1),
  bullets: z.array(tailoredBulletRawSchema).default([]),
});

export const tailorRawResponseSchema = z.object({
  summary: z.string().default(""),
  experience: z.array(tailoredEntryRawSchema).default([]),
  projects: z.array(tailoredEntryRawSchema).default([]),
  technical_skills: z
    .array(z.object({ category: z.string(), items: z.array(z.string()) }))
    .default([]),
  soft_skills: z.array(z.string()).default([]),
  certifications_compliance: z.array(z.string()).default([]),
});

export type TailorRawResponse = z.infer<typeof tailorRawResponseSchema>;
