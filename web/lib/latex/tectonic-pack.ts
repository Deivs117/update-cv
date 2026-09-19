/**
 * Formato del paquete vendorizado de tectonic (binario + caché de bundles TeX):
 * "TTPK1" + brotli( entradas ), donde cada entrada es
 * [u16 largo de ruta][ruta utf8][u8 ejecutable][u32 tamaño][bytes].
 * Se prefiere a un .tar para no depender de `tar` en el runtime de Vercel.
 */
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";

export const PACK_MAGIC = "TTPK1";

export type PackEntry = { path: string; executable: boolean; data: Buffer };

export function encodePack(entries: PackEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    const p = Buffer.from(e.path, "utf8");
    const head = Buffer.alloc(2 + p.length + 1 + 4);
    head.writeUInt16BE(p.length, 0);
    p.copy(head, 2);
    head.writeUInt8(e.executable ? 1 : 0, 2 + p.length);
    head.writeUInt32BE(e.data.length, 3 + p.length);
    parts.push(head, e.data);
  }
  const body = brotliCompressSync(Buffer.concat(parts), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_LGWIN]: 24 },
  });
  return Buffer.concat([Buffer.from(PACK_MAGIC), body]);
}

export function decodePack(pack: Buffer): PackEntry[] {
  if (pack.subarray(0, PACK_MAGIC.length).toString() !== PACK_MAGIC) {
    throw new Error("Paquete de tectonic inválido (magic distinto de TTPK1).");
  }
  const raw = brotliDecompressSync(pack.subarray(PACK_MAGIC.length));
  const entries: PackEntry[] = [];
  let off = 0;
  while (off < raw.length) {
    const pl = raw.readUInt16BE(off);
    const p = raw.toString("utf8", off + 2, off + 2 + pl);
    const executable = raw.readUInt8(off + 2 + pl) === 1;
    const size = raw.readUInt32BE(off + 3 + pl);
    const start = off + 7 + pl;
    entries.push({ path: p, executable, data: raw.subarray(start, start + size) });
    off = start + size;
  }
  return entries;
}
