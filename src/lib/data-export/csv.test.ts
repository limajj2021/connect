import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

interface Row {
  name: string;
  note: string;
}

describe("toCsv", () => {
  it("starts with a UTF-8 BOM so Excel opens Traditional Chinese text correctly", () => {
    const csv = toCsv<Row>([], [{ key: "name", label: "姓名" }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("renders the header row from column labels", () => {
    const csv = toCsv<Row>([{ name: "王小明", note: "" }], [
      { key: "name", label: "姓名" },
      { key: "note", label: "備註" },
    ]);
    expect(csv).toContain("姓名,備註");
  });

  it("quotes a cell containing a comma", () => {
    const csv = toCsv<Row>([{ name: "王小明", note: "a,b" }], [{ key: "note", label: "備註" }]);
    expect(csv).toContain('"a,b"');
  });

  it("quotes and escapes a cell containing double quotes", () => {
    const csv = toCsv<Row>([{ name: "王小明", note: 'he said "hi"' }], [{ key: "note", label: "備註" }]);
    expect(csv).toContain('"he said ""hi"""');
  });

  it("quotes a cell containing a newline", () => {
    const csv = toCsv<Row>([{ name: "王小明", note: "line1\nline2" }], [{ key: "note", label: "備註" }]);
    expect(csv).toContain('"line1\nline2"');
  });

  it("renders null/undefined fields as empty cells, not the literal word", () => {
    const csv = toCsv<Row>(
      [{ name: "王小明", note: null as unknown as string }],
      [
        { key: "name", label: "姓名" },
        { key: "note", label: "備註" },
      ],
    );
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe("王小明,");
  });
});
