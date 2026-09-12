"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleLogin() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 p-6 pt-24 text-center">
      <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
      <p className="text-sm text-neutral-600">
        Accede con tu cuenta de Google para crear/editar tu perfil y generar tus CVs.
      </p>
      <button
        type="button"
        onClick={handleGoogleLogin}
        className="w-full rounded-md border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-50"
      >
        Continuar con Google
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
