import "server-only";

import type { OcrLine } from "@/lib/bot/contact-list";

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

export type OcrResult = { ok: true; text: string; lines: OcrLine[] } | { ok: false; error: string };

interface OverlayLine {
  LineText?: string;
  MinTop?: number;
  MaxHeight?: number;
  Words?: { Left: number; Width: number }[];
}

/** Line positions (needed to tell a chat/friend list apart from a single card). */
function toLines(overlay: OverlayLine[]): OcrLine[] {
  return overlay
    .filter((l) => l.LineText && l.Words && l.Words.length > 0)
    .map((l) => ({
      text: l.LineText!.trim(),
      top: l.MinTop ?? 0,
      height: l.MaxHeight ?? 0,
      left: Math.min(...l.Words!.map((w) => w.Left)),
      right: Math.max(...l.Words!.map((w) => w.Left + w.Width)),
    }));
}

/** One OCR.space call. Engine 3 reads mixed Chinese/English best; 2 is faster. */
async function recognize(apiKey: string, image: { data: Buffer; mime: string }, engine: "2" | "3", timeoutMs: number): Promise<OcrResult> {
  const form = new FormData();
  form.set("base64Image", `data:${image.mime};base64,${image.data.toString("base64")}`);
  form.set("OCREngine", engine);
  form.set("language", "auto");
  form.set("scale", "true");
  form.set("detectOrientation", "true");
  form.set("isOverlayRequired", "true");

  try {
    const res = await fetch(OCR_SPACE_URL, {
      method: "POST",
      headers: { apikey: apiKey },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, error: `OCR 服務回應 ${res.status}` };
    const json = (await res.json()) as {
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string | string[];
      ParsedResults?: { ParsedText?: string; TextOverlay?: { Lines?: OverlayLine[] } }[];
    };
    if (json.IsErroredOnProcessing) {
      const message = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join(" ") : json.ErrorMessage;
      return { ok: false, error: message || "OCR 辨識失敗" };
    }
    const text = (json.ParsedResults ?? []).map((r) => r.ParsedText ?? "").join("\n").trim();
    const lines = toLines((json.ParsedResults ?? []).flatMap((r) => r.TextOverlay?.Lines ?? []));
    return text ? { ok: true, text, lines } : { ok: false, error: "圖片裡沒有讀到文字" };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.name === "TimeoutError" ? "OCR 逾時" : "OCR 服務連線失敗" };
  }
}

export async function ocrImage(image: ArrayBuffer): Promise<OcrResult> {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) return { ok: false, error: "尚未設定 OCR_SPACE_API_KEY" };

  const fitted = await fitImage(image);
  const best = await recognize(apiKey, fitted, "3", 25_000);
  if (best.ok) return best;
  console.warn("[ocr] engine 3 failed, falling back to engine 2:", best.error);
  return recognize(apiKey, fitted, "2", 20_000);
}
