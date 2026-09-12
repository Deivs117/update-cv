/**
 * Storage privado de PDFs generados (issue #10) -- bucket privado, nunca
 * URLs públicas permanentes. Solo se usa en modo hosteado (STORAGE_MODE=hosted,
 * ver #13), del lado del servidor, con la secret key (nunca la publishable
 * key, que es la que se expone al cliente para Auth).
 */
import { createClient } from "@supabase/supabase-js";

export const GENERATED_PDFS_BUCKET = "generated-pdfs";

/** URL de corta duración -- suficiente para previsualizar/descargar, nunca permanente. */
const DEFAULT_SIGNED_URL_EXPIRES_SECONDS = 60 * 5;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta ${name}. Requerida en modo hosteado (STORAGE_MODE=hosted) -- ver la sección ` +
        `de gestión de secretos en CLAUDE.md para cómo obtenerla sin copiarla a mano del dashboard.`,
    );
  }
  return value;
}

let cachedClient: ReturnType<typeof createClient> | undefined;

/**
 * Cliente admin de Supabase (secret key -- nunca exponer al cliente). Se usa
 * únicamente del lado del servidor para subir archivos y firmar URLs.
 */
function getAdminClient() {
  if (!cachedClient) {
    cachedClient = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cachedClient;
}

/**
 * Sube un PDF generado al bucket privado. `path` es relativo dentro del
 * bucket (ej. `{userId}/{applicationId}/cv.pdf`) -- nunca la URL completa,
 * eso se guarda en applications.cv_pdf_path/cover_letter_pdf_path (#8).
 */
export async function uploadGeneratedPdf(path: string, data: Buffer): Promise<void> {
  const { error } = await getAdminClient()
    .storage.from(GENERATED_PDFS_BUCKET)
    .upload(path, data, { contentType: "application/pdf", upsert: true });
  if (error) {
    throw new Error(`No se pudo subir "${path}" al bucket ${GENERATED_PDFS_BUCKET}: ${error.message}`);
  }
}

/**
 * Genera una URL firmada de corta duración para un PDF ya subido. Se llama
 * al vuelo en cada request que necesite mostrar/descargar el PDF -- nunca se
 * guarda la URL firmada en la base de datos (expira).
 */
export async function getSignedPdfUrl(
  path: string,
  expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
): Promise<string> {
  const { data, error } = await getAdminClient()
    .storage.from(GENERATED_PDFS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`No se pudo generar una URL firmada para "${path}": ${error?.message}`);
  }
  return data.signedUrl;
}

/** Borra un PDF del bucket (ej. al regenerar una aplicación, para no acumular versiones viejas). */
export async function deleteGeneratedPdf(path: string): Promise<void> {
  const { error } = await getAdminClient().storage.from(GENERATED_PDFS_BUCKET).remove([path]);
  if (error) {
    throw new Error(`No se pudo borrar "${path}" del bucket ${GENERATED_PDFS_BUCKET}: ${error.message}`);
  }
}
