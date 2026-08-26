/**
 * Script de prueba de la Fase 3: renderiza + compila un CV en ES y EN a
 * partir de un perfil de ejemplo ESTÁTICO (sin llamar a Claude), para
 * validar el pipeline render.ts -> compile.ts -> page-count.ts de punta a
 * punta antes de construir el motor de generación (Fase 4).
 *
 * Uso:
 *   cd web && npm run test-latex
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "@/lib/profile-io";
import { profileSchema, type Profile } from "@/lib/validation/profile.zod";
import { profileToCVData } from "@/lib/latex/profile-to-cvdata";
import { renderCV } from "@/lib/latex/render";
import { compileLatex, LatexCompileError } from "@/lib/latex/compile";
import { countPdfPages } from "@/lib/latex/page-count";
import { prepareVisualAssets, renderVisualCV } from "@/lib/latex/render-visual";

const OUTPUT_DIR = path.join(REPO_ROOT, ".fase3-test-output");

// Perfil de ejemplo estático (independiente de data/profile.json), basado en
// el ejemplo de la sección 6.1 del documento de arquitectura.
const SAMPLE_PROFILE: Profile = {
  personal: {
    full_name: "David Caicedo Samboni",
    headline_es: "Ingeniero Mecatrónico especializado en IA",
    headline_en: "Mechatronics Engineer specialized in AI",
    photo_path: "data/raw/images/foto_perfil.jpg",
    location: "Cali, Colombia",
    phone: "+57 310 331 9477",
    email: "davidcaicedosamboni@gmail.com",
    website: "https://deivs117.github.io/portfolio/",
    social_networks: [
      { platform: "linkedin", url: "https://www.linkedin.com/in/davidcaicedo-flux-solutions" },
      { platform: "github", url: "https://github.com/Deivs117" },
    ],
  },
  summary: {
    es: "Ingeniero mecatrónico especializado en hardware, software y datos, con experiencia en sistemas autónomos y edge AI.",
    en: "Mechatronics engineer specializing in hardware, software, and data, with experience in autonomous systems and edge AI.",
  },
  founded_companies: [
    {
      name: "Flux Solutions Cali",
      role_es: "Cofundador",
      role_en: "Co-founder",
      url: "https://instagram.com/fluxsolutionscali",
      description_es: "Lidera todo el flujo de manufactura sustractiva CNC del negocio.",
      description_en: "Leads the entire CNC subtractive manufacturing workflow of the business.",
    },
  ],
  education: [
    {
      id: "edu-1",
      institution: "Universidad Autónoma de Occidente",
      degree_es: "Ingeniería Mecatrónica",
      degree_en: "Mechatronics Engineering",
      start_date: "2021-01",
      end_date: "2026-01",
      location: "Cali, Colombia",
    },
  ],
  experience: [
    {
      id: "exp-1",
      company: "Flux Solutions Cali",
      role_es: "Ingeniero Líder de Mecatrónica",
      role_en: "Lead Mechatronics Engineer",
      start_date: "2026-01",
      end_date: "present",
      location: "Cali, Colombia",
      bullets: [
        {
          id: "exp-1-b1",
          text_es:
            "Diseñé e implementé un backend serverless en Azure para telemetría industrial en tiempo real, con soporte para C#, C++ y presupuestos con signo $ (prueba de escape LaTeX).",
          text_en:
            "Designed and implemented an Azure serverless backend for real-time industrial telemetry, supporting C#, C++, and $ budget figures (LaTeX escaping test).",
          keywords: ["azure", "iot", "telemetry"],
        },
        {
          id: "exp-1-b2",
          text_es: "Certificación ISO/IEC 42001 & ISO 9001 aplicadas al proceso de manufactura.",
          text_en: "ISO/IEC 42001 & ISO 9001 certifications applied to the manufacturing process.",
          keywords: ["iso", "quality"],
        },
      ],
    },
  ],
  projects: [
    {
      id: "proj-salli",
      name: "SALLI: Salamander Autonomous Locomotion on Land Infrastructure",
      date: "2025",
      bullets: [
        {
          id: "proj-salli-b1",
          text_es: "Desarrollé el firmware de control en C++ para múltiples ESP32.",
          text_en: "Developed the C++ control firmware for multiple ESP32 units.",
          keywords: ["ros", "esp32", "cnn"],
        },
      ],
    },
  ],
  technical_skills: [
    {
      category_es: "IA de Borde y Visión Embebida",
      category_en: "Edge AI & Embedded Vision",
      items: ["Edge Impulse", "ESP32", "ESP-CAM"],
    },
    {
      category_es: "Lenguajes de Programación",
      category_en: "Programming Languages",
      items: ["C++", "C", "C#", "Python", "JavaScript", "SQL", "Bash"],
    },
  ],
  soft_skills: ["Cross-Functional Leadership", "Research-Driven Problem Solving"],
  languages: [
    { language: "Spanish", level: "Native" },
    { language: "English", level: "B2" },
  ],
  certifications_compliance: ["ISO 9001", "ISO 10218", "ISO/TS 15066", "ISO 13482", "ISO/IEC 42001"],
  meta: { schema_version: "1.0", last_updated: new Date().toISOString() },
};

async function main() {
  console.log("Fase 3 — Prueba de renderizado + compilación LaTeX (perfil estático, sin IA)\n");

  // Sanity check: el fixture debe cumplir el mismo schema que un perfil real.
  profileSchema.parse(SAMPLE_PROFILE);

  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const language of ["es", "en"] as const) {
    console.log(`--- Idioma: ${language} ---`);
    const cvData = profileToCVData(SAMPLE_PROFILE, language);
    const tex = await renderCV(cvData);

    const texFileName = `cv-${language}.tex`;
    await writeFile(path.join(OUTPUT_DIR, texFileName), tex, "utf-8");
    console.log(`  .tex escrito en ${path.join(OUTPUT_DIR, texFileName)}`);

    try {
      const { pdfPath } = await compileLatex(texFileName, OUTPUT_DIR);
      const pages = await countPdfPages(pdfPath);
      console.log(`  ✅ Compilado: ${pdfPath} (${pages} página${pages === 1 ? "" : "s"})`);
    } catch (err) {
      if (err instanceof LatexCompileError) {
        console.error(`  ❌ Falló la compilación:\n${err.message}`);
      } else {
        console.error("  ❌ Error inesperado:", err);
      }
      process.exitCode = 1;
    }
  }

  console.log("--- Plantilla visual (secundaria, con foto, NO ATS-safe) ---");
  const visualDir = path.join(OUTPUT_DIR, "visual");
  await mkdir(visualDir, { recursive: true });

  const photoAbsolutePath = path.join(REPO_ROOT, SAMPLE_PROFILE.personal.photo_path!);
  const { photoFileName } = await prepareVisualAssets(visualDir, photoAbsolutePath);

  const visualCvData = profileToCVData(SAMPLE_PROFILE, "es");
  const visualTex = await renderVisualCV(visualCvData, { photoFileName });
  const visualTexFileName = "cv-visual.tex";
  await writeFile(path.join(visualDir, visualTexFileName), visualTex, "utf-8");
  console.log(`  .tex escrito en ${path.join(visualDir, visualTexFileName)}`);

  try {
    const { pdfPath } = await compileLatex(visualTexFileName, visualDir);
    const pages = await countPdfPages(pdfPath);
    console.log(`  ✅ Compilado: ${pdfPath} (${pages} página${pages === 1 ? "" : "s"})`);
  } catch (err) {
    if (err instanceof LatexCompileError) {
      console.error(`  ❌ Falló la compilación:\n${err.message}`);
    } else {
      console.error("  ❌ Error inesperado:", err);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
