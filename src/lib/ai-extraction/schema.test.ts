import { describe, expect, it } from "vitest";

import { extractionResponseSchema } from "./schema";

describe("extractionResponseSchema", () => {
  it("accepts a well-formed response with one item per category", () => {
    const result = extractionResponseSchema.safeParse({
      items: [
        {
          category: "person",
          title: "王小明",
          companyName: "ABC 公司",
          jobTitle: "業務經理",
          sourceMessageRefs: [0],
          confidence: "confirmed",
        },
        {
          category: "todo",
          title: "寄送提案",
          assignee: "我",
          dueDate: "2026-03-01",
          sourceMessageRefs: [2, 3],
          confidence: "needs_review",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an item with an unknown category", () => {
    const result = extractionResponseSchema.safeParse({
      items: [{ category: "unknown_thing", title: "x", sourceMessageRefs: [0], confidence: "confirmed" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an item with no source message references", () => {
    const result = extractionResponseSchema.safeParse({
      items: [{ category: "topic", title: "x", sourceMessageRefs: [], confidence: "confirmed" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid confidence value", () => {
    const result = extractionResponseSchema.safeParse({
      items: [{ category: "fact", title: "x", sourceMessageRefs: [0], confidence: "very_sure" }],
    });
    expect(result.success).toBe(false);
  });

  it("allows relatedContactName to be explicitly null when uncertain", () => {
    const result = extractionResponseSchema.safeParse({
      items: [
        {
          category: "date_event",
          title: "下次見面",
          relatedContactName: null,
          eventDate: null,
          sourceMessageRefs: [1],
          confidence: "needs_review",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed dueDate that isn't YYYY-MM-DD", () => {
    const result = extractionResponseSchema.safeParse({
      items: [
        {
          category: "todo",
          title: "x",
          dueDate: "next Friday",
          sourceMessageRefs: [0],
          confidence: "needs_review",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty items array", () => {
    const result = extractionResponseSchema.safeParse({ items: [] });
    expect(result.success).toBe(true);
  });
});
