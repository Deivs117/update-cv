/**
 * Genera web/vendor/tectonic-linux-x64.pack (#101) a partir de:
 *   1. un binario de tectonic ESTÁTICO (build oficial *-x86_64-unknown-linux-musl;
 *      el de la distro local es dinámico y no corre en Vercel),
 *   2. el directorio "bundles" de un caché de tectonic ya poblado compilando
 *      todas las plantillas reales (sin "formats": tectonic los regenera).
 *
 * Uso: cd web && npm run pack-tectonic -- <ruta-al-binario> [<dir-cache-tectonic>]
 *   (dir por defecto: ~/.cache/tectonic)
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { encodePack, type PackEntry } from "@/lib/latex/tectonic-pack";

async function walk(dir: string, base: string, out: PackEntry[]): Promise<void> {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) await walk(full, base, out);
    else if (d.isFile()) {
      out.push({ path: path.join("xdg", "tectonic", path.relative(base, full)), executable: false, data: await readFile(full) });
    }
  }
}

async function main(): Promise<void> {
  const [binPath, cacheArg] = process.argv.slice(2);
  if (!binPath) throw new Error("Uso: npm run pack-tectonic -- <binario> [<dir-cache-tectonic>]");
  const cacheDir = cacheArg ?? path.join(os.homedir(), ".cache", "tectonic");
  const entries: PackEntry[] = [{ path: "tectonic", executable: true, data: await readFile(binPath) }];
  await walk(path.join(cacheDir, "bundles"), cacheDir, entries);
  const out = path.join(process.cwd(), "vendor", "tectonic-linux-x64.pack");
  await mkdir(path.dirname(out), { recursive: true });
  const pack = encodePack(entries);
  await writeFile(out, pack);
  console.log(`${entries.length} archivos -> ${out} (${(pack.length / 1048576).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
