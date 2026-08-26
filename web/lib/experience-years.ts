/**
 * Calcula los años totales de experiencia a partir de experience[] (sección 9.4),
 * uniendo rangos solapados para no contar dos veces el tiempo en que el usuario
 * tuvo dos experiencias simultáneas (ej. trabajo + proyecto freelance).
 *
 * El resultado se usa SOLO como recomendación de página en la UI (retroalimentación,
 * no restricción dura) -- ver README, sección "Decisiones ajustadas durante la
 * construcción".
 */
import type { Experience } from "@/lib/validation/profile.zod";

interface DateRange {
  start: number; // meses desde epoch (año*12 + mes), para aritmética simple
  end: number;
}

function yearMonthToMonths(value: string): number {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + (month - 1);
}

function nowInMonths(): number {
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth();
}

function mergeRanges(ranges: DateRange[]): DateRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: DateRange[] = [sorted[0]];

  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/** Devuelve los años totales de experiencia (con un decimal), o 0 si no hay experiencia. */
export function calculateExperienceYears(experience: Experience[]): number {
  if (experience.length === 0) return 0;

  const ranges: DateRange[] = experience.map((exp) => ({
    start: yearMonthToMonths(exp.start_date),
    end: !exp.end_date || exp.end_date === "present" ? nowInMonths() : yearMonthToMonths(exp.end_date),
  }));

  const merged = mergeRanges(ranges);
  const totalMonths = merged.reduce((sum, r) => sum + Math.max(0, r.end - r.start), 0);
  return Math.round((totalMonths / 12) * 10) / 10;
}

export interface PageRecommendation {
  experienceYears: number;
  recommendedMaxPages: number;
}

/**
 * Recomendación de páginas según sección 9.4/12: ≤ JUNIOR_EXPERIENCE_YEARS_THRESHOLD
 * años -> 1 página recomendada; más que eso -> hasta MAX_PAGES_SENIOR. Es solo una
 * recomendación mostrada en la UI, nunca un límite que bloquee la generación.
 */
export function getPageRecommendation(experience: Experience[]): PageRecommendation {
  const experienceYears = calculateExperienceYears(experience);
  const threshold = Number(process.env.JUNIOR_EXPERIENCE_YEARS_THRESHOLD ?? "3");
  const maxPagesSenior = Number(process.env.MAX_PAGES_SENIOR ?? "2");
  const recommendedMaxPages = experienceYears <= threshold ? 1 : maxPagesSenior;
  return { experienceYears, recommendedMaxPages };
}
