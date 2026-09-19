import { describe, expect, it } from "vitest";
import { decodePack, encodePack } from "./tectonic-pack";

describe("tectonic-pack", () => {
  it("codifica y decodifica entradas conservando ruta, permiso y contenido", () => {
    const entries = [
      { path: "tectonic", executable: true, data: Buffer.from([0x7f, 0x45, 0x4c, 0x46]) },
      { path: "xdg/tectonic/bundles/data/ñ.index", executable: false, data: Buffer.from("hola") },
      { path: "vacio", executable: false, data: Buffer.alloc(0) },
    ];
    const back = decodePack(encodePack(entries));
    expect(back.map((e) => [e.path, e.executable, e.data.toString("hex")])).toEqual(
      entries.map((e) => [e.path, e.executable, e.data.toString("hex")]),
    );
  });

  it("rechaza un archivo que no es un paquete", () => {
    expect(() => decodePack(Buffer.from("no-es-un-pack"))).toThrow(/inválido/);
  });
});
