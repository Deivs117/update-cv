/**
 * Refresca la sesión de Supabase en cada request (issue #11). Se llama
 * `proxy.ts`, no `middleware.ts` -- ese file convention quedó deprecado en
 * Next.js 16 (renombrado a Proxy, misma API salvo el nombre del archivo y
 * de la función exportada). Ver CLAUDE.md, "Nunca dejar nada deprecado".
 *
 * Sin esto, un access token de Supabase expirado nunca se refresca del lado
 * del servidor y la sesión se cae silenciosamente.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Modo local (STORAGE_MODE distinto de "hosted"): no hay Supabase
  // configurado y no hace falta -- dejar pasar la request sin tocar nada.
  if (!supabaseUrl || !publishableKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() (no getSession()) valida el token contra el servidor de Auth
  // en vez de solo leer el JWT local -- necesario para que el refresh
  // automático de @supabase/ssr funcione de verdad en cada request.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Excluye assets estáticos y archivos con extensión -- sin esto, Proxy
    // corre en cada request de imagen/CSS/JS y agrega latencia innecesaria.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
