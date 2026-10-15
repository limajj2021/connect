import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };

async function freshModule() {
  vi.resetModules();
  return import("./openrouter");
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body } as Response;
}

describe("aiComplete", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("is unconfigured without an API key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { isAiConfigured, aiComplete } = await freshModule();
    expect(isAiConfigured()).toBe(false);
    expect(await aiComplete("hi")).toEqual({ ok: false, error: "尚未設定 OPENROUTER_API_KEY" });
  });

  it("only sends ASCII header values (a Chinese X-Title throws in fetch)", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "祝你生日快樂！" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { aiComplete } = await freshModule();
    await aiComplete("hi");
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    for (const value of Object.values(headers)) expect(value).toMatch(/^[\x00-\xFF]*$/);
  });

  it("falls through to the next model on a non-ok response, and returns the first success", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: "rate limited" }))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: "王董，祝您生日快樂！🎉" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { aiComplete } = await freshModule();
    const result = await aiComplete("hi");
    expect(result).toEqual({ ok: true, text: "王董，祝您生日快樂！🎉" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a reply that slips into Simplified Chinese and tries the next model", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: "王董，生日快乐！" } }] }))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: "王董，生日快樂！" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { aiComplete } = await freshModule();
    const result = await aiComplete("hi");
    expect(result).toEqual({ ok: true, text: "王董，生日快樂！" });
  });

  it("rejects a meta/clarifying reply instead of the greeting itself", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: "這個稱呼會不會太正式？要不要我改一下？" } }] }))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: "王董，祝您生日快樂！🎉" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { aiComplete } = await freshModule();
    const result = await aiComplete("hi");
    expect(result).toEqual({ ok: true, text: "王董，祝您生日快樂！🎉" });
  });

  it("reports every model's failure when all of them fail", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(429, { error: "rate limited" })));
    const { aiComplete } = await freshModule();
    const result = await aiComplete("hi");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.split("；").length).toBeGreaterThan(1);
  });
});
