import { parseLineChatExport, type ParsedChat } from "./line-parser";
import { chatNameFromWhatsAppFileName, looksLikeWhatsAppExport, parseWhatsAppChatExport } from "./whatsapp-parser";

export type ChatSource = "line" | "whatsapp";

/** Picks the right parser from the file's content (WhatsApp timestamps, otherwise LINE). */
export function parseChatExport(raw: string, fileName: string): { parsed: ParsedChat; source: ChatSource } {
  const text = raw.replace(/^\ufeff/, "");
  if (looksLikeWhatsAppExport(text)) {
    return { parsed: parseWhatsAppChatExport(text, chatNameFromWhatsAppFileName(fileName)), source: "whatsapp" };
  }
  return { parsed: parseLineChatExport(text), source: "line" };
}
