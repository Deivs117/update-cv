/**
 * Rellena las plantillas templates/latex/cv-{es|en}.tex.tpl a partir de un
 * CVData ya en el idioma destino (sección 9.5).
 *
 * En la Fase 3 el CVData se arma directamente desde el profile.json completo
 * (sin selección/reescritura de Claude, ver profileToCVData). A partir de la
 * Fase 4, CVData se arma desde el TailoredContent que devuelve el motor de
 * generación -- esta función no cambia entre ambos casos.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "@/lib/profile-io";
import type { Language } from "@/lib/claude/connector.interface";

export interface CVSocialNetwork {
  platform: string;
  url: string;
}

export interface CVEducation {
  institution: string;
  degree: string;
  start_date?: string;
  end_date?: string;
  location?: string;
}

export interface CVExperience {
  company: string;
  role: string;
  start_date: string;
  end_date?: string;
  location?: string;
  bullets: string[];
  /** Keywords agregadas de los bullets (sección 6.1) -- usadas por la plantilla visual para las "pills" de tags; la plantilla ATS las ignora. */
  tags?: string[];
}

export interface CVProject {
  name: string;
  date?: string;
  bullets: string[];
  tags?: string[];
}

export interface CVSkillGroup {
  category: string;
  items: string[];
}

export interface CVLanguageLevel {
  language: string;
  level: string;
}

export interface CVFoundedCompany {
  name: string;
  role: string;
  description?: string;
}

export interface CVData {
  language: Language;
  full_name: string;
  headline?: string;
  location?: string;
  phone?: string;
  email?: string;
  website?: string;
  social_networks: CVSocialNetwork[];
  summary?: string;
  experience: CVExperience[];
  projects: CVProject[];
  education: CVEducation[];
  technical_skills: CVSkillGroup[];
  soft_skills: string[];
  languages: CVLanguageLevel[];
  certifications_compliance: string[];
  founded_companies: CVFoundedCompany[];
}

const SECTION_LABELS: Record<Language, Record<string, string>> = {
  es: {
    summary: "Resumen",
    experience: "Experiencia",
    projects: "Proyectos",
    education: "Educación",
    skills: "Habilidades Técnicas",
    languages: "Idiomas",
    certifications: "Certificaciones",
    soft_skills: "Habilidades Blandas",
    founded_companies: "Empresas Fundadas",
    present: "Presente",
  },
  en: {
    summary: "Summary",
    experience: "Experience",
    projects: "Projects",
    education: "Education",
    skills: "Technical Skills",
    languages: "Languages",
    certifications: "Certifications",
    soft_skills: "Soft Skills",
    founded_companies: "Founded Companies",
    present: "Present",
  },
};

/**
 * Escapa los caracteres especiales de LaTeX en texto libre (sección 9.5).
 * NUNCA aplicar sobre markup LaTeX ya construido (solo sobre texto plano
 * proveniente del perfil: nombres, bullets, keywords, etc.).
 */
export function escapeLatex(text: string): string {
  return text.replace(/[\\&%$#_{}~^]/g, (char) => {
    switch (char) {
      case "\\":
        return "\\textbackslash{}";
      case "~":
        return "\\textasciitilde{}";
      case "^":
        return "\\textasciicircum{}";
      default:
        return "\\" + char;
    }
  });
}

function formatDateRange(
  start: string | undefined,
  end: string | undefined,
  labels: Record<string, string>,
): string {
  const endLabel = !end || end === "present" ? labels.present : escapeLatex(end);
  if (!start) return endLabel;
  return `${escapeLatex(start)} -- ${endLabel}`;
}

function buildBulletList(bullets: string[]): string {
  if (bullets.length === 0) return "";
  const items = bullets.map((b) => `  \\item ${escapeLatex(b)}`).join("\n");
  return `\\begin{itemize}\n${items}\n\\end{itemize}`;
}

function section(heading: string, body: string): string {
  return `\\section*{${escapeLatex(heading)}}\n${body}`;
}

function buildContactLine(data: CVData): string {
  const parts: string[] = [];
  if (data.location) parts.push(escapeLatex(data.location));
  if (data.phone) parts.push(escapeLatex(data.phone));
  if (data.email) parts.push(escapeLatex(data.email));
  if (data.website) parts.push(escapeLatex(data.website));
  for (const social of data.social_networks) {
    parts.push(`${escapeLatex(social.platform)}: ${escapeLatex(social.url)}`);
  }
  return parts.join(" \\textbar\\ ");
}

function buildSummarySection(data: CVData, labels: Record<string, string>): string {
  if (!data.summary?.trim()) return "";
  return section(labels.summary, escapeLatex(data.summary));
}

function buildExperienceSection(data: CVData, labels: Record<string, string>): string {
  if (data.experience.length === 0) return "";
  const blocks = data.experience.map((exp) => {
    const dateRange = formatDateRange(exp.start_date, exp.end_date, labels);
    const locationSuffix = exp.location ? ` \\textbar\\ ${escapeLatex(exp.location)}` : "";
    return (
      `\\textbf{${escapeLatex(exp.role)}}, ${escapeLatex(exp.company)}\\\\\n` +
      `${dateRange}${locationSuffix}\\\\\n` +
      buildBulletList(exp.bullets)
    );
  });
  return section(labels.experience, blocks.join("\n\n"));
}

function buildProjectsSection(data: CVData, labels: Record<string, string>): string {
  if (data.projects.length === 0) return "";
  const blocks = data.projects.map((proj) => {
    const dateSuffix = proj.date ? ` -- ${escapeLatex(proj.date)}` : "";
    return (
      `\\textbf{${escapeLatex(proj.name)}}${dateSuffix}\\\\\n` + buildBulletList(proj.bullets)
    );
  });
  return section(labels.projects, blocks.join("\n\n"));
}

function buildEducationSection(data: CVData, labels: Record<string, string>): string {
  if (data.education.length === 0) return "";
  const blocks = data.education.map((edu) => {
    const dateRange = formatDateRange(edu.start_date, edu.end_date, labels);
    const locationSuffix = edu.location ? ` \\textbar\\ ${escapeLatex(edu.location)}` : "";
    return (
      `\\textbf{${escapeLatex(edu.degree)}}, ${escapeLatex(edu.institution)}\\\\\n` +
      `${dateRange}${locationSuffix}`
    );
  });
  return section(labels.education, blocks.join("\\\\[4pt]\n"));
}

function buildSkillsSection(data: CVData, labels: Record<string, string>): string {
  if (data.technical_skills.length === 0) return "";
  const lines = data.technical_skills.map(
    (group) =>
      `\\textbf{${escapeLatex(group.category)}:} ${group.items.map(escapeLatex).join(", ")}`,
  );
  return section(labels.skills, lines.join("\\\\\n"));
}

function buildLanguagesSection(data: CVData, labels: Record<string, string>): string {
  if (data.languages.length === 0) return "";
  const line = data.languages
    .map((l) => `${escapeLatex(l.language)} (${escapeLatex(l.level)})`)
    .join(", ");
  return section(labels.languages, line);
}

function buildCertificationsSection(data: CVData, labels: Record<string, string>): string {
  if (data.certifications_compliance.length === 0) return "";
  return section(labels.certifications, data.certifications_compliance.map(escapeLatex).join(", "));
}

function buildSoftSkillsSection(data: CVData, labels: Record<string, string>): string {
  if (data.soft_skills.length === 0) return "";
  return section(labels.soft_skills, data.soft_skills.map(escapeLatex).join(", "));
}

function buildFoundedCompaniesSection(data: CVData, labels: Record<string, string>): string {
  if (data.founded_companies.length === 0) return "";
  const blocks = data.founded_companies.map((c) => {
    const descSuffix = c.description ? `\\\\\n${escapeLatex(c.description)}` : "";
    return `\\textbf{${escapeLatex(c.role)}}, ${escapeLatex(c.name)}${descSuffix}`;
  });
  return section(labels.founded_companies, blocks.join("\n\n"));
}

export async function renderCV(data: CVData): Promise<string> {
  const templatePath = path.join(
    REPO_ROOT,
    "templates",
    "latex",
    `cv-${data.language}.tex.tpl`,
  );
  const template = await readFile(templatePath, "utf-8");
  const labels = SECTION_LABELS[data.language];

  const placeholders: Record<string, string> = {
    "{{FULL_NAME}}": escapeLatex(data.full_name),
    "{{CONTACT_LINE}}": buildContactLine(data),
    "{{SUMMARY_SECTION}}": buildSummarySection(data, labels),
    "{{EXPERIENCE_SECTION}}": buildExperienceSection(data, labels),
    "{{PROJECTS_SECTION}}": buildProjectsSection(data, labels),
    "{{EDUCATION_SECTION}}": buildEducationSection(data, labels),
    "{{SKILLS_SECTION}}": buildSkillsSection(data, labels),
    "{{LANGUAGES_SECTION}}": buildLanguagesSection(data, labels),
    "{{CERTIFICATIONS_SECTION}}": buildCertificationsSection(data, labels),
    "{{SOFT_SKILLS_SECTION}}": buildSoftSkillsSection(data, labels),
    "{{FOUNDED_COMPANIES_SECTION}}": buildFoundedCompaniesSection(data, labels),
  };

  let output = template;
  for (const [placeholder, value] of Object.entries(placeholders)) {
    // Reemplazo por función: evita que secuencias como "$&" en `value` se
    // interpreten como patrones especiales de String.replace.
    output = output.replace(placeholder, () => value);
  }
  return output;
}
