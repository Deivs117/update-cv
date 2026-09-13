import { describe, expect, it } from "vitest";
import { buildContactLine, escapeLatex, renderCV, type CVData } from "@/lib/latex/render";

describe("escapeLatex", () => {
  it("no toca texto plano sin caracteres especiales", () => {
    expect(escapeLatex("Ingeniero de Software")).toBe("Ingeniero de Software");
  });

  it.each([
    ["&", "\\&"],
    ["%", "\\%"],
    ["$", "\\$"],
    ["#", "\\#"],
    ["_", "\\_"],
    ["{", "\\{"],
    ["}", "\\}"],
  ])("escapa '%s' como '%s'", (input, expected) => {
    expect(escapeLatex(input)).toBe(expected);
  });

  it("escapa '\\\\' como \\textbackslash{} (no \\\\, que rompería LaTeX)", () => {
    expect(escapeLatex("\\")).toBe("\\textbackslash{}");
  });

  it("escapa '~' como \\textasciitilde{}", () => {
    expect(escapeLatex("~")).toBe("\\textasciitilde{}");
  });

  it("escapa '^' como \\textasciicircum{}", () => {
    expect(escapeLatex("^")).toBe("\\textasciicircum{}");
  });

  it("escapa varios caracteres especiales combinados en una sola cadena", () => {
    expect(escapeLatex("50% de C# & C++")).toBe("50\\% de C\\# \\& C++");
  });

  it("un salario/nota como '$3.000 USD' no rompe el documento", () => {
    expect(escapeLatex("$3.000 USD")).toBe("\\$3.000 USD");
  });
});

describe("buildContactLine", () => {
  const base: CVData = {
    language: "es",
    full_name: "David Caicedo",
    social_networks: [],
    experience: [],
    projects: [],
    education: [],
    technical_skills: [],
    soft_skills: [],
    languages: [],
    certifications_compliance: [],
    founded_companies: [],
  };

  it("omite los campos ausentes (location/phone/email/website)", () => {
    expect(buildContactLine(base)).toBe("");
  });

  it("une los campos presentes con el separador \\textbar", () => {
    const line = buildContactLine({ ...base, location: "Bogotá", email: "d@x.com" });
    expect(line).toBe("Bogotá \\textbar\\ d@x.com");
  });

  it("incluye las redes sociales como 'plataforma: url', y escapa el contenido", () => {
    const line = buildContactLine({
      ...base,
      social_networks: [{ platform: "GitHub", url: "https://github.com/d_avid" }],
    });
    expect(line).toBe("GitHub: https://github.com/d\\_avid");
  });
});

describe("renderCV", () => {
  // Contra las plantillas reales del repo (templates/latex/cv-{es,en}.tex.tpl)
  // -- son archivos versionados y deterministas, no un servicio externo, así
  // que probarlas de punta a punta (sin mockear el readFile) es seguro y más
  // representativo que mockear la lectura del template.
  const fullData: CVData = {
    language: "es",
    full_name: "David Caicedo",
    headline: "Ingeniero de Software",
    location: "Bogotá",
    email: "david@example.com",
    social_networks: [],
    summary: "Resumen de prueba",
    experience: [
      {
        company: "Acme",
        role: "Ingeniero",
        start_date: "2020",
        end_date: "present",
        bullets: ["Hice X con $500 de presupuesto"],
      },
    ],
    projects: [{ name: "Proyecto Uno", bullets: ["Construí Z"] }],
    education: [{ institution: "Universidad X", degree: "Ingeniería" }],
    technical_skills: [{ category: "Backend", items: ["Node"] }],
    soft_skills: ["Comunicación"],
    languages: [{ language: "Inglés", level: "Avanzado" }],
    certifications_compliance: ["AWS Certified"],
    founded_companies: [{ name: "Startup", role: "Fundador" }],
  };

  it("sustituye todos los placeholders -- no debe quedar ningún {{...}} sin reemplazar", async () => {
    const tex = await renderCV(fullData);
    expect(tex).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("escapa contenido con caracteres especiales de LaTeX sin usar la interpretación de '$&' de String.replace", async () => {
    const tex = await renderCV(fullData);
    // Si el reemplazo usara un string en vez de una función, "$500" dentro
    // del bullet se interpretaría como "$&" (inserta el match completo) y
    // corrompería el documento -- esto confirma que no pasa.
    expect(tex).toContain("Hice X con \\$500 de presupuesto");
  });

  it("una sección vacía (ej. sin founded_companies) no deja el heading sin contenido", async () => {
    const tex = await renderCV({ ...fullData, founded_companies: [] });
    expect(tex).not.toContain("Empresas Fundadas");
  });

  it("renderiza la plantilla en inglés cuando language='en' (headings/labels en inglés)", async () => {
    const tex = await renderCV({ ...fullData, language: "en" });
    expect(tex).toContain("Experience");
    expect(tex).not.toContain("Experiencia");
  });

  it("un end_date 'present' usa la etiqueta localizada, no el string 'present' literal", async () => {
    const tex = await renderCV(fullData);
    expect(tex).toContain("Presente");
    expect(tex).not.toContain("present}");
  });
});
