/**
 * Rellena templates/latex/cv-visual.tex.tpl -- la plantilla VISUAL secundaria
 * y opcional (con foto, iconos, color; NO ATS-safe) mencionada en la sección
 * 3, punto 2 del documento de arquitectura. Se activa solo si el usuario la
 * elige explícitamente (selector en /nueva-aplicacion, Fase 4).
 *
 * A diferencia de render.ts (plantilla ATS), aquí el "cuerpo" de cada sección
 * se construye con los macros de templates/latex/visual/documentMETADATA.cls
 * (\experience, \project, \begin{keywords}, \begin{scholarship}, etc.) en vez
 * de \itemize plano.
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "@/lib/profile-io";
import { escapeLatex, type CVData } from "@/lib/latex/render";

const SECTION_LABELS_VISUAL = {
  es: {
    summary: "Resumen",
    experience: "Experiencia Profesional",
    projects: "Proyectos",
    education: "Educación",
    skills: "Habilidades Técnicas",
    languages: "Idiomas",
    softSkills: "Habilidades Blandas",
    certifications: "Certificaciones",
    foundedCompanies: "Empresas Fundadas",
    present: "Presente",
  },
  en: {
    summary: "Summary",
    experience: "Professional Experience",
    projects: "Projects",
    education: "Education",
    skills: "Technical Skills",
    languages: "Languages",
    softSkills: "Soft Skills",
    certifications: "Certifications",
    foundedCompanies: "Founded Companies",
    present: "Present",
  },
} as const;

type VisualLabels = (typeof SECTION_LABELS_VISUAL)[keyof typeof SECTION_LABELS_VISUAL];

function splitName(fullName: string): { first: string; last: string } {
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length <= 1) return { first: tokens[0] ?? "", last: "" };
  return { first: tokens[0], last: tokens.slice(1).join(" ") };
}

function dateOrLabel(value: string | undefined, present: string): string {
  if (!value || value === "present") return present;
  return escapeLatex(value);
}

function buildPhotoCommand(photoFileName: string | undefined): string {
  if (!photoFileName) return "";
  return `\\photo{2.5cm}{${photoFileName}}`;
}

function buildSocialInfo(data: CVData): string {
  const line1: string[] = [];
  if (data.phone) line1.push(`\\smartphone{${escapeLatex(data.phone)}}`);
  if (data.email) line1.push(`\\email{${escapeLatex(data.email)}}`);

  const line2: string[] = [];
  if (data.location) line2.push(`\\address{${escapeLatex(data.location)}}`);
  if (data.website) line2.push(`\\website{${escapeLatex(data.website)}}{${escapeLatex(data.website)}}`);
  for (const social of data.social_networks) {
    line2.push(
      `\\sociallink{\\linkSymbol}{${escapeLatex(social.url)}}{${escapeLatex(social.platform)}}`,
    );
  }

  return [line1.join("\n"), line2.join("\n")].filter(Boolean).join("\\\\\n");
}

function buildSummarySection(data: CVData, labels: VisualLabels): string {
  if (!data.summary?.trim()) return "";
  return `\\sectionTitle{${escapeLatex(labels.summary)}}{\\faUser}\n\\par{${escapeLatex(data.summary)}}`;
}

function buildExperienceSection(
  data: CVData,
  labels: VisualLabels,
): string {
  if (data.experience.length === 0) return "";
  const entries = data.experience.map((exp) => {
    const bulletItems = exp.bullets.map((b) => `    \\item ${escapeLatex(b)}`).join("\n");
    const tags = (exp.tags ?? []).map(escapeLatex).join(", ");
    return (
      `  \\experience\n` +
      `    {${dateOrLabel(exp.end_date, labels.present)}} {${escapeLatex(exp.role)}}{${escapeLatex(exp.company)}}{${escapeLatex(exp.location ?? "")}}\n` +
      `    {${dateOrLabel(exp.start_date, labels.present)}} {\n` +
      `                    \\begin{itemize}\n${bulletItems}\n                    \\end{itemize}\n` +
      `                    }\n` +
      `                    {${tags}}\n` +
      `  \\emptySeparator`
    );
  });
  return (
    `\\sectionTitle{${escapeLatex(labels.experience)}}{\\faSuitcase}\n\n` +
    `\\begin{experiences}\n\n  \\emptySeparator\n${entries.join("\n\n")}\n\\end{experiences}`
  );
}

function buildProjectsSection(
  data: CVData,
  labels: VisualLabels,
): string {
  if (data.projects.length === 0) return "";
  const entries = data.projects.map((proj) => {
    const description = proj.bullets.map(escapeLatex).join(" \\\\ ");
    const tags = (proj.tags ?? []).map(escapeLatex).join(", ");
    return (
      `  \\project\n` +
      `  {${escapeLatex(proj.name)}}{${proj.date ? escapeLatex(proj.date) : ""}}\n` +
      `  {}\n` +
      `  {${description}}\n` +
      `  {${tags}}`
    );
  });
  return (
    `\\sectionTitle{${escapeLatex(labels.projects)}}{\\faLaptop}\n\n` +
    `\\begin{projects}\n${entries.join("\n\n")}\n\\end{projects}`
  );
}

function buildEducationSection(
  data: CVData,
  labels: VisualLabels,
): string {
  if (data.education.length === 0) return "";
  const entries = data.education
    .map((edu) => {
      const dateRange = `${dateOrLabel(edu.start_date, labels.present)} -- ${dateOrLabel(edu.end_date, labels.present)}`;
      const locationSuffix = edu.location ? `, ${escapeLatex(edu.location)}` : "";
      return `  \\scholarshipentry{${dateRange}}\n                  {${escapeLatex(edu.degree)}, ${escapeLatex(edu.institution)}${locationSuffix}.}`;
    })
    .join("\n");
  return (
    `\\sectionTitle{${escapeLatex(labels.education)}}{\\faMortarBoard}\n\n` +
    `\\begin{scholarship}\n${entries}\n\\end{scholarship}`
  );
}

function buildSkillsSection(data: CVData, labels: VisualLabels): string {
  if (data.technical_skills.length === 0) return "";
  const entries = data.technical_skills
    .map(
      (group) =>
        `\t\\keywordsentry{${escapeLatex(group.category)}}{${group.items.map(escapeLatex).join(", ")}}`,
    )
    .join("\n");
  return (
    `\\sectionTitle{${escapeLatex(labels.skills)}}{\\faTasks}\n\n` +
    `\\begin{keywords}\n${entries}\n\\end{keywords}`
  );
}

function buildLanguagesAndSoftSkillsSection(
  data: CVData,
  labels: VisualLabels,
): string {
  if (data.languages.length === 0 && data.soft_skills.length === 0) return "";

  const languagesBlock =
    data.languages.length === 0
      ? ""
      : // Nota update-cv: NO se usa el entorno `keywords` del template aquí --
        // su columna tiene un ancho ABSOLUTO fijo (p{13cm}) que se sale de la
        // media página cuando va dentro de \twocolumnsection. Líneas de texto
        // simples evitan el desbordamiento sin tocar la clase original.
        `\\sectionTitle{${escapeLatex(labels.languages)}}{\\faGlobe}\n${data.languages
          .map((l) => `\\textbf{${escapeLatex(l.language)}}: ${escapeLatex(l.level)}\\\\`)
          .join("\n")}`;

  const softSkillsBlock =
    data.soft_skills.length === 0
      ? ""
      : `\\sectionTitle{${escapeLatex(labels.softSkills)}}{\\faPlus}\n\\vspace{1em}\n\\begin{itemize}\n${data.soft_skills
          .map((s) => `  \\item ${escapeLatex(s)}`)
          .join("\n")}\n\\end{itemize}`;

  return `\\twocolumnsection\n{${languagesBlock}}\n{${softSkillsBlock}}`;
}

function buildCertificationsSection(
  data: CVData,
  labels: VisualLabels,
): string {
  if (data.certifications_compliance.length === 0) return "";
  return (
    `\\sectionTitle{${escapeLatex(labels.certifications)}}{\\faCertificate}\n\n` +
    `\\par{${data.certifications_compliance.map(escapeLatex).join(", ")}}`
  );
}

function buildFoundedCompaniesSection(
  data: CVData,
  labels: VisualLabels,
): string {
  if (data.founded_companies.length === 0) return "";
  const items = data.founded_companies
    .map((c) => {
      const descSuffix = c.description ? `: ${escapeLatex(c.description)}` : "";
      return `  \\item \\textbf{${escapeLatex(c.role)}}, ${escapeLatex(c.name)}${descSuffix}`;
    })
    .join("\n");
  return (
    `\\sectionTitle{${escapeLatex(labels.foundedCompanies)}}{\\faBriefcase}\n\n` +
    `\\begin{itemize}\n${items}\n\\end{itemize}`
  );
}

export interface RenderVisualOptions {
  /** Nombre de archivo (con extensión) que tendrá la foto ya copiada junto al .tex, ej. "photo.jpg". Omitir si no hay foto. */
  photoFileName?: string;
}

export async function renderVisualCV(
  data: CVData,
  options: RenderVisualOptions = {},
): Promise<string> {
  const templatePath = path.join(REPO_ROOT, "templates", "latex", "cv-visual.tex.tpl");
  const template = await readFile(templatePath, "utf-8");
  const labels = SECTION_LABELS_VISUAL[data.language];
  const { first, last } = splitName(data.full_name);

  const placeholders: Record<string, string> = {
    "{{FIRST_NAME}}": escapeLatex(first),
    "{{LAST_NAME}}": escapeLatex(last),
    "{{HEADLINE}}": escapeLatex(data.headline ?? ""),
    "{{PHOTO_COMMAND}}": buildPhotoCommand(options.photoFileName),
    "{{SOCIAL_INFO}}": buildSocialInfo(data),
    "{{SUMMARY_SECTION}}": buildSummarySection(data, labels),
    "{{EXPERIENCE_SECTION}}": buildExperienceSection(data, labels),
    "{{PROJECTS_SECTION}}": buildProjectsSection(data, labels),
    "{{EDUCATION_SECTION}}": buildEducationSection(data, labels),
    "{{SKILLS_SECTION}}": buildSkillsSection(data, labels),
    "{{LANGUAGES_SECTION}}": buildLanguagesAndSoftSkillsSection(data, labels),
    "{{CERTIFICATIONS_SECTION}}": buildCertificationsSection(data, labels),
    "{{SOFT_SKILLS_SECTION}}": "", // fusionado con Idiomas en dos columnas, ver arriba
    "{{FOUNDED_COMPANIES_SECTION}}": buildFoundedCompaniesSection(data, labels),
  };

  let output = template;
  for (const [placeholder, value] of Object.entries(placeholders)) {
    output = output.replace(placeholder, () => value);
  }
  return output;
}

/**
 * Copia documentMETADATA.cls, la carpeta fonts/ y (si se da) la foto en
 * `outDir`, junto al .tex, para que tectonic los encuentre al compilar.
 */
export async function prepareVisualAssets(
  outDir: string,
  photoAbsolutePath?: string,
): Promise<{ photoFileName?: string }> {
  const templateDir = path.join(REPO_ROOT, "templates", "latex", "visual");
  await mkdir(path.join(outDir, "fonts"), { recursive: true });

  await copyFile(
    path.join(templateDir, "documentMETADATA.cls"),
    path.join(outDir, "documentMETADATA.cls"),
  );

  const { readdir } = await import("node:fs/promises");
  const fontFiles = await readdir(path.join(templateDir, "fonts"));
  await Promise.all(
    fontFiles.map((f) =>
      copyFile(path.join(templateDir, "fonts", f), path.join(outDir, "fonts", f)),
    ),
  );

  if (!photoAbsolutePath) return {};

  const photoFileName = "photo" + path.extname(photoAbsolutePath);
  await copyFile(photoAbsolutePath, path.join(outDir, photoFileName));
  return { photoFileName };
}
