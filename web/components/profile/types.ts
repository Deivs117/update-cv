/**
 * Forma "editable" del perfil: todos los campos opcionales del schema quedan
 * normalizados a valores por defecto (strings vacíos, arrays vacíos) para que
 * el formulario controlado de React no tenga que lidiar con `undefined` en
 * cada input. Se convierte hacia/desde ProfileInput solo al cargar y al
 * guardar (ver toEditableProfile / toProfileInput).
 */
import type { ProfileDraft, ProfileInput } from "@/lib/validation/profile.zod";

export interface EditableBullet {
  id: string;
  text_es: string;
  text_en: string;
  keywords: string[];
}

export interface EditableEducation {
  id: string;
  institution: string;
  degree: string;
  start_date: string;
  end_date: string;
  location: string;
}

export interface EditableExperience {
  id: string;
  company: string;
  role: string;
  start_date: string;
  end_date: string;
  location: string;
  bullets: EditableBullet[];
}

export interface EditableProject {
  id: string;
  name: string;
  date: string;
  bullets: EditableBullet[];
}

export interface EditableSocialNetwork {
  platform: string;
  url: string;
}

export interface EditableFoundedCompany {
  name: string;
  role: string;
  url: string;
  description: string;
}

export interface EditableSkillGroup {
  category: string;
  items: string[];
}

export interface EditableLanguage {
  language: string;
  level: string;
}

export interface EditableProfile {
  personal: {
    full_name: string;
    headline: string;
    age: string; // input controlado como texto; se convierte a number al guardar
    photo_path: string;
    location: string;
    phone: string;
    email: string;
    website: string;
    social_networks: EditableSocialNetwork[];
  };
  summary: { es: string; en: string };
  founded_companies: EditableFoundedCompany[];
  education: EditableEducation[];
  experience: EditableExperience[];
  projects: EditableProject[];
  technical_skills: EditableSkillGroup[];
  soft_skills: string[];
  languages: EditableLanguage[];
  certifications_compliance: string[];
}

let idCounter = 0;
/** Genera ids simples y estables para elementos nuevos creados en el editor. */
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function emptyProfile(): EditableProfile {
  return {
    personal: {
      full_name: "",
      headline: "",
      age: "",
      photo_path: "",
      location: "",
      phone: "",
      email: "",
      website: "",
      social_networks: [],
    },
    summary: { es: "", en: "" },
    founded_companies: [],
    education: [],
    experience: [],
    projects: [],
    technical_skills: [],
    soft_skills: [],
    languages: [],
    certifications_compliance: [],
  };
}

/** Acepta tanto un ProfileDraft (de extracción) como un Profile guardado. */
export function toEditableProfile(source: ProfileDraft | null | undefined): EditableProfile {
  const base = emptyProfile();
  if (!source) return base;

  return {
    personal: {
      full_name: source.personal?.full_name ?? "",
      headline: source.personal?.headline ?? "",
      age: source.personal?.age != null ? String(source.personal.age) : "",
      photo_path: source.personal?.photo_path ?? "",
      location: source.personal?.location ?? "",
      phone: source.personal?.phone ?? "",
      email: source.personal?.email ?? "",
      website: source.personal?.website ?? "",
      social_networks: (source.personal?.social_networks ?? []).map((s) => ({
        platform: s.platform ?? "",
        url: s.url ?? "",
      })),
    },
    summary: { es: source.summary?.es ?? "", en: source.summary?.en ?? "" },
    founded_companies: (source.founded_companies ?? []).map((c) => ({
      name: c.name ?? "",
      role: c.role ?? "",
      url: c.url ?? "",
      description: c.description ?? "",
    })),
    education: (source.education ?? []).map((e) => ({
      id: e.id || newId("edu"),
      institution: e.institution ?? "",
      degree: e.degree ?? "",
      start_date: e.start_date ?? "",
      end_date: e.end_date ?? "",
      location: e.location ?? "",
    })),
    experience: (source.experience ?? []).map((e) => ({
      id: e.id || newId("exp"),
      company: e.company ?? "",
      role: e.role ?? "",
      start_date: e.start_date ?? "",
      end_date: e.end_date ?? "",
      location: e.location ?? "",
      bullets: (e.bullets ?? []).map((b) => ({
        id: b.id || newId("b"),
        text_es: b.text_es ?? "",
        text_en: b.text_en ?? "",
        keywords: b.keywords ?? [],
      })),
    })),
    projects: (source.projects ?? []).map((p) => ({
      id: p.id || newId("proj"),
      name: p.name ?? "",
      date: p.date ?? "",
      bullets: (p.bullets ?? []).map((b) => ({
        id: b.id || newId("b"),
        text_es: b.text_es ?? "",
        text_en: b.text_en ?? "",
        keywords: b.keywords ?? [],
      })),
    })),
    technical_skills: (source.technical_skills ?? []).map((s) => ({
      category: s.category ?? "",
      items: s.items ?? [],
    })),
    soft_skills: source.soft_skills ?? [],
    languages: (source.languages ?? []).map((l) => ({
      language: l.language ?? "",
      level: l.level ?? "",
    })),
    certifications_compliance: source.certifications_compliance ?? [],
  };
}

function undefinedIfEmpty(value: string): string | undefined {
  return value.trim() === "" ? undefined : value;
}

/** Convierte el estado editable de vuelta a la forma que espera PUT /api/profile. */
export function toProfileInput(editable: EditableProfile): ProfileInput {
  return {
    personal: {
      full_name: editable.personal.full_name.trim(),
      headline: undefinedIfEmpty(editable.personal.headline),
      age: editable.personal.age.trim() === "" ? undefined : Number(editable.personal.age),
      photo_path: undefinedIfEmpty(editable.personal.photo_path),
      location: undefinedIfEmpty(editable.personal.location),
      phone: undefinedIfEmpty(editable.personal.phone),
      email: editable.personal.email.trim(),
      website: undefinedIfEmpty(editable.personal.website),
      social_networks: editable.personal.social_networks.filter(
        (s) => s.platform.trim() && s.url.trim(),
      ),
    },
    summary: {
      es: undefinedIfEmpty(editable.summary.es),
      en: undefinedIfEmpty(editable.summary.en),
    },
    founded_companies: editable.founded_companies
      .filter((c) => c.name.trim() && c.role.trim())
      .map((c) => ({
        name: c.name.trim(),
        role: c.role.trim(),
        url: undefinedIfEmpty(c.url),
        description: undefinedIfEmpty(c.description),
      })),
    education: editable.education.map((e) => ({
      id: e.id,
      institution: e.institution.trim(),
      degree: e.degree.trim(),
      start_date: e.start_date.trim(),
      end_date: undefinedIfEmpty(e.end_date),
      location: undefinedIfEmpty(e.location),
    })),
    experience: editable.experience.map((e) => ({
      id: e.id,
      company: e.company.trim(),
      role: e.role.trim(),
      start_date: e.start_date.trim(),
      end_date: undefinedIfEmpty(e.end_date),
      location: undefinedIfEmpty(e.location),
      bullets: e.bullets.map((b) => ({
        id: b.id,
        text_es: b.text_es,
        text_en: b.text_en,
        keywords: b.keywords.filter((k) => k.trim() !== ""),
      })),
    })),
    projects: editable.projects.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      date: undefinedIfEmpty(p.date),
      bullets: p.bullets.map((b) => ({
        id: b.id,
        text_es: b.text_es,
        text_en: b.text_en,
        keywords: b.keywords.filter((k) => k.trim() !== ""),
      })),
    })),
    technical_skills: editable.technical_skills
      .filter((s) => s.category.trim())
      .map((s) => ({
        category: s.category.trim(),
        items: s.items.filter((i) => i.trim() !== ""),
      })),
    soft_skills: editable.soft_skills.filter((s) => s.trim() !== ""),
    languages: editable.languages.filter((l) => l.language.trim() && l.level.trim()),
    certifications_compliance: editable.certifications_compliance.filter(
      (c) => c.trim() !== "",
    ),
  };
}
