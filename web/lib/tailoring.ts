/**
 * Módulo 3 — construcción del "contenido candidato" que se envía a Claude
 * para tailorCV (sección 9.3), y resolución determinística de la respuesta
 * de vuelta contra el perfil real (nunca confiamos en que Claude devuelva
 * bien company/role/fechas -- esos datos siempre se toman del profile.json
 * local, cruzando por "id").
 */
import type { Language, TailoredContent } from "@/lib/claude/connector.interface";
import type { Profile } from "@/lib/validation/profile.zod";
import type { TailorRawResponse } from "@/lib/validation/generation.zod";

export interface CandidateBullet {
  id: string;
  text: string;
  keywords: string[];
}

export interface CandidateEntry {
  id: string;
  bullets: CandidateBullet[];
}

export interface CandidateContent {
  summary: string;
  experience: CandidateEntry[];
  projects: CandidateEntry[];
  technical_skills: { category: string; items: string[] }[];
  soft_skills: string[];
}

/** Perfil resuelto al idioma destino, con ids de bullet preservados -- lo que Claude ve. */
export function buildCandidateContent(profile: Profile, language: Language): CandidateContent {
  const text = (bullet: { text_es: string; text_en: string }) =>
    language === "es" ? bullet.text_es : bullet.text_en;

  return {
    summary: (language === "es" ? profile.summary.es : profile.summary.en) ?? "",
    experience: (profile.experience ?? []).map((exp) => ({
      id: exp.id,
      bullets: exp.bullets.map((b) => ({
        id: b.id,
        text: text(b),
        keywords: b.keywords ?? [],
      })),
    })),
    projects: (profile.projects ?? []).map((proj) => ({
      id: proj.id,
      bullets: proj.bullets.map((b) => ({
        id: b.id,
        text: text(b),
        keywords: b.keywords ?? [],
      })),
    })),
    technical_skills: (profile.technical_skills ?? []).map((s) => ({
      category: language === "es" ? s.category_es : s.category_en,
      items: s.items,
    })),
    soft_skills: (profile.soft_skills ?? []).map(text),
  };
}

/**
 * Cruza la respuesta cruda de Claude (solo ids + texto reescrito) contra el
 * perfil real para reconstruir company/role/fechas/ubicación de forma
 * determinística. Descarta silenciosamente cualquier id que Claude haya
 * inventado (no debería pasar, pero no debe romper la generación si pasa).
 */
export function resolveTailoredContent(
  profile: Profile,
  language: Language,
  raw: TailorRawResponse,
): TailoredContent {
  const experienceById = new Map((profile.experience ?? []).map((e) => [e.id, e]));
  const projectById = new Map((profile.projects ?? []).map((p) => [p.id, p]));

  const experience = raw.experience.flatMap((entry) => {
    const source = experienceById.get(entry.id);
    if (!source) return [];
    const validBulletIds = new Set(source.bullets.map((b) => b.id));
    const bullets = entry.bullets.filter((b) => validBulletIds.has(b.id));
    if (bullets.length === 0) return [];
    return [
      {
        id: source.id,
        company: source.company,
        role: language === "es" ? source.role_es : source.role_en,
        start_date: source.start_date,
        end_date: source.end_date,
        location: source.location,
        bullets,
      },
    ];
  });

  const projects = raw.projects.flatMap((entry) => {
    const source = projectById.get(entry.id);
    if (!source) return [];
    const validBulletIds = new Set(source.bullets.map((b) => b.id));
    const bullets = entry.bullets.filter((b) => validBulletIds.has(b.id));
    if (bullets.length === 0) return [];
    return [
      {
        id: source.id,
        name: source.name,
        date: source.date,
        bullets,
      },
    ];
  });

  return {
    summary: raw.summary,
    experience,
    projects,
    technical_skills: raw.technical_skills,
    soft_skills: raw.soft_skills,
  };
}
