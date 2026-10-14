import JSZip from "jszip";

export interface ArchiveEntry {
  /** Name to show / store: the inner file name, or the zip's name for WhatsApp's generic "_chat.txt". */
  fileName: string;
  data: ArrayBuffer;
}

// Guards against zip bombs and accidental giant archives.
const MAX_TXT_FILES = 30;
const MAX_TOTAL_UNCOMPRESSED = 60 * 1024 * 1024;

/**
 * Pulls every chat .txt out of a .zip (LINE exports zipped together, or a
 * WhatsApp export which ships `_chat.txt` plus media). Media, hidden files
 * and macOS metadata are ignored.
 */
export async function extractChatTexts(zipData: ArrayBuffer, zipName: string): Promise<{ entries: ArchiveEntry[]; skipped: number }> {
  const zip = await JSZip.loadAsync(zipData);
  const candidates = Object.values(zip.files).filter((f) => {
    const base = f.name.replace(/^.*\//, "");
    return !f.dir && !f.name.startsWith("__MACOSX/") && !base.startsWith(".") && base.toLowerCase().endsWith(".txt");
  });

  const entries: ArchiveEntry[] = [];
  let total = 0;
  for (const file of candidates.slice(0, MAX_TXT_FILES)) {
    const data = await file.async("arraybuffer");
    total += data.byteLength;
    if (total > MAX_TOTAL_UNCOMPRESSED) break;
    const base = file.name.replace(/^.*\//, "");
    // WhatsApp names the chat only in the zip / folder name ("WhatsApp Chat - Kenny").
    const folder = file.name.includes("/") ? file.name.split("/").slice(-2, -1)[0] : null;
    const generic = base === "_chat.txt" ? `${folder ?? zipName.replace(/\.zip$/i, "")}.txt` : base;
    entries.push({ fileName: generic, data });
  }
  return { entries, skipped: candidates.length - entries.length };
}
