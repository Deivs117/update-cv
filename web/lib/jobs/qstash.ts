/**
 * Publicación y verificación de mensajes de QStash (#15) -- reemplaza la
 * cola en memoria (web/lib/jobs.ts) en modo hosteado: un Vercel Function no
 * sobrevive después de responder, así que "encolar y seguir procesando en
 * segundo plano" (el patrón `void (async () => {...})()` de jobs.ts) no
 * funciona ahí. QStash entrega el mensaje de forma confiable (con
 * reintentos) a un endpoint interno que sí completa el trabajo dentro de su
 * propia invocación, antes de responder.
 *
 * Verificación de firma OBLIGATORIA en cada endpoint interno que QStash
 * invoca -- sin esto, cualquiera podría pegarle directo a esas rutas y
 * disparar generación (con costo real de API) sin pasar por QStash.
 */
import { Client, Receiver } from "@upstash/qstash";

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

let cachedClient: Client | undefined;

function getQStashClient(): Client {
  if (!cachedClient) {
    cachedClient = new Client({ token: getEnv("QSTASH_TOKEN") });
  }
  return cachedClient;
}

/**
 * Publica un mensaje a QStash apuntando a un endpoint interno de este mismo
 * despliegue (`APP_BASE_URL` + `path`, ej. `/api/internal/jobs/generate`).
 * QStash hace el POST con el body y la firma -- nunca lo procesa nosotros
 * de forma síncrona acá.
 */
export async function publishInternalJob(path: string, body: unknown): Promise<void> {
  const baseUrl = getEnv("APP_BASE_URL").replace(/\/$/, "");
  await getQStashClient().publishJSON({ url: `${baseUrl}${path}`, body });
}

export type QstashVerification = { ok: true; body: unknown } | { ok: false };

/**
 * Verifica la firma `Upstash-Signature` contra el body crudo de la request
 * (por eso `request.text()` acá, no `request.json()` -- la firma es sobre
 * los bytes exactos, no sobre el objeto ya parseado). Acepta tanto la
 * signing key actual como la siguiente (rotación de claves de QStash, ver
 * su documentación) -- por eso `nextSigningKey` es obligatoria también.
 */
export async function verifyQstashRequest(request: Request): Promise<QstashVerification> {
  const signature = request.headers.get("upstash-signature");
  if (!signature) return { ok: false };

  const bodyText = await request.text();
  const receiver = new Receiver({
    currentSigningKey: getEnv("QSTASH_CURRENT_SIGNING_KEY"),
    nextSigningKey: getEnv("QSTASH_NEXT_SIGNING_KEY"),
  });

  try {
    // `url` acota la firma al endpoint exacto -- sin esto, una firma válida
    // para /api/internal/jobs/analyze también verificaría contra
    // /api/internal/jobs/generate (ambos comparten las mismas signing keys).
    const isValid = await receiver.verify({ signature, body: bodyText, url: request.url });
    if (!isValid) return { ok: false };
    return { ok: true, body: JSON.parse(bodyText) };
  } catch {
    return { ok: false };
  }
}
