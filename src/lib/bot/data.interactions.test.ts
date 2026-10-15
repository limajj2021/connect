import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInteraction, lastTouchesFor } from "./data";

/** A minimal chainable query builder that resolves to `{ data, error: null }`. */
function chainable(data: unknown) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    insert: (row: unknown) => {
      inserted.push(row);
      return Promise.resolve({ error: null });
    },
    then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data, error: null }),
  };
  const inserted: unknown[] = [];
  (builder as { inserted: unknown[] }).inserted = inserted;
  return builder;
}

describe("createInteraction", () => {
  it("inserts one owner-scoped row", async () => {
    const builder = chainable([]);
    const supabase = { from: () => builder };
    await createInteraction({ supabase, ownerId: "owner1" } as never, "contact1", "聊到他想換工作", "2026-10-15");
    expect((builder as { inserted: unknown[] }).inserted).toEqual([
      {
        owner_id: "owner1",
        contact_id: "contact1",
        occurred_on: "2026-10-15",
        content: "聊到他想換工作",
        kind: "chat",
        source_url: null,
        chat_import_id: null,
      },
    ]);
  });

  it("records a post with its link", async () => {
    const builder = chainable([]);
    const supabase = { from: () => builder };
    await createInteraction({ supabase, ownerId: "owner1" } as never, "c1", "升任副總", "2026-10-15", { kind: "post", sourceUrl: "https://x.test/p" });
    expect((builder as { inserted: { kind: string; source_url: string }[] }).inserted[0]).toMatchObject({ kind: "post", source_url: "https://x.test/p" });
  });
});

describe("lastTouchesFor", () => {
  it("keeps only the newest row per contact (rows arrive newest-first)", async () => {
    const rows = [
      { contact_id: "a", occurred_on: "2026-10-15", content: "最新的 a" },
      { contact_id: "a", occurred_on: "2026-10-01", content: "較舊的 a" },
      { contact_id: "b", occurred_on: "2026-09-20", content: "b 的唯一一筆" },
    ];
    const supabase = { from: () => chainable(rows) };
    const map = await lastTouchesFor({ supabase, ownerId: "owner1" } as never, ["a", "b"]);
    expect(map.get("a")).toEqual({ occurred_on: "2026-10-15", content: "最新的 a" });
    expect(map.get("b")).toEqual({ occurred_on: "2026-09-20", content: "b 的唯一一筆" });
  });

  it("returns an empty map without querying when no ids are given", async () => {
    const supabase = { from: vi.fn() };
    const map = await lastTouchesFor({ supabase, ownerId: "owner1" } as never, []);
    expect(map.size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
