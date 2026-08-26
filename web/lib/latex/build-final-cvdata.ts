/**
 * Combina el TailoredContent (resultado del Módulo 3) con el resto del
 * perfil (datos personales, educación, idiomas, certificaciones, empresas
 * fundadas -- nada de esto se "tailora" por vacante) para armar el CVData
 * final que consume render.ts / render-visual.ts.
 */
import type { Language, TailoredContent } from "@/lib/claude/connector.interface";
import type { Profile } from "@/lib/validation/profile.zod";
import type { CVData } from "@/lib/latex/render";
import { profileToCVData } from "@/lib/latex/profile-to-cvdata";

export function buildFinalCVData(
  profile: Profile,
  language: Language,
  tailored: TailoredContent,
): CVData {
  const base = profileToCVData(profile, language);

  return {
    ...base,
    summary: tailored.summary || base.summary,
    experience: tailored.experience.map((exp) => ({
      company: exp.company,
      role: exp.role,
      start_date: exp.start_date,
      end_date: exp.end_date,
      location: exp.location,
      bullets: exp.bullets.map((b) => b.text),
      tags: [...new Set(exp.bullets.flatMap((b) => b.keywords))],
    })),
    projects: tailored.projects.map((proj) => ({
      name: proj.name,
      date: proj.date,
      bullets: proj.bullets.map((b) => b.text),
      tags: [...new Set(proj.bullets.flatMap((b) => b.keywords))],
    })),
    technical_skills:
      tailored.technical_skills.length > 0 ? tailored.technical_skills : base.technical_skills,
    soft_skills: tailored.soft_skills.length > 0 ? tailored.soft_skills : base.soft_skills,
  };
}
