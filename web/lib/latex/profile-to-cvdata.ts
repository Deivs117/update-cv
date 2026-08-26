/**
 * Adaptador Profile -> CVData sin pasar por Claude: incluye TODOS los
 * bullets del perfil, sin selección ni reescritura ni reordenamiento por
 * relevancia. Se usa para probar el pipeline de renderizado/compilación en
 * la Fase 3 (sección 16: "probado con un perfil de ejemplo estático, sin IA
 * todavía"). A partir de la Fase 4, el motor de generación arma el CVData
 * desde el TailoredContent que devuelve Claude, no desde este adaptador.
 */
import type { Language } from "@/lib/claude/connector.interface";
import type { Profile } from "@/lib/validation/profile.zod";
import type { CVData } from "@/lib/latex/render";

export function profileToCVData(profile: Profile, language: Language): CVData {
  const text = (bullet: { text_es: string; text_en: string }) =>
    language === "es" ? bullet.text_es : bullet.text_en;

  return {
    language,
    full_name: profile.personal.full_name,
    headline: language === "es" ? profile.personal.headline_es : profile.personal.headline_en,
    location: profile.personal.location,
    phone: profile.personal.phone,
    email: profile.personal.email,
    website: profile.personal.website,
    social_networks: profile.personal.social_networks ?? [],
    summary: language === "es" ? profile.summary.es : profile.summary.en,
    experience: (profile.experience ?? []).map((exp) => ({
      company: exp.company,
      role: language === "es" ? exp.role_es : exp.role_en,
      start_date: exp.start_date,
      end_date: exp.end_date,
      location: exp.location,
      bullets: exp.bullets.map(text),
      tags: [...new Set(exp.bullets.flatMap((b) => b.keywords ?? []))],
    })),
    projects: (profile.projects ?? []).map((proj) => ({
      name: proj.name,
      date: proj.date,
      bullets: proj.bullets.map(text),
      tags: [...new Set(proj.bullets.flatMap((b) => b.keywords ?? []))],
    })),
    education: (profile.education ?? []).map((edu) => ({
      institution: edu.institution,
      degree: language === "es" ? edu.degree_es : edu.degree_en,
      start_date: edu.start_date,
      end_date: edu.end_date,
      location: edu.location,
    })),
    technical_skills: (profile.technical_skills ?? []).map((s) => ({
      category: language === "es" ? s.category_es : s.category_en,
      items: s.items,
    })),
    soft_skills: profile.soft_skills ?? [],
    languages: profile.languages ?? [],
    certifications_compliance: profile.certifications_compliance ?? [],
    founded_companies: (profile.founded_companies ?? []).map((c) => ({
      name: c.name,
      role: language === "es" ? c.role_es : c.role_en,
      description: language === "es" ? c.description_es : c.description_en,
    })),
  };
}
