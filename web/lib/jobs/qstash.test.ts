import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mismo criterio ya usado en el repo (usage-quota.test.ts, #65; supabase-
 * storage-adapter.test.ts, #14): el SDK de QStash se mockea, nunca se llama
 * al servicio real -- ni siquiera hay una cuenta QStash provisionada
 * todavía (#22, pendiente).
 */
const mockPublishJSON = vi.fn().mockResolvedValue({ messageId: "msg-1" });
const mockVerify = vi.fn();

vi.mock("@upstash/qstash", () => ({
  Client: vi.fn(function Client() {
    return { publishJSON: mockPublishJSON };
  }),
  Receiver: vi.fn(function Receiver() {
    return { verify: mockVerify };
  }),
}));

const { publishInternalJob, verifyQstashRequest } = await import("@/lib/jobs/qstash");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.QSTASH_TOKEN = "qstash-token-test";
  process.env.QSTASH_CURRENT_SIGNING_KEY = "current-key-test";
  process.env.QSTASH_NEXT_SIGNING_KEY = "next-key-test";
  process.env.APP_BASE_URL = "https://update-cv.example.com";
  mockPublishJSON.mockClear();
  mockVerify.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("publishInternalJob", () => {
  // Este test va PRIMERO a propósito: getQStashClient() cachea el cliente
  // en una variable de módulo para toda la vida del proceso (igual patrón
  // que get-storage-adapter.ts) -- una vez que un test exitoso lo crea, el
  // resto ya no vuelve a leer QSTASH_TOKEN aunque se borre después.
  it("sin QSTASH_TOKEN configurado, lanza un error claro", async () => {
    delete process.env.QSTASH_TOKEN;
    await expect(publishInternalJob("/x", {})).rejects.toThrow(/QSTASH_TOKEN/);
  });

  it("publica con la URL absoluta (APP_BASE_URL + path) y el body dado", async () => {
    await publishInternalJob("/api/internal/jobs/analyze", { jobId: "job-1" });
    expect(mockPublishJSON).toHaveBeenCalledWith({
      url: "https://update-cv.example.com/api/internal/jobs/analyze",
      body: { jobId: "job-1" },
    });
  });

  it("quita la barra final de APP_BASE_URL si viene con una", async () => {
    process.env.APP_BASE_URL = "https://update-cv.example.com/";
    await publishInternalJob("/api/internal/jobs/generate", {});
    expect(mockPublishJSON).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://update-cv.example.com/api/internal/jobs/generate" }),
    );
  });
});

describe("publishInternalJob: URL base y bypass", () => {
  it("sin APP_BASE_URL usa VERCEL_URL del deployment", async () => {
    delete process.env.APP_BASE_URL;
    process.env.VERCEL_URL = "update-cv-abc.vercel.app";
    await publishInternalJob("/api/internal/jobs/analyze", {});
    expect(mockPublishJSON).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://update-cv-abc.vercel.app/api/internal/jobs/analyze" }),
    );
  });

  it("sin APP_BASE_URL ni VERCEL_URL, lanza un error claro", async () => {
    delete process.env.APP_BASE_URL;
    delete process.env.VERCEL_URL;
    await expect(publishInternalJob("/x", {})).rejects.toThrow(/APP_BASE_URL/);
  });

  it("con VERCEL_AUTOMATION_BYPASS_SECRET reenvía el header de bypass", async () => {
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "secreto-test";
    await publishInternalJob("/x", {});
    expect(mockPublishJSON).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { "x-vercel-protection-bypass": "secreto-test" } }),
    );
  });
});

function fakeRequest(body: string, signature: string | null): Request {
  const headers = new Headers();
  if (signature !== null) headers.set("upstash-signature", signature);
  return new Request("https://update-cv.example.com/api/internal/jobs/analyze", {
    method: "POST",
    headers,
    body,
  });
}

describe("verifyQstashRequest", () => {
  it("sin header Upstash-Signature, rechaza sin llamar al Receiver", async () => {
    const result = await verifyQstashRequest(fakeRequest("{}", null));
    expect(result).toEqual({ ok: false });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("firma inválida (Receiver.verify devuelve false), rechaza", async () => {
    mockVerify.mockResolvedValue(false);
    const result = await verifyQstashRequest(fakeRequest('{"jobId":"job-1"}', "sig-invalida"));
    expect(result).toEqual({ ok: false });
  });

  it("Receiver.verify lanza (firma corrupta/expirada), rechaza sin propagar la excepción", async () => {
    mockVerify.mockRejectedValue(new Error("signature expired"));
    const result = await verifyQstashRequest(fakeRequest('{"jobId":"job-1"}', "sig-vencida"));
    expect(result).toEqual({ ok: false });
  });

  it("firma válida, devuelve ok:true con el body ya parseado como JSON", async () => {
    mockVerify.mockResolvedValue(true);
    const result = await verifyQstashRequest(fakeRequest('{"jobId":"job-1","x":2}', "sig-valida"));
    expect(result).toEqual({ ok: true, body: { jobId: "job-1", x: 2 } });
  });

  it("verifica contra el body crudo (bytes) y la URL exacta -- no el objeto ya parseado, ni sin acotar a la URL", async () => {
    mockVerify.mockResolvedValue(true);
    const rawBody = '{"a":1}';
    await verifyQstashRequest(fakeRequest(rawBody, "sig-valida"));
    expect(mockVerify).toHaveBeenCalledWith({
      signature: "sig-valida",
      body: rawBody,
      url: "https://update-cv.example.com/api/internal/jobs/analyze",
    });
  });
});
