import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { setFestivalReminderEnabled } from "./festival-settings";

function fakeSupabase(result: { data: unknown; error: null }) {
  const calls: { op: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {
    update: (...a: unknown[]) => {
      calls.push({ op: "update", args: a });
      return chain;
    },
    eq: (...a: unknown[]) => {
      calls.push({ op: "eq", args: a });
      return chain;
    },
    in: (...a: unknown[]) => {
      calls.push({ op: "in", args: a });
      return chain;
    },
    select: (...a: unknown[]) => {
      calls.push({ op: "select", args: a });
      return chain;
    },
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return { supabase: { from: () => chain }, calls };
}

describe("setFestivalReminderEnabled", () => {
  it("bulk-updates the given contacts, deduped, scoped to the owner", async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: "a" }, { id: "b" }], error: null });
    const updated = await setFestivalReminderEnabled(
      { supabase: supabase as never, ownerId: "owner1" },
      ["a", "b", "a"],
      false,
    );
    expect(updated).toBe(2);
    expect(calls.find((c) => c.op === "update")?.args).toEqual([{ festival_reminder_enabled: false }]);
    expect(calls.find((c) => c.op === "in")?.args).toEqual(["id", ["a", "b"]]);
  });

  it("is a no-op with no ids (never touches the database)", async () => {
    const { supabase, calls } = fakeSupabase({ data: [], error: null });
    const updated = await setFestivalReminderEnabled({ supabase: supabase as never, ownerId: "owner1" }, [], true);
    expect(updated).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
