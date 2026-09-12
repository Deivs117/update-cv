/**
 * Cliente de Supabase para Client Components (issue #11). Publishable key
 * únicamente -- segura para exponerse al navegador (equivalente a la "anon
 * key" del esquema anterior de nombres de Supabase).
 */
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
