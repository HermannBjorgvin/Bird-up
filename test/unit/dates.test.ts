import { describe, expect, it } from "vitest";
import { addDays } from "../../src/core/dates";

describe("addDays", () => {
  it("adds days within a month", () => {
    expect(addDays("2026-06-12", 4)).toBe("2026-06-16");
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
