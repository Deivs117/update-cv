/**
 * Cliente de Supabase para Server Components/Route Handlers (issue #11).
 * Usa la publishable key (segura para el navegador) + cookies de sesión --
 * nunca la secret key acá, esa es solo para operaciones admin
 * (web/lib/storage/supabase-storage.ts).
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta ${name}. Requerida en modo hosteado (STORAGE_MODE=hosted).`);
  }
  return value;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          // En un Server Component (no Route Handler/Action) esto puede
          // lanzar porque no se pueden escribir cookies -- se ignora a
          // propósito: proxy.ts ya se encarga de refrescar la sesión.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // no-op, ver comentario arriba
          }
        },
      },
    },
  );
}
