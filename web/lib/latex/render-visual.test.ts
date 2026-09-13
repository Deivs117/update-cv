import { describe, expect, it } from "vitest";
import { renderVisualCV } from "@/lib/latex/render-visual";
import type { CVData } from "@/lib/latex/render";

// Contra la plantilla real del repo (templates/latex/cv-visual.tex.tpl) --
// mismo criterio que render.test.ts: es un archivo versionado y
// determinista, no hace falta mockear el readFile.
//
// prepareVisualAssets() (copia documentMETADATA.cls/fonts/foto a un
// directorio de salida real) queda fuera de este ticket a propósito: es
// I/O de escritura genuino sobre un directorio de trabajo, no lectura de un
// fixture estático -- se deja documentado como pendiente, no automatizado.
const fullData: CVData = {
  language: "es",
  full_name: "David Andrés Caicedo Samboni",
  headline: "Ingeniero de Software",
  phone: "+57 300 0000000",
  email: "david@example.com",
  location: "Bogotá",
  website: "https://david.dev",
  social_networks: [{ platform: "GitHub", url: "https://github.com/david" }],
  summary: "Resumen de prueba",
  experience: [
    {
      company: "Acme",
      role: "Ingeniero",
      start_date: "2020",
      end_date: "present",
      location: "Remoto",
      bullets: ["Hice X"],
      tags: ["Node"],
    },
  ],
  projects: [{ name: "Proyecto Uno", date: "2021", bullets: ["Construí Z"], tags: ["React"] }],
  education: [{ institution: "Universidad X", degree: "Ingeniería", start_date: "2014", end_date: "2019" }],
  technical_skills: [{ category: "Backend", items: ["Node"] }],
  soft_skills: ["Comunicación"],
  languages: [{ language: "Inglés", level: "Avanzado" }],
  certifications_compliance: ["AWS Certified"],
  founded_companies: [{ name: "Startup", role: "Fundador", description: "Descripción" }],
};

describe("renderVisualCV", () => {
  it("sustituye todos los placeholders -- no debe quedar ningún {{...}} sin reemplazar", async () => {
    const tex = await renderVisualCV(fullData);
    expect(tex).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("separa full_name en first/last (primer token vs. el resto)", async () => {
    const tex = await renderVisualCV(fullData);
    expect(tex).toContain("David");
    expect(tex).toContain("Andrés Caicedo Samboni");
  });

  it("un nombre de una sola palabra deja last vacío sin romper el placeholder", async () => {
    const tex = await renderVisualCV({ ...fullData, full_name: "Madonna" });
    expect(tex).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("sin foto, {{PHOTO_COMMAND}} queda vacío (no aparece \\photo)", async () => {
    const tex = await renderVisualCV(fullData);
    expect(tex).not.toContain("\\photo{");
  });

  it("con foto, agrega el comando \\photo con el nombre de archivo dado", async () => {
    const tex = await renderVisualCV(fullData, { photoFileName: "photo.jpg" });
    expect(tex).toContain("\\photo{2.5cm}{photo.jpg}");
  });

  it("un end_date 'present' usa la etiqueta localizada, no el string 'present' literal", async () => {
    const tex = await renderVisualCV(fullData);
    expect(tex).toContain("Presente");
    expect(tex).not.toContain("{present}");
  });

  it("renderiza en inglés cuando language='en'", async () => {
    const tex = await renderVisualCV({ ...fullData, language: "en" });
    expect(tex).toContain("Professional Experience");
  });

  it("sin idiomas NI soft skills, la sección de dos columnas no se renderiza en absoluto", async () => {
    const tex = await renderVisualCV({ ...fullData, languages: [], soft_skills: [] });
    expect(tex).not.toContain("\\twocolumnsection");
  });

  it("con soft skills pero sin idiomas, el lado de idiomas queda vacío y el de soft skills no", async () => {
    const tex = await renderVisualCV({ ...fullData, languages: [] });
    expect(tex).toContain("\\twocolumnsection\n{}\n{\\sectionTitle");
  });
});
