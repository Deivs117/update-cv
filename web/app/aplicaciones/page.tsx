"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApplicationMetadata } from "@/lib/apps-io";

interface ApplicationSummary extends ApplicationMetadata {
  slug: string;
  pdfUrl: string;
  jobDescriptionUrl: string;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AplicacionesPage() {
  const [applications, setApplications] = useState<ApplicationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/apps")
      .then((res) => res.json())
      .then((json) => setApplications(json.applications))
      .catch(() => setError("No se pudo cargar el historial de aplicaciones."));
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 pb-24">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Historial de aplicaciones
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Todas las carpetas de <code>apps/</code>, ordenadas por fecha.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {applications === null && !error && (
        <p className="text-sm text-zinc-500">Cargando...</p>
      )}

      {applications?.length === 0 && (
        <p className="text-sm text-zinc-500">
          Todavía no has generado ninguna aplicación. Ve a{" "}
          <Link href="/nueva-aplicacion" className="underline">
            Nueva aplicación
          </Link>
          .
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {applications?.map((app) => (
          <li
            key={app.slug}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {app.role} — {app.company}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {formatDate(app.createdAt)} · {app.language.toUpperCase()} ·{" "}
                {app.templateVariant === "visual" ? "Visual" : "ATS-safe"} · {app.pages} página
                {app.pages === 1 ? "" : "s"}
                {app.coverLetter !== "none" && " · con carta"}
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href={app.jobDescriptionUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Ver vacante
              </a>
              <Link
                href={`/aplicaciones/${app.slug}`}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Ver / editar
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
