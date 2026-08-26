"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ApplicationMetadata } from "@/lib/apps-io";

type Banner = { kind: "info" | "success" | "error"; text: string } | null;

export default function ApplicationDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [metadata, setMetadata] = useState<ApplicationMetadata | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [cvTex, setCvTex] = useState("");
  const [coverLetterTex, setCoverLetterTex] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [recompiling, setRecompiling] = useState<"cv" | "cover_letter" | null>(null);
  const [cacheBust, setCacheBust] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [metadataRes, jobRes, texRes] = await Promise.all([
          fetch(`/api/apps/${slug}/metadata.json`),
          fetch(`/api/apps/${slug}/job_description.txt`),
          fetch(`/api/apps/${slug}/cv.tex`),
        ]);
        if (!metadataRes.ok) throw new Error("No se encontró esta aplicación.");
        const meta: ApplicationMetadata = await metadataRes.json();
        if (cancelled) return;
        setMetadata(meta);
        setJobDescription(jobRes.ok ? await jobRes.text() : "");
        setCvTex(texRes.ok ? await texRes.text() : "");

        if (meta.coverLetter === "pdf") {
          const letterTexRes = await fetch(`/api/apps/${slug}/cover_letter.tex`);
          if (letterTexRes.ok) setCoverLetterTex(await letterTexRes.text());
        }
      } catch (err) {
        if (!cancelled) {
          setBanner({
            kind: "error",
            text: err instanceof Error ? err.message : "Falló la carga de la aplicación.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handleRegenerate() {
    setRegenerating(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/apps/${slug}/regenerate`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMetadata((prev) => (prev ? { ...prev, pages: json.pages } : prev));
      const texRes = await fetch(`/api/apps/${slug}/cv.tex`);
      if (texRes.ok) setCvTex(await texRes.text());
      setCacheBust(Date.now());
      setBanner({
        kind: "success",
        text: `Regenerado con tu perfil actual: ${json.pages} página${json.pages === 1 ? "" : "s"} (se recomiendan ${json.recommendedMaxPages}).`,
      });
    } catch (err) {
      setBanner({
        kind: "error",
        text: err instanceof Error ? err.message : "Falló la regeneración.",
      });
    } finally {
      setRegenerating(false);
    }
  }

  async function handleRecompile(file: "cv" | "cover_letter") {
    setRecompiling(file);
    setBanner(null);
    try {
      const tex = file === "cv" ? cvTex : (coverLetterTex ?? "");
      const res = await fetch(`/api/apps/${slug}/recompile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tex, file }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (file === "cv") setMetadata((prev) => (prev ? { ...prev, pages: json.pages } : prev));
      setCacheBust(Date.now());
      setBanner({
        kind: "success",
        text: `Recompilado: ${json.pages} página${json.pages === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      // Manejo de errores de compilación visible en UI (sección 16, Fase 7):
      // el mensaje incluye el resumen del log de LaTeX tal cual lo produjo tectonic/pdflatex.
      setBanner({
        kind: "error",
        text: err instanceof Error ? err.message : "Falló la recompilación.",
      });
    } finally {
      setRecompiling(null);
    }
  }

  if (loading) return <div className="p-8 text-zinc-500">Cargando...</div>;
  if (!metadata) {
    return (
      <div className="p-8 text-red-600 dark:text-red-400">
        {banner?.text ?? "No se encontró esta aplicación."}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 pb-24">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {metadata.role} — {metadata.company}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <code>apps/{slug}/</code> · {metadata.language.toUpperCase()} ·{" "}
          {metadata.templateVariant === "visual" ? "Visual" : "ATS-safe"} · {metadata.pages}{" "}
          página{metadata.pages === 1 ? "" : "s"} (se recomiendan {metadata.recommendedMaxPages})
        </p>
      </header>

      {banner && (
        <div
          className={
            "rounded-md border px-4 py-3 text-sm whitespace-pre-wrap font-mono " +
            (banner.kind === "error"
              ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              : banner.kind === "success"
                ? "border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                : "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300")
          }
        >
          {banner.text}
        </div>
      )}

      <button
        type="button"
        onClick={handleRegenerate}
        disabled={regenerating}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        title="Vuelve a correr todo el pipeline (análisis + selección + compilación) con tu perfil actual"
      >
        {regenerating ? "Regenerando..." : "Regenerar con mi perfil actual"}
      </button>

      <iframe
        key={`cv-${cacheBust}`}
        src={`/api/apps/${slug}/cv.pdf?t=${cacheBust}`}
        className="h-[60vh] w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
        title="CV generado"
      />

      <details className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <summary className="cursor-pointer font-semibold">
          Editor LaTeX avanzado (CV) — editar y recompilar sin Claude
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={cvTex}
            onChange={(e) => setCvTex(e.target.value)}
            rows={20}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-mono dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            onClick={() => handleRecompile("cv")}
            disabled={recompiling === "cv"}
            className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {recompiling === "cv" ? "Compilando..." : "Recompilar CV"}
          </button>
        </div>
      </details>

      {metadata.coverLetter === "pdf" && coverLetterTex && (
        <>
          <iframe
            key={`letter-${cacheBust}`}
            src={`/api/apps/${slug}/cover_letter.pdf?t=${cacheBust}`}
            className="h-[60vh] w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
            title="Carta de presentación generada"
          />
          <details className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <summary className="cursor-pointer font-semibold">
              Editor LaTeX avanzado (carta) — editar y recompilar sin Claude
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                value={coverLetterTex}
                onChange={(e) => setCoverLetterTex(e.target.value)}
                rows={16}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-mono dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                onClick={() => handleRecompile("cover_letter")}
                disabled={recompiling === "cover_letter"}
                className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                {recompiling === "cover_letter" ? "Compilando..." : "Recompilar carta"}
              </button>
            </div>
          </details>
        </>
      )}

      {metadata.coverLetter === "text" && (
        <details className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <summary className="cursor-pointer font-semibold">Carta de presentación (texto)</summary>
          <a
            href={`/api/apps/${slug}/cover_letter.txt`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm underline"
          >
            Abrir cover_letter.txt
          </a>
        </details>
      )}

      <details className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <summary className="cursor-pointer font-semibold">Vacante original</summary>
        <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">
          {jobDescription}
        </pre>
      </details>
    </div>
  );
}
