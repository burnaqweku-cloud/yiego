import { describe, expect, it } from "vitest";
import { csvCell, csvText } from "./csv";

describe("csv export", () => {
  it("turns formula-looking text into plain text", () => {
    expect(csvCell("=HYPERLINK(\"http://x\",\"pay\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\",\"\"pay\"\")\"");
    expect(csvCell("@SUM(A1:A9)")).toBe("\"'@SUM(A1:A9)\"");
    expect(csvCell("+cmd|' /C calc'!A0")).toBe("\"'+cmd|' /C calc'!A0\"");
    expect(csvCell("-2+3")).toBe("\"'-2+3\"");
  });
  it("leaves ordinary values and numbers alone", () => {
    expect(csvCell("Ama Mensah")).toBe("\"Ama Mensah\"");
    expect(csvCell("-12.50")).toBe("\"-12.50\"");
    expect(csvCell(-3)).toBe("\"-3\"");
    expect(csvCell("+233241234567")).toBe("\"+233241234567\"");
    expect(csvCell(null)).toBe("\"\"");
  });
  it("keeps quotes inside a cell and joins rows", () => {
    expect(csvText([["a", "b"], ["say \"hi\"", 2]])).toBe("\"a\",\"b\"\n\"say \"\"hi\"\"\",\"2\"");
  });
});
