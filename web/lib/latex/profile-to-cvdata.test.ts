import { describe, expect, it } from "vitest";
import { profileToCVData } from "@/lib/latex/profile-to-cvdata";
import type { Profile } from "@/lib/validation/profile.zod";

// Fixture con al menos un elemento de cada colección que profileToCVData
// transforma, para ejercitar los 5 `.map()` en una sola pasada. Cast igual
// que tailoring.test.ts -- solo importan los campos que este adaptador lee.
const profile = {
  personal: {
    full_name: "David Caicedo",
    headline_es: "Ingeniero de software",
    headline_en: "Software engineer",
    location: "Bogotá, Colombia",
    phone: "+57 300 0000000",
    email: "david@example.com",
    website: "https://david.dev",
    social_networks: [{ platform: "GitHub", url: "https://github.com/david" }],
  },
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
      bullets: [{ id: "b1", text_es: "Hice X", text_en: "Did X", keywords: ["x", "x"] }],
    },
  ],
  projects: [
    {
      id: "proj-1",
      name: "Proyecto Uno",
      date: "2021",
      bullets: [{ id: "pb1", text_es: "Construí Z", text_en: "Built Z", keywords: ["z"] }],
    },
  ],
  education: [
    {
      institution: "Universidad X",
      degree_es: "Ingeniería",
      degree_en: "Engineering",
      start_date: "2014",
      end_date: "2019",
      location: "Bogotá",
    },
  ],
  technical_skills: [{ category_es: "Backend", category_en: "Backend", items: ["Node"] }],
  soft_skills: [{ text_es: "Comunicación", text_en: "Communication" }],
  languages: [{ language_es: "Inglés", language_en: "English", level_es: "Avanzado", level_en: "Advanced" }],
  certifications_compliance: ["AWS Certified"],
  founded_companies: [
    { name: "Startup Uno", role_es: "Fundador", role_en: "Founder", description_es: "Descripción", description_en: "Description" },
  ],
} as unknown as Profile;

describe("profileToCVData", () => {
  it("resuelve todos los campos bilingües al español", () => {
    const data = profileToCVData(profile, "es");
    expect(data.headline).toBe("Ingeniero de software");
    expect(data.summary).toBe("Resumen ES");
    expect(data.experience[0].role).toBe("Ingeniero");
    expect(data.experience[0].bullets).toEqual(["Hice X"]);
    expect(data.education[0].degree).toBe("Ingeniería");
    expect(data.technical_skills[0].category).toBe("Backend");
    expect(data.soft_skills).toEqual(["Comunicación"]);
    expect(data.languages[0]).toEqual({ language: "Inglés", level: "Avanzado" });
    expect(data.founded_companies[0].role).toBe("Fundador");
  });

  it("resuelve todos los campos bilingües al inglés", () => {
    const data = profileToCVData(profile, "en");
    expect(data.headline).toBe("Software engineer");
    expect(data.summary).toBe("Summary EN");
    expect(data.experience[0].role).toBe("Engineer");
    expect(data.experience[0].bullets).toEqual(["Did X"]);
  });

  it("deduplica los keywords de los bullets en `tags`", () => {
    const data = profileToCVData(profile, "es");
    expect(data.experience[0].tags).toEqual(["x"]); // ["x", "x"] -> Set -> ["x"]
  });

  it("incluye TODOS los bullets, sin selección (a diferencia de tailoring.ts)", () => {
    const data = profileToCVData(profile, "es");
    expect(data.experience[0].bullets).toHaveLength(1);
    expect(data.projects[0].bullets).toEqual(["Construí Z"]);
  });

  it("colecciones ausentes en el perfil se resuelven a arrays vacíos, no undefined", () => {
    const minimal = {
      personal: { full_name: "X", headline_es: "", headline_en: "" },
      summary: { es: "", en: "" },
    } as unknown as Profile;
    const data = profileToCVData(minimal, "es");
    expect(data.experience).toEqual([]);
    expect(data.projects).toEqual([]);
    expect(data.education).toEqual([]);
    expect(data.languages).toEqual([]);
    expect(data.certifications_compliance).toEqual([]);
    expect(data.founded_companies).toEqual([]);
    expect(data.social_networks).toEqual([]);
  });
});
