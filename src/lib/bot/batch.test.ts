import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createBatch } from "./batch";

function fakeSupabase() {
  const inserted: Record<string, unknown>[][] = [];
  const options: unknown[] = [];
  const supabase = {
    from: () => ({
      insert: (rows: Record<string, unknown>[], opts: unknown) => {
        inserted.push(rows);
        options.push(opts);
        return { select: async () => ({ data: rows.map((r, i) => ({ id: `id${i}`, name: r.name })), error: null }) };
      },
    }),
  };
  return { supabase, inserted, options };
}

describe("createBatch", () => {
  it("gives every row the NOT NULL columns (bulk insert would otherwise null them)", async () => {
    const { supabase, inserted, options } = fakeSupabase();
    const ctx = { supabase, ownerId: "owner", lineUserId: "u" } as unknown as Parameters<typeof createBatch>[0];
    await createBatch(ctx, [
      { name: "王小明", role_type: "boss", notes: "x" },
      { name: "陳小美" },
      { name: "Leo", line_display_name: "Leo Chang" },
    ]);
    const rows = inserted[0];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.owner_id).toBe("owner");
      expect(row.role_type).toBeTruthy();
      expect(row.is_important).toBe(false);
      expect(row.festival_reminder_enabled).toBe(true);
    }
    expect(rows[0].role_type).toBe("boss");
    expect(rows[1].role_type).toBe("unclassified");
    expect(options[0]).toEqual({ defaultToNull: false });
  });
});
