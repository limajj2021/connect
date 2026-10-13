import { describe, expect, it } from "vitest";

import type { ChatMessageRow } from "@/types/database";

import { chunkMessages } from "./chunk";

function makeMessage(overrides: Partial<ChatMessageRow> & { id: string; text: string }): ChatMessageRow {
  return {
    id: overrides.id,
    chat_import_id: "import-1",
    speaker_display_name: overrides.speaker_display_name ?? "王小明",
    contact_id: null,
    message_text: overrides.text,
    message_type: "text",
    sent_at: overrides.sent_at ?? "2026-01-01T06:00:00+00:00",
    sequence_no: overrides.sequence_no ?? 1,
    raw_line_ref: 1,
    dedupe_hash: null,
    is_analyzed: false,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("chunkMessages", () => {
  it("keeps all messages in one chunk when under both limits", () => {
    const messages = [makeMessage({ id: "a", text: "嗨" }), makeMessage({ id: "b", text: "你好" })];
    const chunks = chunkMessages(messages);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].messages).toHaveLength(2);
  });

  it("assigns sequential, chunk-local ref numbers across chunk boundaries", () => {
    const messages = Array.from({ length: 5 }, (_, i) => makeMessage({ id: `m${i}`, text: "x" }));
    const chunks = chunkMessages(messages, { maxMessages: 2 });
    expect(chunks).toHaveLength(3);
    const allRefs = chunks.flatMap((c) => c.messages.map((m) => m.ref));
    expect(allRefs).toEqual([0, 1, 2, 3, 4]);
  });

  it("splits into a new chunk once the message-count limit is reached", () => {
    const messages = Array.from({ length: 4 }, (_, i) => makeMessage({ id: `m${i}`, text: "x" }));
    const chunks = chunkMessages(messages, { maxMessages: 2, maxChars: 1_000_000 });
    expect(chunks.map((c) => c.messages.length)).toEqual([2, 2]);
  });

  it("splits into a new chunk once the character budget would be exceeded", () => {
    const longText = "a".repeat(100);
    const messages = [
      makeMessage({ id: "a", text: longText }),
      makeMessage({ id: "b", text: longText }),
      makeMessage({ id: "c", text: longText }),
    ];
    const chunks = chunkMessages(messages, { maxChars: 150, maxMessages: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const totalChars = chunk.messages.reduce((sum, m) => sum + m.text.length, 0);
      expect(totalChars).toBeLessThanOrEqual(250); // first message in a chunk may alone exceed the budget
    }
  });

  it("preserves the original database id for mapping extraction refs back", () => {
    const messages = [makeMessage({ id: "real-uuid-123", text: "測試" })];
    const chunks = chunkMessages(messages);
    expect(chunks[0].messages[0].id).toBe("real-uuid-123");
  });

  it("returns no chunks for an empty message list", () => {
    expect(chunkMessages([])).toEqual([]);
  });
});
