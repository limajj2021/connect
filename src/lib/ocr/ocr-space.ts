import "server-only";

const OCR_SPACE_URL = process.env.OCR_SPACE_URL ?? "https://api.ocr.space/parse/image";
// The free OCR.space tier rejects files over 1 MB.
const MAX_BYTES = 1024 * 1024;

export function isOcrConfigured() {
  return Boolean(process.env.OCR_SPACE_API_KEY);
}

/** Shrinks large phone photos to fit the free tier's 1 MB limit. */
async function fitImage(image: ArrayBuffer): Promise<{ data: Buffer; mime: string }> {
  const input = Buffer.from(image);
  if (input.byteLength <= MAX_BYTES) return { data: input, mime: "image/jpeg" };
  try {
    const sharp = (await import("sharp")).default;
    for (const [width, quality] of [
      [1800, 80],
      [1400, 70],
      [1000, 60],
    ] as const) {
      const out = await sharp(input).rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality }).toBuffer();
      if (out.byteLength <= MAX_BYTES) return { data: out, mime: "image/jpeg" };
    }
  } catch {
    // sharp unavailable in this runtime — fall through and let the API decide.
  }
  return { data: input, mime: "image/jpeg" };
}

export type OcrResult = { ok: true; text: string } | { ok: false; error: string };

export async function ocrImage(image: ArrayBuffer): Promise<OcrResult> {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) return { ok: false, error: "尚未設定 OCR_SPACE_API_KEY" };

  const { data, mime } = await fitImage(image);
  const form = new FormData();
  form.set("base64Image", `data:${mime};base64,${data.toString("base64")}`);
  form.set("OCREngine", "2"); // Engine 2 reads Traditional Chinese with language auto-detect.
  form.set("language", "auto");
  form.set("scale", "true");
  form.set("detectOrientation", "true");

  try {
    const res = await fetch(OCR_SPACE_URL, {
      method: "POST",
      headers: { apikey: apiKey },
      body: form,
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) return { ok: false, error: `OCR 服務回應 ${res.status}` };
    const json = (await res.json()) as {
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string | string[];
      ParsedResults?: { ParsedText?: string }[];
    };
    if (json.IsErroredOnProcessing) {
      const message = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join(" ") : json.ErrorMessage;
      return { ok: false, error: message || "OCR 辨識失敗" };
    }
    const text = (json.ParsedResults ?? []).map((r) => r.ParsedText ?? "").join("\n").trim();
    return text ? { ok: true, text } : { ok: false, error: "圖片裡沒有讀到文字" };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.name === "TimeoutError" ? "OCR 逾時" : "OCR 服務連線失敗" };
  }
}
