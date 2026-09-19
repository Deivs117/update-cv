/**
 * Tectonic en modo hosteado (#101, spike #19): el paquete vendorizado
 * (web/vendor/tectonic-linux-x64.pack) se extrae una vez por instancia a /tmp
 * -- la única ruta escribible en una Vercel Function -- y se usa siempre con
 * `--only-cached`, así que nunca toca la red.
 */
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodePack } from "./tectonic-pack";

const PACK_NAME = "tectonic-linux-x64.pack";
const RUNTIME_DIR = "/tmp/tectonic-runtime";

export type TectonicRuntime = { binary: string; cacheHome: string };

let inflight: Promise<TectonicRuntime> | undefined;

async function findPack(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "vendor", PACK_NAME),
    path.join(process.cwd(), "web", "vendor", PACK_NAME),
  ];
  for (const c of candidates) {
    try {
      await stat(c);
      return c;
    } catch {}
  }
  throw new Error(
    `No se encontró ${PACK_NAME} (buscado en ${candidates.join(", ")}). ` +
      `Generarlo con "npm run pack-tectonic" y verificar outputFileTracingIncludes en next.config.ts.`,
  );
}

async function extract(): Promise<TectonicRuntime> {
  const binary = path.join(RUNTIME_DIR, "tectonic");
  const cacheHome = path.join(RUNTIME_DIR, "xdg");
  const ready = path.join(RUNTIME_DIR, ".ready");
  try {
    await stat(ready);
    return { binary, cacheHome };
  } catch {}

  const staging = `${RUNTIME_DIR}.${process.pid}.${Date.now()}`;
  await rm(staging, { recursive: true, force: true });
  for (const e of decodePack(await readFile(await findPack()))) {
    const dest = path.join(staging, e.path);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, e.data);
    if (e.executable) await chmod(dest, 0o755);
  }
  await writeFile(path.join(staging, ".ready"), "");
  await rm(RUNTIME_DIR, { recursive: true, force: true });
  await rename(staging, RUNTIME_DIR);
  return { binary, cacheHome };
}

export function getTectonicRuntime(): Promise<TectonicRuntime> {
  inflight ??= extract().catch((err) => {
    inflight = undefined;
    throw err;
  });
  return inflight;
}
