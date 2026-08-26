/**
 * Rellena templates/latex/cover-letter-{es|en}.tex.tpl (Módulo 4, sección 10).
 * Reusa buildContactLine/escapeLatex de render.ts para mantener el mismo
 * formato de datos de contacto que el CV.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "@/lib/profile-io";
import { buildContactLine, escapeLatex, type CVData } from "@/lib/latex/render";
import type { Language } from "@/lib/claude/connector.interface";

const LABELS: Record<Language, { greeting: (company: string) => string; closing: string }> = {
  es: {
    greeting: (company) => `Estimado equipo de contratación de ${escapeLatex(company)},`,
    closing: "Atentamente,",
  },
  en: {
    greeting: (company) => `Dear Hiring Team at ${escapeLatex(company)},`,
    closing: "Sincerely,",
  },
};

function formatDate(language: Language): string {
  const locale = language === "es" ? "es-CO" : "en-US";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(
    new Date(),
  );
}

function buildBody(bodyText: string): string {
  return bodyText
    .split(/\n\s*\n/)
    .map((paragraph) => escapeLatex(paragraph.trim()))
    .filter(Boolean)
    .join("\n\n");
}

export interface CoverLetterInput {
  language: Language;
  personal: CVData; // solo se usan full_name/location/phone/email/website/social_networks
  company: string;
  bodyText: string;
}

export async function renderCoverLetter(input: CoverLetterInput): Promise<string> {
  const templatePath = path.join(
    REPO_ROOT,
    "templates",
    "latex",
    `cover-letter-${input.language}.tex.tpl`,
  );
  const template = await readFile(templatePath, "utf-8");
  const labels = LABELS[input.language];

  const placeholders: Record<string, string> = {
    "{{FULL_NAME}}": escapeLatex(input.personal.full_name),
    "{{CONTACT_LINE}}": buildContactLine(input.personal),
    "{{DATE}}": formatDate(input.language),
    "{{GREETING}}": labels.greeting(input.company),
    "{{BODY}}": buildBody(input.bodyText),
    "{{CLOSING}}": labels.closing,
  };

  let output = template;
  for (const [placeholder, value] of Object.entries(placeholders)) {
    // split/join en vez de replace(): {{FULL_NAME}} aparece dos veces en la
    // plantilla (encabezado y firma), y String.replace con un string solo
    // reemplaza la primera ocurrencia.
    output = output.split(placeholder).join(value);
  }
  return output;
}
