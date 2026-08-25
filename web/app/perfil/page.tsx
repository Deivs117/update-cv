"use client";

import { useEffect, useState } from "react";
import { ProfileForm } from "@/components/profile/ProfileForm";
import {
  emptyProfile,
  toEditableProfile,
  toProfileInput,
  type EditableProfile,
} from "@/components/profile/types";

type Banner = { kind: "info" | "success" | "error"; text: string } | null;

export default function PerfilPage() {
  const [profile, setProfile] = useState<EditableProfile>(emptyProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const profileRes = await fetch("/api/profile");
        const profileJson = await profileRes.json();
        if (!profileRes.ok) throw new Error(profileJson.error);

        if (cancelled) return;

        if (profileJson.profile) {
          setProfile(toEditableProfile(profileJson.profile));
          return;
        }

        // No hay profile.json todavía: si hay un borrador de una extracción
        // previa (Fase 1), lo usamos como punto de partida para revisión.
        const draftRes = await fetch("/api/profile/draft");
        const draftJson = await draftRes.json();
        if (!draftRes.ok) throw new Error(draftJson.error);

        if (cancelled) return;

        if (draftJson.draft) {
          setProfile(toEditableProfile(draftJson.draft));
          setBanner({
            kind: "info",
            text: "Cargado desde un borrador de extracción anterior (data/profile.draft.json). Revísalo y presiona 'Guardar perfil' para confirmarlo como definitivo.",
          });
        }
      } catch (err) {
        if (!cancelled) {
          setBanner({
            kind: "error",
            text: err instanceof Error ? err.message : "No se pudo cargar el perfil.",
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
  }, []);

  async function handleSave() {
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toProfileInput(profile)),
      });
      const json = await res.json();
      if (!res.ok) {
        const detail = Array.isArray(json.details)
          ? json.details
              .map((d: { path: (string | number)[]; message: string }) =>
                `${d.path.join(".")}: ${d.message}`,
              )
              .join(" | ")
          : "";
        throw new Error([json.error, detail].filter(Boolean).join(" — "));
      }
      setProfile(toEditableProfile(json.profile));
      setBanner({ kind: "success", text: "Perfil guardado en data/profile.json." });
    } catch (err) {
      setBanner({
        kind: "error",
        text: err instanceof Error ? err.message : "No se pudo guardar el perfil.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleImport() {
    const confirmed = window.confirm(
      "Esto va a reemplazar el contenido actual del formulario (sin guardar todavía) con una nueva extracción de data/raw/. ¿Continuar?",
    );
    if (!confirmed) return;

    setImporting(true);
    setBanner(null);
    try {
      const res = await fetch("/api/profile/extract", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setProfile(toEditableProfile(json.draft));
      setBanner({
        kind: "info",
        text: "Extracción completada. Revisa los datos y presiona 'Guardar perfil' para confirmarlos.",
      });
    } catch (err) {
      setBanner({
        kind: "error",
        text: err instanceof Error ? err.message : "Falló la importación.",
      });
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-zinc-500">Cargando perfil...</div>;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 pb-24">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Editor de perfil
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Fuente de verdad: <code>data/profile.json</code>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {importing ? "Importando..." : "Importar desde PDF/imágenes"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? "Guardando..." : "Guardar perfil"}
          </button>
        </div>
      </header>

      {banner && (
        <div
          className={
            "rounded-md border px-4 py-3 text-sm " +
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

      <ProfileForm profile={profile} onChange={setProfile} />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? "Guardando..." : "Guardar perfil"}
        </button>
      </div>
    </div>
  );
}
