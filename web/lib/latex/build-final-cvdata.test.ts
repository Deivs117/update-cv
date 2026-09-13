import { describe, expect, it } from "vitest";
import { buildFinalCVData } from "@/lib/latex/build-final-cvdata";
import type { TailoredContent } from "@/lib/claude/connector.interface";
import type { Profile } from "@/lib/validation/profile.zod";

const profile = {
  personal: { full_name: "David Caicedo", headline_es: "Ingeniero", headline_en: "Engineer" },
  summary: { es: "Resumen base", en: "Base summary" },
  technical_skills: [{ category_es: "Backend", category_en: "Backend", items: ["Node"] }],
  soft_skills: [{ text_es: "Comunicación", text_en: "Communication" }],
  certifications_compliance: ["Certificación base"],
} as unknown as Profile;

function tailored(overrides: Partial<TailoredContent> = {}): TailoredContent {
  return {
    summary: "",
    experience: [],
    projects: [],
    technical_skills: [],
    soft_skills: [],
    certifications_compliance: [],
    ...overrides,
  };
}

describe("buildFinalCVData", () => {
  it("usa el summary de tailored cuando viene con contenido", () => {
    const data = buildFinalCVData(profile, "es", tailored({ summary: "Resumen adaptado" }));
    expect(data.summary).toBe("Resumen adaptado");
  });

  it("cae al summary del perfil base si tailored.summary viene vacío", () => {
    const data = buildFinalCVData(profile, "es", tailored({ summary: "" }));
    expect(data.summary).toBe("Resumen base");
  });

  it("mapea experience de tailored a la forma de CVData (bullets como texto plano + tags dedup)", () => {
    const data = buildFinalCVData(
      profile,
      "es",
      tailored({
        experience: [
          {
            id: "exp-1",
            company: "Acme",
            role: "Ingeniero",
            start_date: "2020",
            bullets: [
              { id: "b1", text: "Hice X", keywords: ["x", "x"] },
              { id: "b2", text: "Hice Y", keywords: ["y"] },
            ],
          },
        ],
      }),
    );
    expect(data.experience).toEqual([
      {
        company: "Acme",
        role: "Ingeniero",
        start_date: "2020",
        end_date: undefined,
        location: undefined,
        bullets: ["Hice X", "Hice Y"],
        tags: ["x", "y"],
      },
    ]);
  });

  it("mapea projects de tailored igual que experience", () => {
    const data = buildFinalCVData(
      profile,
      "es",
      tailored({
        projects: [{ id: "p1", name: "Proyecto", bullets: [{ id: "b1", text: "Hice Z", keywords: [] }] }],
      }),
    );
    expect(data.projects[0]).toEqual({ name: "Proyecto", date: undefined, bullets: ["Hice Z"], tags: [] });
  });

  it("technical_skills/soft_skills/certifications caen al perfil base cuando tailored viene vacío", () => {
    const data = buildFinalCVData(profile, "es", tailored());
    expect(data.technical_skills).toEqual([{ category: "Backend", items: ["Node"] }]);
    expect(data.soft_skills).toEqual(["Comunicación"]);
    expect(data.certifications_compliance).toEqual(["Certificación base"]);
  });

  it("technical_skills/soft_skills/certifications usan tailored cuando trae contenido (selección por vacante)", () => {
    const data = buildFinalCVData(
      profile,
      "es",
      tailored({
        technical_skills: [{ category: "Frontend", items: ["React"] }],
        soft_skills: ["Liderazgo"],
        certifications_compliance: ["Certificación de la vacante"],
      }),
    );
    expect(data.technical_skills).toEqual([{ category: "Frontend", items: ["React"] }]);
    expect(data.soft_skills).toEqual(["Liderazgo"]);
    expect(data.certifications_compliance).toEqual(["Certificación de la vacante"]);
  });
});
