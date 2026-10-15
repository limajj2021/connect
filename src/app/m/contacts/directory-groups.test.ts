import { describe, expect, it } from "vitest";

import { type DirectoryContact, UNTAGGED, groupContacts } from "./directory-groups";

const c = (name: string, tags: string[], role = "unclassified"): DirectoryContact => ({
  id: name,
  name,
  company: null,
  title: null,
  role_type: role,
  is_important: false,
  tags,
  missing: 0,
  editUrl: "",
});

describe("groupContacts", () => {
  const list = [c("A", ["半導體"], "boss"), c("B", ["半導體", "扶輪社"]), c("C", []), c("D", ["扶輪社"], "non_boss"), c("E", ["半導體"])];

  it("groups by tag, biggest first, untagged last, multi-tag people in each", () => {
    const groups = groupContacts(list, "tag");
    expect(groups.map(([name, members]) => [name, members.map((m) => m.name)])).toEqual([
      ["半導體", ["A", "B", "E"]],
      ["扶輪社", ["B", "D"]],
      [UNTAGGED, ["C"]],
    ]);
  });

  it("groups by role in a fixed order", () => {
    expect(groupContacts(list, "role").map(([name]) => name)).toEqual(["老闆", "非老闆", "未分類"]);
  });

  it("lists important contacts only, longest without contact first", () => {
    const base = { company: null, title: null, role_type: "boss", tags: [], missing: 0, editUrl: "" };
    const list: DirectoryContact[] = [
      { ...base, id: "1", name: "甲", is_important: true, lastContactOn: "2026-10-01" },
      { ...base, id: "2", name: "乙", is_important: false, lastContactOn: null },
      { ...base, id: "3", name: "丙", is_important: true, lastContactOn: null },
      { ...base, id: "4", name: "丁", is_important: true, lastContactOn: "2026-08-01" },
    ];
    const groups = groupContacts(list, "important");
    expect(groups).toHaveLength(1);
    expect(groups[0][1].map((c) => c.name)).toEqual(["丙", "丁", "甲"]);
  });
});
