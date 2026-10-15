import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deleteTag, mergeTags, renameTag } from "./manage";

/**
 * A fake Supabase client: `from(table)` returns a chainable builder. Each
 * call is recorded; a response queue per "table:op" key is consumed in
 * order (so the same table/op called twice in one function gets its two
 * configured answers in sequence).
 */
function fakeSupabase(responses: Record<string, unknown[]>) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const queues = Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, [...v]]));

  function builder(table: string) {
    // The "primary" op is whichever write method was called (update/upsert/delete),
    // or "select" for a pure read — a trailing .select() for RETURNING after a
    // write must NOT reclassify the call as a read.
    let op = "select";
    let opLocked = false;
    const mark = (name: string, args: unknown[], isWrite: boolean) => {
      calls.push({ table, op: name, args });
      if (isWrite && !opLocked) {
        op = name;
        opLocked = true;
      }
      return chain;
    };
    const resolve = () => {
      const key = `${table}:${op}`;
      const next = queues[key]?.shift();
      return next ?? { data: null, error: null };
    };
    const chain: Record<string, unknown> = {
      select: (...a: unknown[]) => mark("select", a, false),
      eq: (...a: unknown[]) => mark("eq", a, false),
      in: (...a: unknown[]) => mark("in", a, false),
      update: (...a: unknown[]) => mark("update", a, true),
      upsert: (...a: unknown[]) => mark("upsert", a, true),
      delete: (...a: unknown[]) => mark("delete", a, true),
      single: async () => resolve(),
      then: (res: (v: unknown) => void) => res(resolve()),
    };
    return chain;
  }

  return { supabase: { from: builder }, calls };
}

describe("renameTag", () => {
  it("trims the name and updates by id, scoped to the owner", async () => {
    const { supabase, calls } = fakeSupabase({
      "industries:update": [{ data: { id: "t1", name: "半導體" }, error: null }],
    });
    const result = await renameTag({ supabase: supabase as never, ownerId: "owner1" }, "t1", "  半導體  ");
    expect(result.name).toBe("半導體");
    expect(calls.find((c) => c.op === "update")?.args).toEqual([{ name: "半導體" }]);
  });

  it("rejects a blank name without calling the database", async () => {
    const { supabase, calls } = fakeSupabase({});
    await expect(renameTag({ supabase: supabase as never, ownerId: "owner1" }, "t1", "   ")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("deleteTag", () => {
  it("deletes by id, scoped to the owner", async () => {
    const { supabase, calls } = fakeSupabase({ "industries:delete": [{ error: null }] });
    await deleteTag({ supabase: supabase as never, ownerId: "owner1" }, "t1");
    const del = calls.find((c) => c.op === "delete");
    expect(del).toBeTruthy();
  });
});

describe("mergeTags", () => {
  it("upserts the target tag, moves every contact onto it (deduping), and removes the source tags", async () => {
    const { supabase, calls } = fakeSupabase({
      "industries:upsert": [{ data: { id: "target", name: "客戶" }, error: null }],
      "contact_industries:select": [
        { data: [{ contact_id: "c1" }, { contact_id: "c2" }], error: null }, // who had the old tags
        { data: [{ contact_id: "c1" }, { contact_id: "c2" }, { contact_id: "c3" }], error: null }, // final count
      ],
      "contact_industries:upsert": [{ error: null }],
      "industries:delete": [{ error: null }],
    });
    const result = await mergeTags({ supabase: supabase as never, ownerId: "owner1" }, ["old1", "old2", "target"], "客戶");
    expect(result).toEqual({ id: "target", name: "客戶", contactCount: 3 });

    const relink = calls.find((c) => c.table === "contact_industries" && c.op === "upsert");
    expect(relink?.args[0]).toEqual([
      { contact_id: "c1", industry_id: "target" },
      { contact_id: "c2", industry_id: "target" },
    ]);
    expect((relink?.args[1] as { ignoreDuplicates?: boolean })?.ignoreDuplicates).toBe(true);

    // The target itself is never deleted, only the other (merged-away) tags.
    const del = calls.find((c) => c.table === "industries" && c.op === "in");
    expect(del?.args).toEqual(["id", ["old1", "old2"]]);
  });

  it("rejects an empty target name without touching the database", async () => {
    const { supabase, calls } = fakeSupabase({});
    await expect(mergeTags({ supabase: supabase as never, ownerId: "owner1" }, ["a", "b"], "   ")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
