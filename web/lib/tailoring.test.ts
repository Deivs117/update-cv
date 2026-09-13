import { describe, expect, it } from "vitest";
import { buildCandidateContent, resolveTailoredContent } from "@/lib/tailoring";
import type { Profile } from "@/lib/validation/profile.zod";
import type { TailorRawResponse } from "@/lib/validation/generation.zod";

// Fixture mínima: solo los campos que tailoring.ts realmente lee. El cast
// evita pelear con el schema completo de Profile (personal, meta, etc.) que
// no participa en esta lógica -- lo mismo que ya hace usage-quota.test.ts
// mockeando solo lo que se usa.
const profile = {
  summary: { es: "Resumen ES", en: "Summary EN" },
  experience: [
    {
      id: "exp-1",
      company: "Acme",
      role_es: "Ingeniero",
      role_en: "Engineer",
      start_date: "2020-01",
      end_date: "2022-01",
      location: "Remoto",
      bullets: [
        { id: "b1", text_es: "Hice X", text_en: "Did X", keywords: ["x"] },
        { id: "b2", text_es: "Hice Y", text_en: "Did Y", keywords: [] },
      ],
    },
  ],
  projects: [
    {
      id: "proj-1",
      name: "Proyecto Uno",
      date: "2021",
      bullets: [{ id: "pb1", text_es: "Construí Z", text_en: "Built Z", keywords: [] }],
    },
  ],
  technical_skills: [{ category_es: "Backend", category_en: "Backend", items: ["Node"] }],
  soft_skills: [{ text_es: "Comunicación", text_en: "Communication" }],
  certifications_compliance: ["AWS Certified"],
} as unknown as Profile;

describe("buildCandidateContent", () => {
  it("resuelve summary/roles/skills al idioma pedido (es)", () => {
    const candidate = buildCandidateContent(profile, "es");
    expect(candidate.summary).toBe("Resumen ES");
    expect(candidate.experience[0].bullets[0].text).toBe("Hice X");
    expect(candidate.technical_skills[0].category).toBe("Backend");
    expect(candidate.soft_skills).toEqual(["Comunicación"]);
  });

  it("resuelve al idioma pedido (en)", () => {
    const candidate = buildCandidateContent(profile, "en");
    expect(candidate.summary).toBe("Summary EN");
    expect(candidate.experience[0].bullets[0].text).toBe("Did X");
  });

  it("preserva los ids de bullet (Claude los necesita para tailorCV)", () => {
    const candidate = buildCandidateContent(profile, "es");
    expect(candidate.experience[0].bullets.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(candidate.projects[0].bullets[0].id).toBe("pb1");
  });

  it("perfil sin experience/projects/certifications no rompe (arrays vacíos, no undefined)", () => {
    const empty = { summary: { es: "", en: "" } } as unknown as Profile;
    const candidate = buildCandidateContent(empty, "es");
    expect(candidate.experience).toEqual([]);
    expect(candidate.projects).toEqual([]);
    expect(candidate.certifications_compliance).toEqual([]);
  });
});

function rawResponse(overrides: Partial<TailorRawResponse> = {}): TailorRawResponse {
  return {
    summary: "Resumen adaptado",
    experience: [],
    projects: [],
    technical_skills: [],
    soft_skills: [],
    certifications_compliance: [],
    ...overrides,
  };
}

describe("resolveTailoredContent", () => {
  it("reconstruye company/role/fechas del perfil real, nunca de la respuesta de Claude", () => {
    const raw = rawResponse({
      experience: [{ id: "exp-1", bullets: [{ id: "b1", text: "Reescrito", keywords: ["x"] }] }],
    });
    const result = resolveTailoredContent(profile, "es", raw);
    expect(result.experience).toEqual([
      {
        id: "exp-1",
        company: "Acme",
        role: "Ingeniero",
        start_date: "2020-01",
        end_date: "2022-01",
        location: "Remoto",
        bullets: [{ id: "b1", text: "Reescrito", keywords: ["x"] }],
      },
    ]);
  });

  it("descarta un id de experience que Claude inventó (no existe en el perfil)", () => {
    const raw = rawResponse({
      experience: [{ id: "no-existe", bullets: [{ id: "b1", text: "x", keywords: [] }] }],
    });
    const result = resolveTailoredContent(profile, "es", raw);
    expect(result.experience).toEqual([]);
  });

  it("descarta un bullet id inventado, pero conserva la entry si le quedan bullets válidos", () => {
    const raw = rawResponse({
      experience: [
        {
          id: "exp-1",
          bullets: [
            { id: "b1", text: "Válido", keywords: [] },
            { id: "b-inventado", text: "Inventado", keywords: [] },
          ],
        },
      ],
    });
    const result = resolveTailoredContent(profile, "es", raw);
    expect(result.experience[0].bullets).toEqual([{ id: "b1", text: "Válido", keywords: [] }]);
  });

  it("descarta la entry completa si TODOS sus bullets son inventados", () => {
    const raw = rawResponse({
      experience: [{ id: "exp-1", bullets: [{ id: "b-inventado", text: "x", keywords: [] }] }],
    });
    const result = resolveTailoredContent(profile, "es", raw);
    expect(result.experience).toEqual([]);
  });

  it("filtra certifications_compliance contra las que existen de verdad en el perfil", () => {
    const raw = rawResponse({
      certifications_compliance: ["AWS Certified", "Certificación Inventada"],
    });
    const result = resolveTailoredContent(profile, "es", raw);
    expect(result.certifications_compliance).toEqual(["AWS Certified"]);
  });

  it("resuelve el role en inglés cuando language='en'", () => {
    const raw = rawResponse({
      experience: [{ id: "exp-1", bullets: [{ id: "b1", text: "x", keywords: [] }] }],
    });
    const result = resolveTailoredContent(profile, "en", raw);
    expect(result.experience[0].role).toBe("Engineer");
  });
});
