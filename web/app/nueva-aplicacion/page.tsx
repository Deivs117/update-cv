"use client";

import { useState } from "react";
import type { JobAnalysis, Language } from "@/lib/claude/connector.interface";

type Step = "vacante" | "opciones" | "resultado";

interface GenerateResult {
  slug: string;
  pages: number;
  recommendedMaxPages: number;
  experienceYears: number;
  jobAnalysis: JobAnalysis;
  pdfUrl: string;
}

export default function NuevaAplicacionPage() {
  const [step, setStep] = useState<Step>("vacante");
  const [jobDescription, setJobDescription] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [language, setLanguage] = useState<Language>("es");
  const [templateVariant, setTemplateVariant] = useState<"ats" | "visual">("ats");

  const [jobAnalysis, setJobAnalysis] = useState<JobAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function handleAnalyze() {
    setError(null);
    setAnalyzing(true);
    try {
      const res = await fetch("/api/nueva-aplicacion/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setJobAnalysis(json.analysis);
      setStep("opciones");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falló el análisis de la vacante.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    setStep("resultado");
    try {
      const res = await fetch("/api/nueva-aplicacion/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription,
          company,
          role,
          language,
          templateVariant,
          jobAnalysis,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falló la generación del CV.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 pb-24">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Nueva aplicación
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Genera un CV a la medida de una vacante específica.
        </p>
      </header>

      <ol className="flex gap-4 text-sm text-zinc-500">
        <li className={step === "vacante" ? "font-semibold text-zinc-900 dark:text-zinc-100" : ""}>
          1. Vacante
        </li>
        <li className={step === "opciones" ? "font-semibold text-zinc-900 dark:text-zinc-100" : ""}>
          2. Opciones
        </li>
        <li className={step === "resultado" ? "font-semibold text-zinc-900 dark:text-zinc-100" : ""}>
          3. Resultado
        </li>
      </ol>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {step === "vacante" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Empresa</span>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Puesto</span>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Texto de la vacante</span>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={14}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="Pega aquí el texto completo de la oferta de empleo..."
            />
          </label>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || !jobDescription.trim() || !company.trim() || !role.trim()}
            className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {analyzing ? "Analizando..." : "Analizar vacante"}
          </button>
        </div>
      )}

      {step === "opciones" && jobAnalysis && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <h2 className="mb-2 font-semibold">Resumen de lo que pide la vacante</h2>
            <p>
              <span className="font-medium">Seniority:</span> {jobAnalysis.seniority}
            </p>
            <p>
              <span className="font-medium">Skills técnicas:</span>{" "}
              {jobAnalysis.required_technical_skills.join(", ") || "—"}
            </p>
            <p>
              <span className="font-medium">Soft skills:</span>{" "}
              {jobAnalysis.soft_skills.join(", ") || "—"}
            </p>
            <p>
              <span className="font-medium">Keywords de sector:</span>{" "}
              {jobAnalysis.sector_keywords.join(", ") || "—"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="font-medium">Idioma</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={language === "es"}
                  onChange={() => setLanguage("es")}
                />
                Español
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={language === "en"}
                  onChange={() => setLanguage("en")}
                />
                English
              </label>
            </fieldset>

            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="font-medium">Plantilla</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={templateVariant === "ats"}
                  onChange={() => setTemplateVariant("ats")}
                />
                ATS-safe (recomendada)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={templateVariant === "visual"}
                  onChange={() => setTemplateVariant("visual")}
                />
                Visual con foto (NO ATS-safe)
              </label>
            </fieldset>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("vacante")}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Generar CV
            </button>
          </div>
        </div>
      )}

      {step === "resultado" && (
        <div className="flex flex-col gap-4">
          {generating && (
            <p className="text-sm text-zinc-500">
              Generando... (análisis, selección de contenido, compilación LaTeX)
            </p>
          )}

          {result && (
            <>
              <div className="rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
                Generado en <code>apps/{result.slug}/</code> — {result.pages} página
                {result.pages === 1 ? "" : "s"}.
                {result.pages > result.recommendedMaxPages ? (
                  <>
                    {" "}
                    Se recomienda un máximo de {result.recommendedMaxPages} página
                    {result.recommendedMaxPages === 1 ? "" : "s"} para tu nivel de experiencia (
                    {result.experienceYears} años) — considera recortar contenido menos relevante
                    en el editor de LaTeX o en tu perfil. Esto es solo una recomendación, el PDF
                    generado es completamente válido.
                  </>
                ) : (
                  " Dentro del máximo recomendado para tu nivel de experiencia."
                )}
              </div>
              <iframe
                src={result.pdfUrl}
                className="h-[70vh] w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
                title="Vista previa del CV generado"
              />
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setStep("vacante");
              setResult(null);
              setJobAnalysis(null);
            }}
            className="self-start rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Nueva aplicación
          </button>
        </div>
      )}
    </div>
  );
}
